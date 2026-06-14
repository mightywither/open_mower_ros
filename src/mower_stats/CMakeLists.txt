cmake_minimum_required(VERSION 3.0.2)
project(mower_stats)

find_package(catkin REQUIRED COMPONENTS
  rospy
  mower_msgs
)

catkin_package()

catkin_install_python(PROGRAMS
  scripts/mower_stats.py
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION}
)
