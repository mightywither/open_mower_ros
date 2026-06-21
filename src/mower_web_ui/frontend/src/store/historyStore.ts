import { create } from 'zustand'

export interface HistoryMetric {
  key: string
  label: string
  unit: string
}

export type HistoryRange = 'day' | 'week' | 'month' | 'year'

interface HistoryStore {
  metrics: HistoryMetric[]
  series: Record<string, [number, number][]> // key -> [[epoch_s, value], ...]
  range: HistoryRange
  loading: boolean
  setMetrics: (list: HistoryMetric[]) => void
  setResponse: (data: { range: string; series: Record<string, [number, number][]> }) => void
  setRange: (r: HistoryRange) => void
  setLoading: (v: boolean) => void
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  metrics: [],
  series: {},
  range: 'day',
  loading: false,
  setMetrics: (metrics) => set({ metrics }),
  setResponse: (data) => set({ series: data.series ?? {}, loading: false }),
  setRange: (range) => set({ range }),
  setLoading: (loading) => set({ loading }),
}))
