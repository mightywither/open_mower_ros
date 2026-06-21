#!/usr/bin/env python3
"""
mower_map_mqtt — apply web-UI map edits to the robot.

The map-editing ROS services (mower_map_service/*) are not exposed over MQTT,
and there is no "edit area" service — only clear + re-add. This node listens on
the MQTT topic `map/edit` for a full edited map from the web UI and rebuilds the
robot's map: clear_map, then add_mowing_area for every mow/nav area, then
set_docking_point. The result is reported on `map/edit/result`.

Edit payload (JSON):
  {
    "areas": [
      {"type": "mow"|"nav"|"obstacle", "name": "", "outline": [{"x":..,"y":..}, ...]}
    ],
    "docking_stations": [{"position": {"x":..,"y":..}, "heading": ..}]
  }
"""

import json
import math
import threading

import rospy
import paho.mqtt.client as mqtt
from geometry_msgs.msg import Polygon, Point32, Pose

from mower_map.srv import ClearMapSrv, AddMowingAreaSrv, SetDockingPointSrv
from mower_map.msg import MapArea

EDIT_TOPIC = "map/edit"
RESULT_TOPIC = "map/edit/result"


def to_polygon(outline):
    poly = Polygon()
    for p in outline:
        poly.points.append(Point32(x=float(p["x"]), y=float(p["y"]), z=0.0))
    return poly


class MowerMapMqtt:
    def __init__(self):
        rospy.init_node("mower_map_mqtt")
        self._broker_host = rospy.get_param("~broker_host", "127.0.0.1")
        self._broker_port = rospy.get_param("~broker_port", 1883)
        self._lock = threading.Lock()

        rospy.loginfo("mower_map_mqtt: waiting for mower_map_service...")
        rospy.wait_for_service("mower_map_service/clear_map")
        self._clear_map = rospy.ServiceProxy("mower_map_service/clear_map", ClearMapSrv)
        self._add_area = rospy.ServiceProxy("mower_map_service/add_mowing_area", AddMowingAreaSrv)
        self._set_dock = rospy.ServiceProxy("mower_map_service/set_docking_point", SetDockingPointSrv)

        self._mqtt = mqtt.Client()
        self._mqtt.on_connect = self._on_connect
        self._mqtt.on_message = self._on_message
        self._connect_mqtt()
        rospy.loginfo("mower_map_mqtt: ready")

    def _connect_mqtt(self):
        try:
            self._mqtt.connect(self._broker_host, self._broker_port, keepalive=30)
            self._mqtt.loop_start()
        except Exception as e:
            rospy.logwarn(f"mower_map_mqtt: MQTT connect failed ({e}); retrying in 5s")
            threading.Timer(5.0, self._connect_mqtt).start()

    def _on_connect(self, client, userdata, flags, rc):
        rospy.loginfo("mower_map_mqtt: MQTT connected")
        client.subscribe(EDIT_TOPIC)

    def _publish_result(self, ok, error=""):
        payload = json.dumps({"ok": ok, "error": error, "ts": rospy.get_time()})
        self._mqtt.publish(RESULT_TOPIC, payload, retain=False)

    def _on_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode("utf-8"))
        except Exception as e:
            self._publish_result(False, f"invalid JSON: {e}")
            return

        with self._lock:
            try:
                self._apply(data)
                self._publish_result(True)
                rospy.loginfo("mower_map_mqtt: map updated")
            except Exception as e:
                rospy.logerr(f"mower_map_mqtt: failed to apply map: {e}")
                self._publish_result(False, str(e))

    def _apply(self, data):
        areas = data.get("areas", [])
        docks = data.get("docking_stations", [])

        regular = [a for a in areas if a.get("type") in ("mow", "nav")]
        obstacles = [a for a in areas if a.get("type") == "obstacle"]
        if not regular:
            raise RuntimeError("no mow/nav area to save")

        # Wipe and rebuild from scratch (no per-area edit/delete service exists).
        self._clear_map()

        for i, area in enumerate(regular):
            map_area = MapArea()
            map_area.name = area.get("name", "")
            map_area.area = to_polygon(area.get("outline", []))
            map_area.outline_count = int(area.get("outline_count", -1))
            map_area.fixed_angle = bool(area.get("fixed_angle", False))
            map_area.mow_angle = float(area.get("mow_angle", 0.0))
            # Obstacles have no parent in the flattened map; attach them all to the
            # first area so they are preserved.
            if i == 0:
                map_area.obstacles = [to_polygon(o.get("outline", [])) for o in obstacles]
            self._add_area(area=map_area, isNavigationArea=(area.get("type") == "nav"))

        if docks:
            ds = docks[0]
            pose = Pose()
            pose.position.x = float(ds["position"]["x"])
            pose.position.y = float(ds["position"]["y"])
            pose.position.z = 0.0
            yaw = float(ds.get("heading", 0.0))
            pose.orientation.z = math.sin(yaw / 2.0)
            pose.orientation.w = math.cos(yaw / 2.0)
            self._set_dock(docking_pose=pose)

    def run(self):
        rospy.spin()


if __name__ == "__main__":
    MowerMapMqtt().run()
