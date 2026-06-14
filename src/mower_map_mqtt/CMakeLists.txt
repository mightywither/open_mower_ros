cmake_minimum_required(VERSION 3.0.2)
project(mower_map_mqtt)

find_package(catkin REQUIRED COMPONENTS
  rospy
  geometry_msgs
  mower_map
)

catkin_package()

catkin_install_python(PROGRAMS
  scripts/mower_map_mqtt.py
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION}
)
