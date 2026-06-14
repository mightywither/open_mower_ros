import { useRef, useCallback } from 'react'
import { Gamepad2, AlertTriangle } from 'lucide-react'
import { RobotMap } from '../components/RobotMap'
import { useMqttStore } from '../store/mqttStore'
import { useRobotStore } from '../store/robotStore'

// Touch joystick for manual control — publishes teleop {vx, vz} at 10 Hz.
function Joystick() {
  const publish = useMqttStore((s) => s.publish)
  const padRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const velRef = useRef({ vx: 0, vz: 0 })

  const sendVel = useCallback(() => {
    const { vx, vz } = velRef.current
    publish('teleop', JSON.stringify({ vx, vz }))
  }, [publish])

  function startInterval() {
    if (intervalRef.current) return
    intervalRef.current = setInterval(sendVel, 100)
  }

  function stopInterval() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    velRef.current = { vx: 0, vz: 0 }
    if (knobRef.current) knobRef.current.style.transform = 'translate(-50%, -50%)'
    publish('teleop', JSON.stringify({ vx: 0, vz: 0 }))
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!padRef.current || !(e.buttons & 1)) return
    const rect = padRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const clamp = (v: number) => Math.max(-1, Math.min(1, v))
    const dx = clamp((e.clientX - cx) / (rect.width / 2))
    const dy = clamp((e.clientY - cy) / (rect.height / 2))
    velRef.current = { vx: -dy * 0.5, vz: -dx * 1.0 }
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(calc(-50% + ${dx * 50}px), calc(-50% + ${dy * 50}px))`
    }
    startInterval()
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs text-slate-400">Contrôle manuel (glisser)</div>
      <div
        ref={padRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          startInterval()
        }}
        onPointerMove={onPointerMove}
        onPointerUp={stopInterval}
        onPointerCancel={stopInterval}
        className="relative h-44 w-44 cursor-pointer touch-none select-none rounded-full border-2 border-slate-700 bg-surface-2"
      >
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-slate-700/50" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-slate-700/50" />
        <div
          ref={knobRef}
          className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 shadow-lg transition-transform"
        >
          <Gamepad2 size={22} className="text-white" />
        </div>
      </div>
      <div className="text-xs text-slate-500">Avant / Arrière · Gauche / Droite</div>
    </div>
  )
}

export function Teleop() {
  const emergency = useRobotStore((s) => s.emergency)

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Map */}
      <div className="relative h-64 shrink-0 border-b border-surface-2 lg:h-auto lg:flex-1 lg:border-b-0 lg:border-r">
        <RobotMap className="h-full w-full" interactive />
      </div>

      {/* Joystick panel */}
      <div className="flex flex-col items-center justify-center gap-4 p-6 lg:w-80">
        {emergency && (
          <div className="flex w-full items-center gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
            <AlertTriangle size={16} />
            Mode urgence — téléop indisponible
          </div>
        )}
        <Joystick />
        <p className="text-center text-xs text-slate-500">
          Maintiens le doigt sur le joystick pour piloter. Relâche pour arrêter.
        </p>
      </div>
    </div>
  )
}
