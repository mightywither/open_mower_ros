import { useEffect, useRef } from 'react'
import { useMqttStore } from '../store/mqttStore'
import { useRobotStore } from '../store/robotStore'
import { useMowControlStore } from '../store/mowControlStore'

const IDLE_STATES = new Set(['IDLE', 'NULL', 'INCONNU', ''])
const MOWING_STATES = new Set(['AUTONOMOUS', 'MOWING'])

/**
 * Drives "mow this specific area": the firmware can only start mowing from
 * area 0 and skip sequentially, so we start mowing then auto-skip until the
 * robot reaches the requested area index.
 */
export function MowController() {
  const publish = useMqttStore((s) => s.publish)
  const state = useRobotStore((s) => s.state)
  const area = useRobotStore((s) => s.area)
  const emergency = useRobotStore((s) => s.emergency)
  const { targetAreaIndex, lastSkipFrom, setLastSkipFrom, clear } = useMowControlStore()
  const startedRef = useRef(false)

  useEffect(() => {
    if (targetAreaIndex === null) {
      startedRef.current = false
      return
    }
    if (emergency) {
      clear()
      return
    }

    // Kick off mowing once if the robot is idle.
    if (IDLE_STATES.has(state)) {
      if (!startedRef.current) {
        publish('action', 'mower_logic:idle/start_mowing')
        startedRef.current = true
      }
      return
    }

    if (MOWING_STATES.has(state)) {
      if (area >= targetAreaIndex) {
        clear()
        return
      }
      // Skip once per area; wait for the index to advance before skipping again.
      if (area >= 0 && lastSkipFrom !== area) {
        publish('action', 'mower_logic:mowing/skip_area')
        setLastSkipFrom(area)
      }
    }
  }, [targetAreaIndex, state, area, emergency, lastSkipFrom, publish, setLastSkipFrom, clear])

  return null
}
