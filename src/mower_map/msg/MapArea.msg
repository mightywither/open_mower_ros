string name
geometry_msgs/Polygon area
geometry_msgs/Polygon[] obstacles
int32 outline_count  # per-area override; -1 means use the global config value
bool fixed_angle     # if true, force mow_angle for this area instead of auto-detecting
float64 mow_angle    # forced mowing angle in degrees (absolute, relative to East)
