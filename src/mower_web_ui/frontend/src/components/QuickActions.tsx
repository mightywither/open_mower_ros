import { Play, Home, Pause, SkipForward } from 'lucide-react'
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
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
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
          variant="warning"
          size="lg"
          className="h-auto flex-col gap-1 py-3"
          disabled={!isMowing && !isPaused}
          onClick={() => send(isPaused ? 'mower_logic:mowing/continue' : 'mower_logic:mowing/pause')}
        >
          {isPaused ? <Play size={22} /> : <Pause size={22} />}
          <span className="text-xs">{isPaused ? 'Reprendre' : 'Pause'}</span>
        </Button>
        {/* abort_mowing returns the robot to the docking station ("go home"). */}
        <Button
          variant="secondary"
          size="lg"
          className="h-auto flex-col gap-1 py-3"
          disabled={!isMowing && !isPaused}
          onClick={() => send('mower_logic:mowing/abort_mowing')}
        >
          <Home size={22} />
          <span className="text-xs">Rentrer</span>
        </Button>
      </div>

      {/* Skip controls — only meaningful while mowing */}
      {isMowing && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => send('mower_logic:mowing/skip_area')}>
            <SkipForward size={15} /> Sauter la zone
          </Button>
          <Button variant="outline" size="sm" onClick={() => send('mower_logic:mowing/skip_path')}>
            <SkipForward size={15} /> Sauter le passage
          </Button>
        </div>
      )}
    </div>
  )
}
