#!/usr/bin/env python3
"""
mower_history — persistent time-series history of sensors using RRDtool.

Consumes sensor values over MQTT (the same ones the web UI shows) and stores
them in round-robin databases under $PARAMS_PATH/history/*.rrd (persistent, fixed
size). Serves history ranges back to the web UI on request.

Metrics:
  - every numeric `sensors/<id>/data` (voltages, currents, temperatures, rpm,
    GPS accuracy, ...) — labels/units taken from `sensor_infos/json`
  - `battery_pct` and `gps_pct` derived from `robot_state/json`

It also records an incident (robot position) every time the robot enters an
emergency, so the web UI can show a heatmap of recurring problem spots.

MQTT contract:
  - subscribe `sensors/+/data`, `sensor_infos/json`, `robot_state/json`,
    `position/json`, `history/request`
  - publish RETAINED `history/metrics`: {"metrics":[{"key","label","unit"}]}
  - publish `history/response`: {"range","series":{key:[[epoch_s, value], ...]}}
  - publish RETAINED `incidents/json`: {"incidents":[{"t","x","y","state"}]}

Uses the `rrdtool` CLI (no python binding dependency).
"""

import json
import os
import re
import subprocess
import threading

import rospy
import paho.mqtt.client as mqtt

METRICS_TOPIC = "history/metrics"
REQUEST_TOPIC = "history/request"
RESPONSE_TOPIC = "history/response"
INCIDENTS_TOPIC = "incidents/json"

MAX_INCIDENTS = 1000

STEP = 60  # seconds between consolidated samples

# range -> (seconds back, resolution hint in seconds)
RANGES = {
    "day": (86400, 60),
    "week": (7 * 86400, 900),
    "month": (30 * 86400, 3600),
    "year": (365 * 86400, 86400),
}

DERIVED_LABELS = {
    "battery_pct": ("Batterie", "%"),
    "gps_pct": ("Qualité GPS", "%"),
}


def history_dir():
    base = os.environ.get("PARAMS_PATH", "/data/params")
    return os.path.join(base, "history")


def safe_key(key):
    return re.sub(r"[^A-Za-z0-9_.-]", "_", key)


class MowerHistory:
    def __init__(self):
        rospy.init_node("mower_history")
        self._broker_host = rospy.get_param("~broker_host", "127.0.0.1")
        self._broker_port = rospy.get_param("~broker_port", 1883)
        self._lock = threading.Lock()

        os.makedirs(history_dir(), exist_ok=True)
        self._latest = {}  # metric key -> latest float value
        self._labels = {}  # metric key -> (label, unit)
        self._known_rrd = set()

        # Incident tracking (problem heatmap)
        self._pos = None  # latest (x, y)
        self._prev_emergency = False
        self._incidents = self._load_incidents()

        self._mqtt = mqtt.Client()
        self._mqtt.on_connect = self._on_connect
        self._mqtt.on_message = self._on_message
        self._connect_mqtt()

        # Flush buffered values into the RRDs once per step.
        rospy.Timer(rospy.Duration(STEP), lambda _e: self._flush())
        rospy.loginfo("mower_history: started")

    # ----- MQTT -----
    def _connect_mqtt(self):
        try:
            self._mqtt.connect(self._broker_host, self._broker_port, keepalive=30)
            self._mqtt.loop_start()
        except Exception as e:
            rospy.logwarn(f"mower_history: MQTT connect failed ({e}); retrying in 5s")
            threading.Timer(5.0, self._connect_mqtt).start()

    def _on_connect(self, client, userdata, flags, rc):
        rospy.loginfo("mower_history: MQTT connected")
        client.subscribe(
            [("sensors/+/data", 0), ("sensor_infos/json", 0), ("robot_state/json", 0),
             ("position/json", 0), (REQUEST_TOPIC, 0)]
        )
        self._publish_metrics()
        self._publish_incidents()

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        try:
            if topic.startswith("sensors/") and topic.endswith("/data"):
                key = topic[len("sensors/"):-len("/data")]
                self._record(key, float(msg.payload.decode("utf-8")))
            elif topic == "sensor_infos/json":
                infos = json.loads(msg.payload.decode("utf-8"))
                with self._lock:
                    for s in infos:
                        if s.get("value_type") == "DOUBLE":
                            self._labels[s["sensor_id"]] = (
                                s.get("sensor_name", s["sensor_id"]),
                                s.get("unit", ""),
                            )
                self._publish_metrics()
            elif topic == "position/json":
                data = json.loads(msg.payload.decode("utf-8"))
                if isinstance(data.get("x"), (int, float)) and isinstance(data.get("y"), (int, float)):
                    self._pos = (float(data["x"]), float(data["y"]))
            elif topic == "robot_state/json":
                data = json.loads(msg.payload.decode("utf-8"))
                if isinstance(data.get("battery_percentage"), (int, float)):
                    self._record("battery_pct", float(data["battery_percentage"]) * 100.0)
                if isinstance(data.get("gps_percentage"), (int, float)):
                    self._record("gps_pct", float(data["gps_percentage"]))
                self._track_incident(bool(data.get("emergency")),
                                     str(data.get("current_state", "")))
            elif topic == REQUEST_TOPIC:
                self._handle_request(json.loads(msg.payload.decode("utf-8")))
        except (ValueError, KeyError, json.JSONDecodeError):
            pass

    # ----- recording -----
    def _record(self, key, value):
        if value != value:  # NaN
            return
        with self._lock:
            self._latest[key] = value
            if key in DERIVED_LABELS and key not in self._labels:
                self._labels[key] = DERIVED_LABELS[key]

    def _rrd_path(self, key):
        return os.path.join(history_dir(), safe_key(key) + ".rrd")

    def _ensure_rrd(self, key):
        path = self._rrd_path(key)
        if path in self._known_rrd or os.path.exists(path):
            self._known_rrd.add(path)
            return path
        try:
            subprocess.run(
                ["rrdtool", "create", path, "--step", str(STEP),
                 f"DS:v:GAUGE:{STEP * 2}:U:U",
                 "RRA:AVERAGE:0.5:1:2880",      # 1 min  -> 48 h
                 "RRA:AVERAGE:0.5:15:2880",     # 15 min -> 30 d
                 "RRA:AVERAGE:0.5:60:8760",     # 1 h    -> 1 y
                 "RRA:MAX:0.5:15:2880"],
                check=True, capture_output=True,
            )
            self._known_rrd.add(path)
        except subprocess.CalledProcessError as e:
            rospy.logwarn(f"mower_history: rrd create failed for {key}: {e.stderr.decode()[:200]}")
        return path

    def _flush(self):
        with self._lock:
            items = list(self._latest.items())
            self._latest.clear()
        for key, value in items:
            path = self._ensure_rrd(key)
            try:
                subprocess.run(["rrdtool", "update", path, f"N:{value}"],
                               check=True, capture_output=True)
            except subprocess.CalledProcessError:
                pass  # e.g. two updates within the same step

    # ----- incidents (problem heatmap) -----
    def _incidents_path(self):
        return os.path.join(history_dir(), "incidents.json")

    def _load_incidents(self):
        try:
            with open(self._incidents_path()) as f:
                return json.load(f).get("incidents", [])
        except FileNotFoundError:
            return []
        except Exception as e:
            rospy.logwarn(f"mower_history: could not load incidents: {e}")
            return []

    def _save_incidents(self):
        try:
            with open(self._incidents_path(), "w") as f:
                json.dump({"incidents": self._incidents}, f)
        except Exception as e:
            rospy.logwarn(f"mower_history: could not save incidents: {e}")

    def _track_incident(self, emergency, state):
        # Rising edge of emergency -> log the robot's position.
        if emergency and not self._prev_emergency:
            if self._pos is not None:
                self._incidents.append(
                    {"t": int(rospy.get_time()), "x": round(self._pos[0], 3),
                     "y": round(self._pos[1], 3), "state": state}
                )
                self._incidents = self._incidents[-MAX_INCIDENTS:]
                self._save_incidents()
                self._publish_incidents()
                rospy.loginfo(f"mower_history: incident logged at {self._pos}")
        self._prev_emergency = emergency

    def _publish_incidents(self):
        self._mqtt.publish(INCIDENTS_TOPIC, json.dumps({"incidents": self._incidents}), retain=True)

    # ----- serving -----
    def _publish_metrics(self):
        with self._lock:
            metrics = [{"key": k, "label": v[0], "unit": v[1]} for k, v in self._labels.items()]
        self._mqtt.publish(METRICS_TOPIC, json.dumps({"metrics": metrics}), retain=True)

    def _fetch(self, key, seconds, resolution):
        path = self._rrd_path(key)
        if not os.path.exists(path):
            return []
        try:
            out = subprocess.run(
                ["rrdtool", "fetch", path, "AVERAGE", "-s", f"-{seconds}", "-e", "now",
                 "-r", str(resolution)],
                check=True, capture_output=True,
            ).stdout.decode()
        except subprocess.CalledProcessError:
            return []
        points = []
        for line in out.splitlines():
            if ":" not in line:
                continue
            ts, _, val = line.partition(":")
            ts = ts.strip()
            val = val.strip()
            if not ts.isdigit():
                continue
            try:
                v = float(val)
            except ValueError:
                continue
            if v != v:  # NaN gap
                continue
            points.append([int(ts), round(v, 3)])
        # cap to a sane number of points for the UI
        if len(points) > 400:
            stride = len(points) // 400 + 1
            points = points[::stride]
        return points

    def _handle_request(self, req):
        rng = req.get("range", "day")
        seconds, resolution = RANGES.get(rng, RANGES["day"])
        requested = req.get("metrics")
        with self._lock:
            keys = requested if requested else list(self._labels.keys())
        series = {k: self._fetch(k, seconds, resolution) for k in keys}
        self._mqtt.publish(RESPONSE_TOPIC, json.dumps({"range": rng, "series": series}))

    def run(self):
        rospy.spin()


if __name__ == "__main__":
    MowerHistory().run()
