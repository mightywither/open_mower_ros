import { create } from 'zustand'

interface MowControlStore {
  // Index of the mowing area we want to reach (within the mow-areas list), or null.
  targetAreaIndex: number | null
  targetAreaName: string | null
  // Last area index we issued a skip from, to avoid spamming skip_area.
  lastSkipFrom: number | null
  requestArea: (index: number, name: string) => void
  setLastSkipFrom: (index: number | null) => void
  clear: () => void
}

export const useMowControlStore = create<MowControlStore>((set) => ({
  targetAreaIndex: null,
  targetAreaName: null,
  lastSkipFrom: null,
  requestArea: (index, name) =>
    set({ targetAreaIndex: index, targetAreaName: name, lastSkipFrom: null }),
  setLastSkipFrom: (index) => set({ lastSkipFrom: index }),
  clear: () => set({ targetAreaIndex: null, targetAreaName: null, lastSkipFrom: null }),
}))
