import { create } from 'zustand'

export interface MapPoint {
  x: number
  y: number
}

export interface MapArea {
  id: string
  properties: { type: string; name: string }
  outline: MapPoint[]
}

export interface DockingStation {
  id: string
  properties: { name: string }
  position: MapPoint
  heading: number
}

interface MapStore {
  areas: MapArea[]
  dockingStations: DockingStation[]
  position: { x: number; y: number; heading: number } | null
  trail: MapPoint[]
  setMap: (data: Record<string, unknown>) => void
  updatePosition: (data: Record<string, unknown>) => void
  clearTrail: () => void
}

export const useMapStore = create<MapStore>((set) => ({
  areas: [],
  dockingStations: [],
  position: null,
  trail: [],
  setMap: (data) =>
    set({
      areas: (data.areas as MapArea[]) ?? [],
      dockingStations: (data.docking_stations as DockingStation[]) ?? [],
    }),
  updatePosition: (data) =>
    set((state) => ({
      position: {
        x: data.x as number,
        y: data.y as number,
        heading: data.heading as number,
      },
      trail: [...state.trail.slice(-1000), { x: data.x as number, y: data.y as number }],
    })),
  clearTrail: () => set({ trail: [] }),
}))
