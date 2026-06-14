import { create } from 'zustand'

export interface SensorInfo {
  sensor_id: string
  sensor_name: string
  value_type: 'DOUBLE' | 'STRING' | 'UNKNOWN'
  value_description: string // TEMPERATURE | VOLTAGE | CURRENT | PERCENT | RPM | DISTANCE | ...
  unit: string
  has_min_max?: boolean
  min_value?: number
  max_value?: number
  has_critical_low?: boolean
  lower_critical_value?: number
  has_critical_high?: boolean
  upper_critical_value?: number
}

export interface SensorValue {
  value: number | string
  ts: number
}

interface SensorsStore {
  infos: Record<string, SensorInfo>
  values: Record<string, SensorValue>
  setInfos: (list: SensorInfo[]) => void
  setValue: (id: string, raw: string) => void
}

export const useSensorsStore = create<SensorsStore>((set) => ({
  infos: {},
  values: {},
  setInfos: (list) =>
    set(() => {
      const infos: Record<string, SensorInfo> = {}
      for (const s of list) infos[s.sensor_id] = s
      return { infos }
    }),
  setValue: (id, raw) =>
    set((state) => {
      const info = state.infos[id]
      const value: number | string =
        info?.value_type === 'STRING' ? raw : Number(raw)
      return { values: { ...state.values, [id]: { value, ts: Date.now() } } }
    }),
}))

/** Whether a numeric sensor value has crossed a critical threshold. */
export function sensorSeverity(
  info: SensorInfo | undefined,
  value: number | string,
): 'critical' | 'normal' {
  if (!info || typeof value !== 'number' || Number.isNaN(value)) return 'normal'
  if (info.has_critical_high && value >= (info.upper_critical_value ?? Infinity)) return 'critical'
  if (info.has_critical_low && value <= (info.lower_critical_value ?? -Infinity)) return 'critical'
  return 'normal'
}
