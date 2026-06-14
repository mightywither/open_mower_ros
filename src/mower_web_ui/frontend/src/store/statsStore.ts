import { create } from 'zustand'

export interface StatsTotals {
  today_s: number
  week_s: number
  total_s: number
  sessions: number
}

export interface StatsHistoryEntry {
  date: string // YYYY-MM-DD
  duration_s: number
}

export interface StatsCurrent {
  mowing: boolean
  session_start_iso: string | null
}

interface StatsStore {
  totals: StatsTotals
  history: StatsHistoryEntry[]
  current: StatsCurrent
  loaded: boolean
  setFromState: (data: Record<string, unknown>) => void
}

const defaultTotals: StatsTotals = { today_s: 0, week_s: 0, total_s: 0, sessions: 0 }

export const useStatsStore = create<StatsStore>((set) => ({
  totals: defaultTotals,
  history: [],
  current: { mowing: false, session_start_iso: null },
  loaded: false,
  setFromState: (data) =>
    set(() => {
      const totals = (data.totals as Partial<StatsTotals>) ?? {}
      const current = (data.current as Partial<StatsCurrent>) ?? {}
      return {
        totals: {
          today_s: totals.today_s ?? 0,
          week_s: totals.week_s ?? 0,
          total_s: totals.total_s ?? 0,
          sessions: totals.sessions ?? 0,
        },
        history: (data.history as StatsHistoryEntry[]) ?? [],
        current: {
          mowing: current.mowing ?? false,
          session_start_iso: current.session_start_iso ?? null,
        },
        loaded: true,
      }
    }),
}))
