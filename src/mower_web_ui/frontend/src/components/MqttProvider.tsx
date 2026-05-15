import { useEffect, useRef } from 'react'
import mqtt, { type MqttClient } from 'mqtt'
import { useMqttStore } from '../store/mqttStore'
import { useRobotStore } from '../store/robotStore'
import { useMapStore } from '../store/mapStore'
import { useSettingsStore } from '../store/settingsStore'
import { useEventsStore } from '../store/eventsStore'

export function MqttProvider({ children }: { children: React.ReactNode }) {
  const brokerUrl = useSettingsStore((s) => s.brokerUrl)
  const { setConnected, setClient } = useMqttStore()
  const updateRobot = useRobotStore((s) => s.update)
  const { updatePosition, setMap } = useMapStore()
  const { addEvent, setEvents } = useEventsStore()
  const clientRef = useRef<MqttClient | null>(null)

  useEffect(() => {
    const client = mqtt.connect(brokerUrl, {
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      keepalive: 30,
    })
    clientRef.current = client
    setClient(client)

    client.on('connect', () => {
      setConnected(true)
      client.subscribe([
        'robot_state/json',
        'position/json',
        'map/json',
        'events/json',
        'actions/json',
      ])
      // Load event history via RPC
      const reqId = Math.random().toString(36).slice(2)
      client.publish(
        'rpc/request',
        JSON.stringify({ id: reqId, method: 'events.history', params: {} }),
      )
    })

    client.on('close', () => setConnected(false))
    client.on('error', () => setConnected(false))

    client.on('message', (topic, message) => {
      try {
        const raw = message.toString()
        const data = JSON.parse(raw) as Record<string, unknown>
        switch (topic) {
          case 'robot_state/json':
            updateRobot(data)
            break
          case 'position/json':
            updatePosition(data)
            break
          case 'map/json':
            setMap(data)
            break
          case 'events/json':
            addEvent(data as Parameters<typeof addEvent>[0])
            break
          case 'rpc/response': {
            const result = data.result
            if (Array.isArray(result)) {
              setEvents(result as Parameters<typeof setEvents>[0])
            }
            break
          }
        }
      } catch {
        // malformed message, skip
      }
    })

    return () => {
      client.end()
      setConnected(false)
      setClient(null)
    }
  }, [brokerUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>
}
