import { create } from 'zustand'

export interface MowerEvent {
  id: string
  t: number
  type: string
  x?: number
  y?: number
  [key: string]: unknown
}

interface EventsStore {
  events: MowerEvent[]
  addEvent: (event: MowerEvent) => void
  setEvents: (events: MowerEvent[]) => void
}

export const useEventsStore = create<EventsStore>((set) => ({
  events: [],
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 300),
    })),
  setEvents: (events) =>
    set({
      events: [...events].sort((a, b) => b.t - a.t),
    }),
}))
