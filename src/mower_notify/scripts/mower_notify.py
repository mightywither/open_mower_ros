#!/usr/bin/env python3

import json
import os
import threading
import urllib.request
import urllib.error
import rospy
from mower_msgs.msg import HighLevelStatus, Emergency

import paho.mqtt.client as mqtt

DEFAULT_NTFY_URL = "https://ntfy.sh/mower-quiet-lynx"

OVERRIDE_PATH = "/data/params/mower_notify.yaml"

STATE_TOPIC = "notify/state"
CMD_TOPIC = "notify/cmd"

# Events that can be individually toggled on/off (all enabled by default).
EVENT_KEYS = (
    "emergency",
    "stuck",
    "docking_success",
    "docking_failed",
    "emergency_cleared",
)

# Default templates — overridable via ROS params (see config/notifications.yaml)
DEFAULT_TEMPLATES = {
    "emergency": {
        "title": "Urgence !",
        "message": "Le robot s'est arrêté : {reason}",
        "tags": ["rotating_light", "warning"],
        "priority": "urgent",
    },
    "emergency_cleared": {
        "title": "Urgence levée",
        "message": "Le robot reprend (mode : {state})",
        "tags": ["white_check_mark"],
        "priority": "high",
    },
    "stuck": {
        "title": "Robot bloqué",
        "message": "Bloqué en zone {area}, chemin {path} — intervention peut-être nécessaire",
        "tags": ["warning", "seedling"],
        "priority": "high",
    },
    "docking_success": {
        "title": "En charge",
        "message": "Docking réussi, le robot est en charge",
        "tags": ["white_check_mark", "battery"],
        "priority": "default",
    },
    "docking_failed": {
        "title": "Échec du docking",
        "message": "Le robot n'a pas rejoint le chargeur — intervention requise",
        "tags": ["x", "battery"],
        "priority": "high",
    },
}

PRIORITY_MAP = {"urgent": 5, "high": 4, "default": 3, "low": 2, "min": 1}


def _post_notification(url, message, priority, title, tags):
    try:
        topic = url.rstrip("/").split("/")[-1]
        payload = json.dumps({
            "topic": topic,
            "message": message,
            "title": title,
            "priority": PRIORITY_MAP.get(priority, 3),
            "tags": tags,
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        rospy.logerr(f"mower_notify: failed to send notification: {e}")


class MowerNotifier:
    def __init__(self):
        rospy.init_node("mower_notify")

        self._ntfy_url = rospy.get_param("~ntfy_url", DEFAULT_NTFY_URL)
        self._broker_host = rospy.get_param("~broker_host", "127.0.0.1")
        self._broker_port = rospy.get_param("~broker_port", 1883)
        self._lock = threading.Lock()

        self._prev_state_name = None
        self._prev_emergency = False
        self._active_emergency_notified = False

        # Per-event enable flags (default all enabled), overridable via the
        # /data/params/mower_notify.yaml `events:` section and MQTT notify/cmd.
        self._events = {key: True for key in EVENT_KEYS}

        self._templates = self._load_templates()
        self._load_config()

        # MQTT: expose/accept notify config over the shared broker.
        self._mqtt = mqtt.Client()
        self._mqtt.on_connect = self._on_mqtt_connect
        self._mqtt.on_message = self._on_mqtt_message
        self._connect_mqtt()

        rospy.Subscriber("mower_logic/current_state", HighLevelStatus, self._on_status, queue_size=10)
        rospy.Subscriber("/ll/emergency", Emergency, self._on_emergency, queue_size=10)
        rospy.loginfo(f"mower_notify: started, publishing to {self._ntfy_url}")

    def _load_templates(self):
        import copy
        templates = copy.deepcopy(DEFAULT_TEMPLATES)

        # 1. Override from ROS params (loaded via launch file rosparam)
        for key in templates:
            for field in ("title", "message", "tags", "priority"):
                param = f"~notifications/{key}/{field}"
                if rospy.has_param(param):
                    templates[key][field] = rospy.get_param(param)

        # 2. Override from /data/params/mower_notify.yaml (host-mounted, no rebuild needed)
        try:
            import yaml
            with open(OVERRIDE_PATH) as f:
                overrides = yaml.safe_load(f) or {}
            for key, fields in overrides.get("notifications", {}).items():
                if key in templates and isinstance(fields, dict):
                    templates[key].update(fields)
            rospy.loginfo(f"mower_notify: loaded overrides from {OVERRIDE_PATH}")
        except FileNotFoundError:
            pass
        except Exception as e:
            rospy.logwarn(f"mower_notify: could not load {OVERRIDE_PATH}: {e}")

        return templates

    def _read_override_file(self):
        """Return the parsed override yaml as a dict (empty if absent)."""
        try:
            import yaml
            with open(OVERRIDE_PATH) as f:
                return yaml.safe_load(f) or {}
        except FileNotFoundError:
            return {}
        except Exception as e:
            rospy.logwarn(f"mower_notify: could not read {OVERRIDE_PATH}: {e}")
            return {}

    def _load_config(self):
        """Load runtime config (ntfy_url + per-event toggles) from the override file."""
        data = self._read_override_file()
        url = data.get("ntfy_url")
        if isinstance(url, str) and url:
            self._ntfy_url = url
        events = data.get("events", {})
        if isinstance(events, dict):
            for key in EVENT_KEYS:
                if key in events:
                    self._events[key] = bool(events[key])

    def _save_config(self):
        """Persist ntfy_url + event toggles, preserving the notifications section."""
        try:
            import yaml
            data = self._read_override_file()
            data["ntfy_url"] = self._ntfy_url
            data["events"] = {key: bool(self._events[key]) for key in EVENT_KEYS}
            os.makedirs(os.path.dirname(OVERRIDE_PATH), exist_ok=True)
            with open(OVERRIDE_PATH, "w") as f:
                yaml.safe_dump(data, f, default_flow_style=False, sort_keys=False)
        except Exception as e:
            rospy.logwarn(f"mower_notify: could not save {OVERRIDE_PATH}: {e}")

    # ----- MQTT -----
    def _connect_mqtt(self):
        try:
            self._mqtt.connect(self._broker_host, self._broker_port, keepalive=30)
            self._mqtt.loop_start()
        except Exception as e:
            rospy.logwarn(f"mower_notify: MQTT connect failed ({e}); retrying in 5s")
            threading.Timer(5.0, self._connect_mqtt).start()

    def _on_mqtt_connect(self, client, userdata, flags, rc):
        rospy.loginfo("mower_notify: MQTT connected")
        client.subscribe(CMD_TOPIC)
        self._publish_state()

    def _on_mqtt_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            return
        if data.get("cmd") != "set":
            return
        with self._lock:
            url = data.get("ntfy_url")
            if isinstance(url, str) and url:
                self._ntfy_url = url
            events = data.get("events", {})
            if isinstance(events, dict):
                for key in EVENT_KEYS:
                    if key in events:
                        self._events[key] = bool(events[key])
            self._save_config()
        self._publish_state()

    def _publish_state(self):
        with self._lock:
            state = {
                "ntfy_url": self._ntfy_url,
                "events": {key: bool(self._events[key]) for key in EVENT_KEYS},
            }
        try:
            self._mqtt.publish(STATE_TOPIC, json.dumps(state), retain=True)
        except Exception:
            pass

    def _on_emergency(self, msg):
        with self._lock:
            if msg.active_emergency and not self._active_emergency_notified:
                reason = msg.reason if msg.reason else "inconnue"
                self._notify_event("emergency", reason=reason)
                self._active_emergency_notified = True
            elif not msg.active_emergency:
                self._active_emergency_notified = False

    def _on_status(self, msg):
        with self._lock:
            prev_state = self._prev_state_name
            prev_emergency = self._prev_emergency

            if prev_emergency and not msg.emergency:
                self._notify_event("emergency_cleared", state=msg.state_name.lower())

            if prev_state == "MOWING" and msg.state_name == "PAUSED" and not msg.emergency:
                area = msg.current_area if msg.current_area >= 0 else "?"
                path = msg.current_path if msg.current_path >= 0 else "?"
                self._notify_event("stuck", area=area, path=path)

            if prev_state == "DOCKING" and msg.state_name == "IDLE":
                self._notify_event("docking_success" if msg.is_charging else "docking_failed")

            self._prev_state_name = msg.state_name
            self._prev_emergency = msg.emergency

    def _notify_event(self, key, **context):
        if not self._events.get(key, True):
            rospy.loginfo(f"mower_notify: event '{key}' disabled, skipping")
            return
        tmpl = self._templates[key]
        try:
            message = tmpl["message"].format_map(context)
        except KeyError as e:
            rospy.logwarn(f"mower_notify: template '{key}' missing placeholder {e}, using raw message")
            message = tmpl["message"]
        title = tmpl["title"]
        priority = tmpl["priority"]
        tags = tmpl["tags"] if isinstance(tmpl["tags"], list) else list(tmpl["tags"])
        rospy.loginfo(f"mower_notify: [{priority}] {title} — {message}")
        threading.Thread(
            target=_post_notification,
            args=(self._ntfy_url, message, priority, title, tags),
            daemon=True,
        ).start()

    def run(self):
        rospy.spin()


if __name__ == "__main__":
    MowerNotifier().run()
