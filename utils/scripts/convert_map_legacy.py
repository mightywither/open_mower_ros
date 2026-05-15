#!/usr/bin/env python3
"""
Converts an OpenMower legacy map.json (working_format 1.0) to the current
map.json format expected by mower_map_service.

Legacy format (from bag conversion tools):
  { "working_format": "1.0", "datum": {...},
    "mowing_areas": [...], "navigation_areas": [...], "docking_points": [...] }

New format (mower_map_service):
  { "areas": [...], "docking_stations": [...] }

Usage:
  python3 convert_map_legacy.py <input.json> [output.json]
  If output.json is omitted, writes to map_converted.json
"""

import json
import math
import random
import string
import sys
from pathlib import Path


def nano_id(length=16):
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=length))


def quat_to_yaw(x, y, z, w):
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def convert(src: dict) -> dict:
    fmt = src.get("working_format")
    if fmt is not None and str(fmt) != "1.0":
        print(f"Warning: unknown working_format '{fmt}', attempting conversion anyway.")

    areas = []

    for raw in src.get("mowing_areas", []):
        area = {
            "id": nano_id(),
            "properties": {
                "name": raw.get("name", ""),
                "type": "mow",
            },
            "outline": [{"x": p["x"], "y": p["y"]} for p in raw.get("outline", [])],
        }
        areas.append(area)
        for obs in raw.get("obstacles", []):
            areas.append({
                "id": nano_id(),
                "properties": {"name": "", "type": "obstacle"},
                "outline": [{"x": p["x"], "y": p["y"]} for p in obs.get("points", obs if isinstance(obs, list) else [])],
            })

    for raw in src.get("navigation_areas", []):
        area = {
            "id": nano_id(),
            "properties": {
                "name": raw.get("name", ""),
                "type": "nav",
            },
            "outline": [{"x": p["x"], "y": p["y"]} for p in raw.get("outline", [])],
        }
        areas.append(area)
        for obs in raw.get("obstacles", []):
            areas.append({
                "id": nano_id(),
                "properties": {"name": "", "type": "obstacle"},
                "outline": [{"x": p["x"], "y": p["y"]} for p in obs.get("points", obs if isinstance(obs, list) else [])],
            })

    docking_stations = []
    for raw in src.get("docking_points", []):
        q = raw.get("orientation", {"x": 0, "y": 0, "z": 0, "w": 1})
        heading = quat_to_yaw(q["x"], q["y"], q["z"], q["w"])
        pos = raw.get("position", {"x": 0, "y": 0})
        ds = {
            "id": nano_id(),
            "properties": {"name": raw.get("name", "Docking Station")},
            "position": {"x": pos["x"], "y": pos["y"]},
            "heading": heading,
        }
        docking_stations.append(ds)

    return {"areas": areas, "docking_stations": docking_stations}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    src_path = Path(sys.argv[1])
    dst_path = Path(sys.argv[2]) if len(sys.argv) > 2 else src_path.parent / "map_converted.json"

    with open(src_path) as f:
        src = json.load(f)

    # Detect if already in new format
    if "areas" in src and "docking_stations" in src:
        print("File already appears to be in the new format (has 'areas' key). Nothing to do.")
        sys.exit(0)

    result = convert(src)

    mow_count = sum(1 for a in result["areas"] if a["properties"]["type"] == "mow")
    nav_count = sum(1 for a in result["areas"] if a["properties"]["type"] == "nav")
    obs_count = sum(1 for a in result["areas"] if a["properties"]["type"] == "obstacle")
    dock_count = len(result["docking_stations"])

    with open(dst_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Converted: {mow_count} mowing areas, {nav_count} nav areas, {obs_count} obstacles, {dock_count} docking station(s)")
    print(f"Output: {dst_path}")
    if dst_path.name != "map.json":
        print(f"Rename to map.json and place it in the container's working directory (check OM_CONFIG_DIR or /config).")


if __name__ == "__main__":
    main()
