import { create } from 'zustand'
import type { MqttClient } from 'mqtt'

interface MqttStore {
  connected: boolean
  client: MqttClient | null
  setConnected: (v: boolean) => void
  setClient: (c: MqttClient | null) => void
  publish: (topic: string, payload: string) => void
}

export const useMqttStore = create<MqttStore>((set, get) => ({
  connected: false,
  client: null,
  setConnected: (connected) => set({ connected }),
  setClient: (client) => set({ client }),
  publish: (topic, payload) => {
    get().client?.publish(topic, payload)
  },
}))
