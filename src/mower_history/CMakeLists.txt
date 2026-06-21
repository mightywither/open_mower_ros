cmake_minimum_required(VERSION 3.0.2)
project(mower_history)

find_package(catkin REQUIRED COMPONENTS
  rospy
)

catkin_package()

catkin_install_python(PROGRAMS
  scripts/mower_history.py
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION}
)
