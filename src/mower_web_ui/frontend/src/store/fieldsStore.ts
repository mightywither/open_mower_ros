import { create } from 'zustand'

export interface FieldData {
  cell: number
  cells: [number, number, number][] // [x, y, value]
}

interface FieldsStore {
  gps: FieldData
  wifi: FieldData
  setGps: (d: FieldData) => void
  setWifi: (d: FieldData) => void
}

const empty: FieldData = { cell: 1, cells: [] }

export const useFieldsStore = create<FieldsStore>((set) => ({
  gps: empty,
  wifi: empty,
  setGps: (gps) => set({ gps }),
  setWifi: (wifi) => set({ wifi }),
}))
