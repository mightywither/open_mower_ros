import { useState, useRef, useCallback } from 'react'
import {
  Play,
  Home,
  Pause,
  StopCircle,
  RotateCcw,
  SkipForward,
  Gamepad2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardTitle, CardContent, CardHeader } from '../components/ui/card'
import { useMqttStore } from '../store/mqttStore'
import { useRobotStore } from '../store/robotStore'

function useAction() {
  const publish = useMqttStore((s) => s.publish)
  return (actionId: string) => publish('action', actionId)
}

interface ActionButtonProps {
  label: string
  icon: React.ReactNode
  action: string
  variant?: 'default' | 'destructive' | 'secondary' | 'warning' | 'outline'
  size?: 'default' | 'lg' | 'xl'
  disabled?: boolean
}

function ActionButton({ label, icon, action, variant = 'secondary', size = 'default', disabled }: ActionButtonProps) {
  const sendAction = useAction()
  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled}
      onClick={() => sendAction(action)}
      className="flex-col gap-1 h-auto py-4"
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </Button>
  )
}

// Touch joystick for manual control
function Joystick() {
  const publish = useMqttStore((s) => s.publish)
  const padRef = useRef<HTMLDivElement>(null)
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
    publish('teleop', JSON.stringify({ vx: 0, vz: 0 }))
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!padRef.current || !(e.buttons & 1)) return
    const rect = padRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = (e.clientX - cx) / (rect.width / 2)
    const dy = (e.clientY - cy) / (rect.height / 2)
    const clamped = (v: number) => Math.max(-1, Math.min(1, v))
    velRef.current = { vx: clamped(-dy) * 0.5, vz: clamped(-dx) * 1.0 }
    startInterval()
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs text-slate-400">Contrôle manuel (glisser)</div>
      <div
        ref={padRef}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startInterval() }}
        onPointerMove={onPointerMove}
        onPointerUp={stopInterval}
        onPointerCancel={stopInterval}
        className="relative h-40 w-40 cursor-pointer touch-none rounded-full border-2 border-slate-700 bg-surface-2 select-none"
        style={{ userSelect: 'none' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Gamepad2 size={28} className="text-slate-600" />
        </div>
        {/* Crosshair */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-slate-700/50" />
        <div className="absolute top-1/2 left-0 w-full h-px -translate-y-1/2 bg-slate-700/50" />
      </div>
      <div className="text-xs text-slate-500">Avant / Arrière · Gauche / Droite</div>
    </div>
  )
}

export function Control() {
  const { state, emergency } = useRobotStore()
  const sendAction = useAction()
  const [showJoystick, setShowJoystick] = useState(false)

  const isIdle = state === 'IDLE' || state === 'NULL' || state === 'INCONNU'
  const isMowing = state === 'AUTONOMOUS' || state === 'MOWING'
  const isPaused = state === 'PAUSED'

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Emergency */}
      {emergency && (
        <div className="flex items-center gap-3 rounded-xl border border-red-800 bg-red-950/50 p-4">
          <AlertTriangle size={20} className="text-red-400" />
          <div className="flex-1 text-red-300">Mode urgence actif</div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => sendAction('mower_logic/reset_emergency')}
          >
            <RotateCcw size={14} />
            Réinitialiser
          </Button>
        </div>
      )}

      {/* Main actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions principales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ActionButton
              label="Démarrer"
              icon={<Play size={24} />}
              action="mower_logic:idle/start_mowing"
              variant="default"
              size="lg"
              disabled={!isIdle || emergency}
            />
            <ActionButton
              label="Rentrer"
              icon={<Home size={24} />}
              action="mower_logic:idle/go_home"
              variant="secondary"
              size="lg"
              disabled={isIdle || emergency}
            />
            <ActionButton
              label={isPaused ? 'Reprendre' : 'Pause'}
              icon={isPaused ? <Play size={24} /> : <Pause size={24} />}
              action={isPaused ? 'mower_logic:mowing/continue' : 'mower_logic:mowing/pause'}
              variant="warning"
              size="lg"
              disabled={!isMowing && !isPaused}
            />
            <ActionButton
              label="Arrêter"
              icon={<StopCircle size={24} />}
              action="mower_logic:mowing/abort_mowing"
              variant="destructive"
              size="lg"
              disabled={!isMowing && !isPaused}
            />
          </div>
        </CardContent>
      </Card>

      {/* Secondary actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions secondaires</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <ActionButton
              label="Zone suiv."
              icon={<SkipForward size={18} />}
              action="mower_logic:mowing/skip_area"
              disabled={!isMowing}
            />
            <ActionButton
              label="Chemin suiv."
              icon={<SkipForward size={18} />}
              action="mower_logic:mowing/skip_path"
              disabled={!isMowing}
            />
            <ActionButton
              label="Reset urgence"
              icon={<RotateCcw size={18} />}
              action="mower_logic/reset_emergency"
              variant="outline"
            />
          </div>
        </CardContent>
      </Card>

      {/* Joystick */}
      <Card>
        <CardHeader>
          <CardTitle>Téléopération manuelle</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowJoystick((v) => !v)}
          >
            {showJoystick ? 'Masquer' : 'Afficher'}
          </Button>
        </CardHeader>
        {showJoystick && (
          <CardContent className="flex justify-center py-4">
            <Joystick />
          </CardContent>
        )}
      </Card>
    </div>
  )
}
