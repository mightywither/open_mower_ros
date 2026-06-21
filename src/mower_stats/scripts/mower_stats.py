#!/usr/bin/env python3
"""
mower_stats — logs mowing sessions and publishes mowing statistics over MQTT.

Subscribes to `mower_logic/current_state` (mower_msgs/HighLevelStatus): when the
high-level state enters "MOWING" a session start is recorded, and when it leaves
the session duration is appended to the persisted log.

Sessions are persisted to $PARAMS_PATH/mower_stats.json (defaults to /data/params)
so they survive restarts without a rebuild. A rolled-up summary is published —
RETAINED — on `stats/json` via paho MQTT, on connect and after every change.

stats/json payload (shared MQTT contract):
  {
    "totals": {"today_s": int, "week_s": int, "total_s": int, "sessions": int},
    "history": [{"date": "YYYY-MM-DD", "duration_s": int}, ...],   # last ~14 days
    "current": {"mowing": bool, "session_start_iso": str | null}
  }
"""

import json
import os
import threading
from datetime import datetime, timedelta

import rospy
from mower_msgs.msg import HighLevelStatus

import paho.mqtt.client as mqtt

STATS_TOPIC = "stats/json"

MOWING_STATE = "MOWING"
HISTORY_DAYS = 14


def params_path():
    base = os.environ.get("PARAMS_PATH", "/data/params")
    return os.path.join(base, "mower_stats.json")


class MowerStats:
    def __init__(self):
        rospy.init_node("mower_stats")

        self._lock = threading.Lock()
        self._broker_host = rospy.get_param("~broker_host", "127.0.0.1")
        self._broker_port = rospy.get_param("~broker_port", 1883)

        # Persisted state: a list of completed sessions
        #   {"start_iso": str, "end_iso": str, "duration_s": int}
        self._sessions = []
        # In-progress session (not yet persisted)
        self._session_start = None  # datetime | None
        self._mowing = False
        self._load()

        self._mqtt = mqtt.Client()
        self._mqtt.on_connect = self._on_mqtt_connect
        self._connect_mqtt()

        rospy.Subscriber(
            "mower_logic/current_state", HighLevelStatus, self._on_status, queue_size=10
        )
        rospy.loginfo("mower_stats: started")

    # ----- persistence -----
    def _load(self):
        try:
            with open(params_path()) as f:
                data = json.load(f)
            self._sessions = data.get("sessions", [])
            rospy.loginfo(f"mower_stats: loaded {len(self._sessions)} sessions")
        except FileNotFoundError:
            pass
        except Exception as e:
            rospy.logwarn(f"mower_stats: could not load sessions: {e}")

    def _save(self):
        path = params_path()
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                json.dump({"sessions": self._sessions}, f, indent=2)
        except Exception as e:
            rospy.logwarn(f"mower_stats: could not save sessions: {e}")

    # ----- MQTT -----
    def _connect_mqtt(self):
        try:
            self._mqtt.connect(self._broker_host, self._broker_port, keepalive=30)
            self._mqtt.loop_start()
        except Exception as e:
            rospy.logwarn(f"mower_stats: MQTT connect failed ({e}); retrying in 5s")
            threading.Timer(5.0, self._connect_mqtt).start()

    def _on_mqtt_connect(self, client, userdata, flags, rc):
        rospy.loginfo("mower_stats: MQTT connected")
        self._publish_stats()

    # ----- session tracking -----
    def _on_status(self, msg):
        # Only count time while actually mowing — not while latched in an
        # emergency/error (the robot is stopped even if the behavior is still
        # nominally "MOWING").
        is_mowing = msg.state_name == MOWING_STATE and not msg.emergency
        changed = False
        with self._lock:
            if is_mowing and not self._mowing:
                # Entering MOWING: record session start.
                self._session_start = datetime.now()
                self._mowing = True
                changed = True
                rospy.loginfo("mower_stats: mowing session started")
            elif not is_mowing and self._mowing:
                # Leaving MOWING: close out the session.
                self._close_session()
                self._mowing = False
                changed = True
        if changed:
            self._publish_stats()

    def _close_session(self):
        if self._session_start is None:
            return
        end = datetime.now()
        duration_s = int((end - self._session_start).total_seconds())
        if duration_s > 0:
            self._sessions.append(
                {
                    "start_iso": self._session_start.isoformat(timespec="seconds"),
                    "end_iso": end.isoformat(timespec="seconds"),
                    "duration_s": duration_s,
                }
            )
            self._save()
            rospy.loginfo(f"mower_stats: mowing session ended ({duration_s}s)")
        self._session_start = None

    # ----- aggregation -----
    def _compute_stats(self):
        now = datetime.now()
        today = now.date()
        week_start = today - timedelta(days=today.weekday())  # Monday

        today_s = 0
        week_s = 0
        total_s = 0
        per_day = {}  # date -> seconds

        for sess in self._sessions:
            try:
                start = datetime.fromisoformat(sess["start_iso"])
            except Exception:
                continue
            d = sess.get("duration_s", 0)
            total_s += d
            sd = start.date()
            per_day[sd] = per_day.get(sd, 0) + d
            if sd == today:
                today_s += d
            if sd >= week_start:
                week_s += d

        sessions_count = len(self._sessions)

        # Include the in-progress session (live) in the rolled-up numbers.
        if self._session_start is not None:
            live = int((now - self._session_start).total_seconds())
            if live > 0:
                total_s += live
                today_s += live
                week_s += live
                per_day[today] = per_day.get(today, 0) + live

        # Daily history for the last HISTORY_DAYS days (oldest -> newest).
        history = []
        for i in range(HISTORY_DAYS - 1, -1, -1):
            d = today - timedelta(days=i)
            history.append({"date": d.isoformat(), "duration_s": per_day.get(d, 0)})

        return {
            "totals": {
                "today_s": today_s,
                "week_s": week_s,
                "total_s": total_s,
                "sessions": sessions_count,
            },
            "history": history,
            "current": {
                "mowing": self._mowing,
                "session_start_iso": (
                    self._session_start.isoformat(timespec="seconds")
                    if self._session_start is not None
                    else None
                ),
            },
        }

    def _publish_stats(self):
        with self._lock:
            stats = self._compute_stats()
        try:
            self._mqtt.publish(STATS_TOPIC, json.dumps(stats), retain=True)
        except Exception:
            pass

    def run(self):
        # Refresh the live "today" numbers periodically so the UI ticks up.
        rospy.Timer(rospy.Duration(60), lambda _e: self._publish_stats())
        rospy.spin()


if __name__ == "__main__":
    MowerStats().run()
