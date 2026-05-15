import { create } from 'zustand'

export interface RobotPose {
  x: number
  y: number
  heading: number
  posAccuracy: number
  headingValid: boolean
}

export interface RobotState {
  batteryPct: number
  gpsPct: number
  actionProgress: number
  state: string
  subState: string
  area: number
  path: number
  pathIndex: number
  emergency: boolean
  isCharging: boolean
  rainDetected: boolean
  pose: RobotPose
}

interface RobotStore extends RobotState {
  update: (data: Record<string, unknown>) => void
}

const defaultPose: RobotPose = {
  x: 0,
  y: 0,
  heading: 0,
  posAccuracy: 0,
  headingValid: false,
}

const defaultState: RobotState = {
  batteryPct: 0,
  gpsPct: 0,
  actionProgress: 0,
  state: 'INCONNU',
  subState: '',
  area: -1,
  path: -1,
  pathIndex: -1,
  emergency: false,
  isCharging: false,
  rainDetected: false,
  pose: defaultPose,
}

export const useRobotStore = create<RobotStore>((set) => ({
  ...defaultState,
  update: (data) => {
    const pose = data.pose as Record<string, unknown> | undefined
    set({
      batteryPct: (data.battery_percentage as number) ?? 0,
      gpsPct: (data.gps_percentage as number) ?? 0,
      actionProgress: (data.current_action_progress as number) ?? 0,
      state: (data.current_state as string) ?? 'INCONNU',
      subState: (data.current_sub_state as string) ?? '',
      area: (data.current_area as number) ?? -1,
      path: (data.current_path as number) ?? -1,
      pathIndex: (data.current_path_index as number) ?? -1,
      emergency: (data.emergency as boolean) ?? false,
      isCharging: (data.is_charging as boolean) ?? false,
      rainDetected: (data.rain_detected as boolean) ?? false,
      pose: {
        x: (pose?.x as number) ?? 0,
        y: (pose?.y as number) ?? 0,
        heading: (pose?.heading as number) ?? 0,
        posAccuracy: (pose?.pos_accuracy as number) ?? 0,
        headingValid: (pose?.heading_valid as boolean) ?? false,
      },
    })
  },
}))
