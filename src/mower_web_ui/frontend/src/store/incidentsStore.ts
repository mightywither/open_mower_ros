import { create } from 'zustand'

export interface Incident {
  t: number // epoch seconds
  x: number
  y: number
  state?: string
}

interface IncidentsStore {
  incidents: Incident[]
  setIncidents: (list: Incident[]) => void
}

export const useIncidentsStore = create<IncidentsStore>((set) => ({
  incidents: [],
  setIncidents: (incidents) => set({ incidents }),
}))
