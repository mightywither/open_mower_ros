import { Link } from 'react-router-dom'
import {
  Play,
  Home,
  Pause,
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

export function Control() {
  const { state, emergency } = useRobotStore()
  const sendAction = useAction()

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
              label={isPaused ? 'Reprendre' : 'Pause'}
              icon={isPaused ? <Play size={24} /> : <Pause size={24} />}
              action={isPaused ? 'mower_logic:mowing/continue' : 'mower_logic:mowing/pause'}
              variant="warning"
              size="lg"
              disabled={!isMowing && !isPaused}
            />
            {/* abort_mowing returns the robot to the docking station ("go home"). */}
            <ActionButton
              label="Rentrer"
              icon={<Home size={24} />}
              action="mower_logic:mowing/abort_mowing"
              variant="secondary"
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

      {/* Teleop link */}
      <Card>
        <CardHeader>
          <CardTitle>Téléopération manuelle</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/teleop">
              <Gamepad2 size={16} />
              Ouvrir la téléopération (avec carte)
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
