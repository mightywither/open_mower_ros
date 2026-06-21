#!/usr/bin/env python3
"""
mower_scheduler — time-based mowing schedule + automatic-mode control.

Bridges the web UI (over MQTT) and the robot:
  - publishes/retains the current schedule + automatic_mode on `scheduler/state`
  - accepts commands on `scheduler/cmd`
  - triggers mowing/docking at scheduled times by publishing on the ROS
    `xbot/action` topic (the same one the web UI drives over MQTT)
  - reads/writes the `automatic_mode` dynamic_reconfigure parameter of
    /mower_logic

The schedule is persisted to $PARAMS_PATH/mower_scheduler.json (defaults to
/data/params) so it survives restarts without a rebuild.
"""

import json
import os
import threading
from datetime import datetime, timedelta

import rospy
from std_msgs.msg import String
from mower_msgs.msg import HighLevelStatus

import paho.mqtt.client as mqtt
import dynamic_reconfigure.client

STATE_TOPIC = "scheduler/state"
CMD_TOPIC = "scheduler/cmd"

ACTION_START = "mower_logic:idle/start_mowing"
ACTION_HOME = "mower_logic:idle/go_home"
ACTION_SKIP_AREA = "mower_logic:mowing/skip_area"

# dynamic_reconfigure params we expose/control, with their valid ranges.
PARAM_RANGES = {
    "automatic_mode": (0, 2),
    "rain_mode": (0, 3),
}


def params_path():
    base = os.environ.get("PARAMS_PATH", "/data/params")
    return os.path.join(base, "mower_scheduler.json")


class MowerScheduler:
    def __init__(self):
        rospy.init_node("mower_scheduler")

        self._lock = threading.Lock()
        self._broker_host = rospy.get_param("~broker_host", "127.0.0.1")
        self._broker_port = rospy.get_param("~broker_port", 1883)

        # Persisted state
        self._enabled = True
        # schedule entry: {id, days:[0-6 Mon..Sun], start:"HH:MM", end:"HH:MM"|None,
        #                  enabled, area_index:int|null, area_name:str}
        self._schedule = []
        self._auto_mode = None  # int 0/1/2, from dynamic_reconfigure
        self._rain_mode = None  # int 0/1/2/3, from dynamic_reconfigure
        # Desired dynamic_reconfigure params (name->value), persisted and
        # re-applied on (re)connect so the mode survives a mower_logic respawn.
        self._desired_params = {}
        self._last_fired = {}  # entry_id+kind -> "YYYY-MM-DD HH:MM" to debounce within the minute

        # Live area tracking from mower_logic/current_state, for area_index targeting.
        self._current_area = -1
        self._target_area = None  # int | None — area_index we are driving toward
        self._last_skipped_from = None  # area we last issued a skip from (debounce)
        self._load()

        # ROS: publish actions the same way the web UI does
        self._action_pub = rospy.Publisher("xbot/action", String, queue_size=1)
        rospy.Subscriber(
            "mower_logic/current_state", HighLevelStatus, self._on_status, queue_size=10
        )

        # dynamic_reconfigure client for automatic_mode (connect in background)
        self._dyn_client = None
        threading.Thread(target=self._connect_dynreconf, daemon=True).start()

        # MQTT
        self._mqtt = mqtt.Client()
        self._mqtt.on_connect = self._on_mqtt_connect
        self._mqtt.on_message = self._on_mqtt_message
        self._connect_mqtt()

        # Periodic schedule check
        rospy.Timer(rospy.Duration(20), self._tick)
        rospy.loginfo("mower_scheduler: started")

    # ----- persistence -----
    def _load(self):
        try:
            with open(params_path()) as f:
                data = json.load(f)
            self._enabled = bool(data.get("enabled", True))
            self._schedule = data.get("schedule", [])
            self._desired_params = data.get("desired_params", {})
            rospy.loginfo(f"mower_scheduler: loaded schedule ({len(self._schedule)} entries)")
        except FileNotFoundError:
            pass
        except Exception as e:
            rospy.logwarn(f"mower_scheduler: could not load schedule: {e}")

    def _save(self):
        path = params_path()
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                json.dump(
                    {
                        "enabled": self._enabled,
                        "schedule": self._schedule,
                        "desired_params": self._desired_params,
                    },
                    f,
                    indent=2,
                )
        except Exception as e:
            rospy.logwarn(f"mower_scheduler: could not save schedule: {e}")

    # ----- dynamic_reconfigure -----
    def _connect_dynreconf(self):
        rate = rospy.Rate(0.2)  # retry every 5s
        while not rospy.is_shutdown() and self._dyn_client is None:
            try:
                self._dyn_client = dynamic_reconfigure.client.Client(
                    "/mower_logic", timeout=5, config_callback=self._on_config
                )
                rospy.loginfo("mower_scheduler: connected to /mower_logic dynamic_reconfigure")
                # Re-apply persisted params (mode survives a mower_logic respawn).
                with self._lock:
                    desired = dict(self._desired_params)
                for name, value in desired.items():
                    try:
                        self._dyn_client.update_configuration({name: value})
                        rospy.loginfo(f"mower_scheduler: re-applied {name}={value}")
                    except Exception as e:
                        rospy.logwarn(f"mower_scheduler: could not re-apply {name}: {e}")
            except Exception:
                rate.sleep()

    def _on_config(self, config):
        with self._lock:
            self._auto_mode = int(config.get("automatic_mode", self._auto_mode or 0))
            self._rain_mode = int(config.get("rain_mode", self._rain_mode or 0))
        self._publish_state()

    def _set_param(self, name, value):
        if name not in PARAM_RANGES:
            rospy.logwarn(f"mower_scheduler: refusing to set unknown param '{name}'")
            return
        lo, hi = PARAM_RANGES[name]
        value = max(lo, min(hi, int(value)))
        # Remember the desired value so it persists and is re-applied on respawn.
        self._desired_params[name] = value
        self._save()
        if self._dyn_client is None:
            rospy.logwarn(f"mower_scheduler: dynamic_reconfigure not ready, will apply {name} on connect")
            return
        try:
            self._dyn_client.update_configuration({name: value})
            rospy.loginfo(f"mower_scheduler: set {name}={value}")
        except Exception as e:
            rospy.logwarn(f"mower_scheduler: failed to set {name}: {e}")

    def _set_auto_mode(self, mode):
        self._set_param("automatic_mode", mode)

    # ----- MQTT -----
    def _connect_mqtt(self):
        try:
            self._mqtt.connect(self._broker_host, self._broker_port, keepalive=30)
            self._mqtt.loop_start()
        except Exception as e:
            rospy.logwarn(f"mower_scheduler: MQTT connect failed ({e}); retrying in 5s")
            threading.Timer(5.0, self._connect_mqtt).start()

    def _on_mqtt_connect(self, client, userdata, flags, rc):
        rospy.loginfo("mower_scheduler: MQTT connected")
        client.subscribe(CMD_TOPIC)
        self._publish_state()

    def _on_mqtt_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            return
        cmd = data.get("cmd")
        with self._lock:
            if cmd == "set_schedule":
                self._schedule = data.get("schedule", [])
                self._save()
            elif cmd == "set_enabled":
                self._enabled = bool(data.get("enabled", True))
                self._save()
            elif cmd == "set_auto_mode":
                self._set_auto_mode(data.get("mode", 0))
            elif cmd == "set_param":
                self._set_param(data.get("name", ""), data.get("value", 0))
            elif cmd == "trigger_now":
                self._fire(ACTION_HOME if data.get("action") == "home" else ACTION_START)
        self._publish_state()

    def _publish_state(self):
        state = {
            "enabled": self._enabled,
            "auto_mode": self._auto_mode,
            "automatic_mode": self._auto_mode,
            "rain_mode": self._rain_mode,
            "schedule": self._schedule,
            "ts": datetime.now().isoformat(timespec="seconds"),
        }
        try:
            self._mqtt.publish(STATE_TOPIC, json.dumps(state), retain=True)
        except Exception:
            pass

    # ----- area targeting -----
    def _on_status(self, msg):
        """Track current mow-area and, when targeting a specific area_index,
        issue skip_area until we reach it.

        The robot starts mowing at area 0 and advances sequentially; skip_area
        moves to the next area. We debounce so we issue at most one skip per
        area advance (keyed on the area we are skipping *from*)."""
        with self._lock:
            self._current_area = int(msg.current_area)
            target = self._target_area
            if target is None:
                return
            cur = self._current_area
            if cur < 0:
                # Not in a mowing area yet (e.g. still transitioning); wait.
                return
            if cur >= target:
                # Reached (or passed) the requested area: stop skipping.
                if cur > target:
                    rospy.logwarn(
                        f"mower_scheduler: passed target area {target} (now {cur}); clearing target"
                    )
                else:
                    rospy.loginfo(f"mower_scheduler: reached target area {target}")
                self._target_area = None
                self._last_skipped_from = None
                return
            # cur < target: need to skip forward. One skip per area advance.
            if self._last_skipped_from != cur:
                self._last_skipped_from = cur
                rospy.loginfo(
                    f"mower_scheduler: at area {cur}, skipping toward target {target}"
                )
                self._fire(ACTION_SKIP_AREA)

    def _start_area_target(self, area_index):
        """Begin driving to a specific mow-area index after start_mowing."""
        if area_index is None:
            self._target_area = None
            return
        try:
            self._target_area = int(area_index)
        except (TypeError, ValueError):
            self._target_area = None
            return
        self._last_skipped_from = None
        rospy.loginfo(f"mower_scheduler: targeting mow-area index {self._target_area}")

    # ----- scheduling -----
    def _fire(self, action):
        rospy.loginfo(f"mower_scheduler: firing action {action}")
        self._action_pub.publish(String(data=action))

    def _tick(self, _event):
        if not self._enabled:
            return
        # The schedule only makes sense in MANUAL mode: in Semi-auto/Auto the
        # robot manages itself (one cycle / continuous loop), so scheduled
        # triggers would conflict. None = mode unknown yet -> don't fire.
        if self._auto_mode != 0:
            return
        now = datetime.now()
        weekday = now.weekday()  # 0=Mon..6=Sun
        hhmm = now.strftime("%H:%M")
        stamp = now.strftime("%Y-%m-%d %H:%M")
        with self._lock:
            for entry in self._schedule:
                if not entry.get("enabled", True):
                    continue
                if weekday not in entry.get("days", []):
                    continue
                if entry.get("start") == hhmm:
                    key = f"{entry.get('id')}:start"
                    if self._last_fired.get(key) != stamp:
                        self._last_fired[key] = stamp
                        self._fire(ACTION_START)
                        # Optional: drive to a specific mow-area for this entry.
                        # area_index null => normal full mow (no targeting).
                        self._start_area_target(entry.get("area_index"))
                if entry.get("end") and entry.get("end") == hhmm:
                    key = f"{entry.get('id')}:end"
                    if self._last_fired.get(key) != stamp:
                        self._last_fired[key] = stamp
                        self._target_area = None  # stop any area targeting
                        self._fire(ACTION_HOME)

    def run(self):
        rospy.spin()


if __name__ == "__main__":
    MowerScheduler().run()
