import { create } from 'zustand'

export interface HistorySample {
  ts: number // ms epoch
  value: number
}

// ~10 minutes of history. Sensor data arrives roughly every second; cap samples
// per series so the buffers stay small even with chatty sensors.
const WINDOW_MS = 10 * 60 * 1000
const MAX_SAMPLES = 600

interface SensorHistoryStore {
  series: Record<string, HistorySample[]>
  record: (id: string, value: number, ts?: number) => void
}

export const useSensorHistoryStore = create<SensorHistoryStore>((set) => ({
  series: {},
  record: (id, value, ts = Date.now()) =>
    set((state) => {
      if (!Number.isFinite(value)) return state
      const prev = state.series[id] ?? []
      const cutoff = ts - WINDOW_MS
      const next = [...prev, { ts, value }]
        .filter((s) => s.ts >= cutoff)
        .slice(-MAX_SAMPLES)
      return { series: { ...state.series, [id]: next } }
    }),
}))
