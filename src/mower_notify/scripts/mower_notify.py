#!/usr/bin/env python3

import threading
import urllib.request
import urllib.error
import rospy
from mower_msgs.msg import HighLevelStatus, Emergency

DEFAULT_NTFY_URL = "https://ntfy.sh/mower-quiet-lynx"


_PRIORITY_MAP = {"urgent": 5, "high": 4, "default": 3, "low": 2, "min": 1}


def _post_notification(url, message, priority, title):
    try:
        import json as _json
        # Extract topic from URL (last path segment) for the JSON body
        topic = url.rstrip("/").split("/")[-1]
        payload = _json.dumps({
            "topic": topic,
            "message": message,
            "title": title,
            "priority": _PRIORITY_MAP.get(priority, 3),
            "tags": ["robot"],
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
        # Debounce: avoid re-sending while active_emergency stays True
        self._active_emergency_notified = False

        rospy.Subscriber("mower_logic/current_state", HighLevelStatus, self._on_status, queue_size=10)
        rospy.Subscriber("/ll/emergency", Emergency, self._on_emergency, queue_size=10)
        rospy.loginfo(f"mower_notify: started, publishing to {self._ntfy_url}")

    def _on_emergency(self, msg):
        with self._lock:
            if msg.active_emergency and not self._active_emergency_notified:
                reason = msg.reason or "inconnue"
                self._notify(
                    f"Urgence déclenchée : {reason}",
                    priority="urgent",
                    title="OpenMower — Urgence",
                )
                self._active_emergency_notified = True
            elif not msg.active_emergency:
                self._active_emergency_notified = False

    def _on_status(self, msg):
        with self._lock:
            prev_state = self._prev_state_name
            prev_emergency = self._prev_emergency

            # Latched emergency cleared
            if prev_emergency and not msg.emergency:
                self._notify(
                    f"Urgence levée — robot en {msg.state_name.lower()}",
                    priority="high",
                    title="OpenMower — Urgence levée",
                )

            # Robot stuck during mowing (MBF navigation failure, not an emergency)
            if prev_state == "MOWING" and msg.state_name == "PAUSED" and not msg.emergency:
                area = msg.current_area if msg.current_area >= 0 else "?"
                path = msg.current_path if msg.current_path >= 0 else "?"
                self._notify(
                    f"Robot bloqué pendant la tonte (zone {area}, chemin {path})",
                    priority="high",
                    title="OpenMower — Robot bloqué",
                )

            # Docking finished
            if prev_state == "DOCKING" and msg.state_name == "IDLE":
                if msg.is_charging:
                    self._notify(
                        "Docking réussi, robot en charge",
                        priority="default",
                        title="OpenMower — En charge",
                    )
                else:
                    self._notify(
                        "Échec du docking, robot non rechargé — intervention requise",
                        priority="high",
                        title="OpenMower — Échec docking",
                    )

            self._prev_state_name = msg.state_name
            self._prev_emergency = msg.emergency

    def _notify(self, message, priority="default", title="OpenMower"):
        rospy.loginfo(f"mower_notify: [{priority}] {title} — {message}")
        threading.Thread(
            target=_post_notification,
            args=(self._ntfy_url, message, priority, title),
            daemon=True,
        ).start()

    def run(self):
        rospy.spin()


if __name__ == "__main__":
    MowerNotifier().run()
