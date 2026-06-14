import { create } from 'zustand'

export interface MapEditResult {
  ok: boolean
  error: string
  ts: number
}

interface MapEditStore {
  lastResult: MapEditResult | null
  saving: boolean
  setSaving: (v: boolean) => void
  setResult: (r: MapEditResult) => void
}

export const useMapEditStore = create<MapEditStore>((set) => ({
  lastResult: null,
  saving: false,
  setSaving: (saving) => set({ saving }),
  setResult: (lastResult) => set({ lastResult, saving: false }),
}))
