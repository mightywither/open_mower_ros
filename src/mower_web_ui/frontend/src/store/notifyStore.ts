import { create } from 'zustand'

export interface NotifyEvents {
  emergency: boolean
  stuck: boolean
  docking_success: boolean
  docking_failed: boolean
  emergency_cleared: boolean
}

export const NOTIFY_EVENT_KEYS: (keyof NotifyEvents)[] = [
  'emergency',
  'emergency_cleared',
  'stuck',
  'docking_success',
  'docking_failed',
]

interface NotifyStore {
  ntfyUrl: string
  events: NotifyEvents
  loaded: boolean
  setFromState: (data: Record<string, unknown>) => void
}

const defaultEvents: NotifyEvents = {
  emergency: false,
  stuck: false,
  docking_success: false,
  docking_failed: false,
  emergency_cleared: false,
}

export const useNotifyStore = create<NotifyStore>((set) => ({
  ntfyUrl: '',
  events: defaultEvents,
  loaded: false,
  setFromState: (data) =>
    set(() => {
      const ev = (data.events as Partial<NotifyEvents>) ?? {}
      return {
        ntfyUrl: (data.ntfy_url as string) ?? '',
        events: {
          emergency: ev.emergency ?? false,
          stuck: ev.stuck ?? false,
          docking_success: ev.docking_success ?? false,
          docking_failed: ev.docking_failed ?? false,
          emergency_cleared: ev.emergency_cleared ?? false,
        },
        loaded: true,
      }
    }),
}))
