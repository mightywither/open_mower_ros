cmake_minimum_required(VERSION 3.0.2)
project(mower_scheduler)

find_package(catkin REQUIRED COMPONENTS
  rospy
  std_msgs
  dynamic_reconfigure
)

catkin_package()

catkin_install_python(PROGRAMS
  scripts/mower_scheduler.py
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION}
)
