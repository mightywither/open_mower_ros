import { create } from 'zustand'

interface CoverageStore {
  cell: number // cell size in metres
  cells: [number, number][] // cell centres [x, y] in metres
  setFromState: (data: { cell?: number; cells?: [number, number][] }) => void
}

export const useCoverageStore = create<CoverageStore>((set) => ({
  cell: 0.5,
  cells: [],
  setFromState: (data) => set({ cell: data.cell ?? 0.5, cells: data.cells ?? [] }),
}))
