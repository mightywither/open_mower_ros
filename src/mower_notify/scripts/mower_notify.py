#!/usr/bin/env python3

import json
import threading
import urllib.request
import urllib.error
import rospy
from mower_msgs.msg import HighLevelStatus, Emergency

DEFAULT_NTFY_URL = "https://ntfy.sh/mower-quiet-lynx"

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
        self._lock = threading.Lock()

        self._prev_state_name = None
        self._prev_emergency = False
        self._active_emergency_notified = False

        self._templates = self._load_templates()

        rospy.Subscriber("mower_logic/current_state", HighLevelStatus, self._on_status, queue_size=10)
        rospy.Subscriber("/ll/emergency", Emergency, self._on_emergency, queue_size=10)
        rospy.loginfo(f"mower_notify: started, publishing to {self._ntfy_url}")

    def _load_templates(self):
        import copy
        templates = copy.deepcopy(DEFAULT_TEMPLATES)
        for key in templates:
            for field in ("title", "message", "tags", "priority"):
                param = f"~notifications/{key}/{field}"
                if rospy.has_param(param):
                    templates[key][field] = rospy.get_param(param)
        return templates

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
