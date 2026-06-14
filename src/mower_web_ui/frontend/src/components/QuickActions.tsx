import { Play, Home, Pause, StopCircle } from 'lucide-react'
import { Button } from './ui/button'
import { useMqttStore } from '../store/mqttStore'
import { useRobotStore } from '../store/robotStore'

export function QuickActions() {
  const publish = useMqttStore((s) => s.publish)
  const { state, emergency } = useRobotStore()
  const send = (action: string) => publish('action', action)

  const isIdle = state === 'IDLE' || state === 'NULL' || state === 'INCONNU'
  const isMowing = state === 'AUTONOMOUS' || state === 'MOWING'
  const isPaused = state === 'PAUSED'

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Button
        variant="default"
        size="lg"
        className="h-auto flex-col gap-1 py-3"
        disabled={!isIdle || emergency}
        onClick={() => send('mower_logic:idle/start_mowing')}
      >
        <Play size={22} />
        <span className="text-xs">Démarrer</span>
      </Button>
      <Button
        variant="secondary"
        size="lg"
        className="h-auto flex-col gap-1 py-3"
        disabled={isIdle || emergency}
        onClick={() => send('mower_logic:idle/go_home')}
      >
        <Home size={22} />
        <span className="text-xs">Rentrer</span>
      </Button>
      <Button
        variant="warning"
        size="lg"
        className="h-auto flex-col gap-1 py-3"
        disabled={!isMowing && !isPaused}
        onClick={() => send(isPaused ? 'mower_logic:mowing/continue' : 'mower_logic:mowing/pause')}
      >
        {isPaused ? <Play size={22} /> : <Pause size={22} />}
        <span className="text-xs">{isPaused ? 'Reprendre' : 'Pause'}</span>
      </Button>
      <Button
        variant="destructive"
        size="lg"
        className="h-auto flex-col gap-1 py-3"
        disabled={!isMowing && !isPaused}
        onClick={() => send('mower_logic:mowing/abort_mowing')}
      >
        <StopCircle size={22} />
        <span className="text-xs">Arrêter</span>
      </Button>
    </div>
  )
}
