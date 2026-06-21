import { create } from 'zustand'

export interface ScheduleEntry {
  id: string
  days: number[] // 0=Mon .. 6=Sun
  start: string // "HH:MM"
  end?: string | null // "HH:MM" or null
  enabled: boolean
  area_index?: number | null // index among mow areas, null = all areas
  area_name?: string // human-readable name (informational)
}

export interface AdvancedParam {
  name: string
  label: string
  type: 'double' | 'int' | 'bool'
  min?: number
  max?: number
  step?: number
  unit?: string
  group: string
  value: number | boolean | null
}

interface SchedulerStore {
  enabled: boolean
  autoMode: number | null // 0=Manual, 1=Semi, 2=Auto
  rainMode: number | null // 0=ignore, 1=dock, 2=dock until dry, 3=auto pause
  automaticMode: number | null // 0..2 (set_param automatic_mode)
  params: AdvancedParam[]
  schedule: ScheduleEntry[]
  loaded: boolean
  setFromState: (data: Record<string, unknown>) => void
}

export const useSchedulerStore = create<SchedulerStore>((set) => ({
  enabled: true,
  autoMode: null,
  rainMode: null,
  automaticMode: null,
  params: [],
  schedule: [],
  loaded: false,
  setFromState: (data) =>
    set({
      enabled: (data.enabled as boolean) ?? true,
      autoMode: (data.auto_mode as number | null) ?? null,
      rainMode: (data.rain_mode as number | null) ?? null,
      automaticMode: (data.automatic_mode as number | null) ?? null,
      params: (data.params as AdvancedParam[]) ?? [],
      schedule: (data.schedule as ScheduleEntry[]) ?? [],
      loaded: true,
    }),
}))
