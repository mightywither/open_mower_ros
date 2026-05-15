import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  brokerUrl: string
  setBrokerUrl: (url: string) => void
}

const defaultBrokerUrl =
  typeof window !== 'undefined'
    ? `ws://${window.location.hostname}:9001`
    : 'ws://openmower.local:9001'

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      brokerUrl: defaultBrokerUrl,
      setBrokerUrl: (brokerUrl) => set({ brokerUrl }),
    }),
    {
      name: 'mower-settings',
    },
  ),
)
