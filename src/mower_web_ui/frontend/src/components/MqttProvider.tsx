import { useEffect, useRef } from 'react'
import mqtt, { type MqttClient } from 'mqtt'
import { useMqttStore } from '../store/mqttStore'
import { useRobotStore } from '../store/robotStore'
import { useMapStore } from '../store/mapStore'
import { useSettingsStore } from '../store/settingsStore'
import { useEventsStore } from '../store/eventsStore'
import { useSensorsStore, type SensorInfo } from '../store/sensorsStore'
import { useSchedulerStore } from '../store/schedulerStore'
import { useMapEditStore } from '../store/mapEditStore'

export function MqttProvider({ children }: { children: React.ReactNode }) {
  const brokerUrl = useSettingsStore((s) => s.brokerUrl)
  const { setConnected, setClient } = useMqttStore()
  const updateRobot = useRobotStore((s) => s.update)
  const { updatePosition, setMap } = useMapStore()
  const { addEvent, setEvents } = useEventsStore()
  const { setInfos, setValue } = useSensorsStore()
  const setSchedulerState = useSchedulerStore((s) => s.setFromState)
  const setMapEditResult = useMapEditStore((s) => s.setResult)
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
        'sensor_infos/json',
        'sensors/+/data',
        'rpc/response',
        'scheduler/state',
        'map/edit/result',
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

        // Sensor data values are published as raw strings (number or text),
        // not JSON — handle them before attempting to parse.
        if (topic.startsWith('sensors/') && topic.endsWith('/data')) {
          const id = topic.slice('sensors/'.length, -'/data'.length)
          setValue(id, raw)
          return
        }

        const data = JSON.parse(raw) as Record<string, unknown>
        switch (topic) {
          case 'sensor_infos/json':
            setInfos(data as unknown as SensorInfo[])
            break
          case 'scheduler/state':
            setSchedulerState(data)
            break
          case 'map/edit/result':
            setMapEditResult(data as unknown as Parameters<typeof setMapEditResult>[0])
            break
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
