import { create } from 'zustand'

export interface ScheduleEntry {
  id: string
  days: number[] // 0=Mon .. 6=Sun
  start: string // "HH:MM"
  end?: string | null // "HH:MM" or null
  enabled: boolean
}

interface SchedulerStore {
  enabled: boolean
  autoMode: number | null // 0=Manual, 1=Semi, 2=Auto
  schedule: ScheduleEntry[]
  loaded: boolean
  setFromState: (data: Record<string, unknown>) => void
}

export const useSchedulerStore = create<SchedulerStore>((set) => ({
  enabled: true,
  autoMode: null,
  schedule: [],
  loaded: false,
  setFromState: (data) =>
    set({
      enabled: (data.enabled as boolean) ?? true,
      autoMode: (data.auto_mode as number | null) ?? null,
      schedule: (data.schedule as ScheduleEntry[]) ?? [],
      loaded: true,
    }),
}))
