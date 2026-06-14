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

import paho.mqtt.client as mqtt
import dynamic_reconfigure.client

STATE_TOPIC = "scheduler/state"
CMD_TOPIC = "scheduler/cmd"

ACTION_START = "mower_logic:idle/start_mowing"
ACTION_HOME = "mower_logic:idle/go_home"


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
        self._schedule = []  # list of {id, days:[0-6 Mon..Sun], start:"HH:MM", end:"HH:MM"|None, enabled}
        self._auto_mode = None  # int 0/1/2, from dynamic_reconfigure
        self._last_fired = {}  # entry_id+kind -> "YYYY-MM-DD HH:MM" to debounce within the minute
        self._load()

        # ROS: publish actions the same way the web UI does
        self._action_pub = rospy.Publisher("xbot/action", String, queue_size=1)

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
                json.dump({"enabled": self._enabled, "schedule": self._schedule}, f, indent=2)
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
            except Exception:
                rate.sleep()

    def _on_config(self, config):
        with self._lock:
            self._auto_mode = int(config.get("automatic_mode", self._auto_mode or 0))
        self._publish_state()

    def _set_auto_mode(self, mode):
        mode = max(0, min(2, int(mode)))
        if self._dyn_client is None:
            rospy.logwarn("mower_scheduler: dynamic_reconfigure not ready, cannot set automatic_mode")
            return
        try:
            self._dyn_client.update_configuration({"automatic_mode": mode})
            rospy.loginfo(f"mower_scheduler: set automatic_mode={mode}")
        except Exception as e:
            rospy.logwarn(f"mower_scheduler: failed to set automatic_mode: {e}")

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
            elif cmd == "trigger_now":
                self._fire(ACTION_HOME if data.get("action") == "home" else ACTION_START)
        self._publish_state()

    def _publish_state(self):
        state = {
            "enabled": self._enabled,
            "auto_mode": self._auto_mode,
            "schedule": self._schedule,
            "ts": datetime.now().isoformat(timespec="seconds"),
        }
        try:
            self._mqtt.publish(STATE_TOPIC, json.dumps(state), retain=True)
        except Exception:
            pass

    # ----- scheduling -----
    def _fire(self, action):
        rospy.loginfo(f"mower_scheduler: firing action {action}")
        self._action_pub.publish(String(data=action))

    def _tick(self, _event):
        if not self._enabled:
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
                if entry.get("end") and entry.get("end") == hhmm:
                    key = f"{entry.get('id')}:end"
                    if self._last_fired.get(key) != stamp:
                        self._last_fired[key] = stamp
                        self._fire(ACTION_HOME)

    def run(self):
        rospy.spin()


if __name__ == "__main__":
    MowerScheduler().run()
