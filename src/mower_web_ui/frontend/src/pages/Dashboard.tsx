import { Battery, Satellite, MapPin, Droplets, Zap, Activity, Clock } from 'lucide-react'
import { useRobotStore } from '../store/robotStore'
import { useEventsStore } from '../store/eventsStore'
import { useMqttStore } from '../store/mqttStore'
import { Card, CardTitle, CardContent, CardHeader } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { cn, formatDate } from '../lib/utils'

const STATE_STYLES: Record<string, { label: string; badge: string; dot: string }> = {
  IDLE: { label: 'En veille', badge: 'secondary', dot: 'bg-slate-400' },
  AUTONOMOUS: { label: 'En tonte', badge: 'default', dot: 'bg-emerald-400 animate-pulse' },
  MOWING: { label: 'En tonte', badge: 'default', dot: 'bg-emerald-400 animate-pulse' },
  DOCKING: { label: 'Retour base', badge: 'secondary', dot: 'bg-blue-400 animate-pulse' },
  CHARGING: { label: 'En charge', badge: 'default', dot: 'bg-emerald-400' },
  PAUSED: { label: 'En pause', badge: 'warning', dot: 'bg-amber-400' },
  RECORDING: { label: 'Enregistrement', badge: 'warning', dot: 'bg-amber-400 animate-pulse' },
  EMERGENCY: { label: 'URGENCE', badge: 'destructive', dot: 'bg-red-500 animate-pulse' },
}

function stateInfo(state: string, emergency: boolean) {
  if (emergency) return STATE_STYLES.EMERGENCY
  return STATE_STYLES[state] ?? { label: state, badge: 'secondary', dot: 'bg-slate-400' }
}

function batteryColor(pct: number) {
  if (pct > 50) return 'bg-emerald-500'
  if (pct > 20) return 'bg-amber-500'
  return 'bg-red-500'
}

const EVENT_ICONS: Record<string, string> = {
  EMERGENCY: '🚨',
  STATE: '🔄',
  DOCKING: '🏠',
  BOOTED: '🟢',
  SHUTDOWN: '🔴',
  GPS: '📡',
  BLADES: '🌿',
  AREA: '📍',
}

export function Dashboard() {
  const { state, subState, batteryPct, gpsPct, emergency, isCharging, rainDetected, area, path, actionProgress } =
    useRobotStore()
  const connected = useMqttStore((s) => s.connected)
  const events = useEventsStore((s) => s.events)
  const info = stateInfo(state, emergency)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status banner */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border p-4',
          emergency
            ? 'animate-pulse border-red-800 bg-red-950/50'
            : 'border-surface-2 bg-surface',
        )}
      >
        <div className={cn('h-3 w-3 rounded-full', info.dot)} />
        <div className="flex-1">
          <div className="text-lg font-semibold text-white">{info.label}</div>
          {subState && <div className="text-xs text-slate-400">{subState}</div>}
        </div>
        {!connected && (
          <Badge variant="outline" className="text-slate-500">
            Hors ligne
          </Badge>
        )}
        {isCharging && (
          <Badge variant="default">
            <Zap size={11} /> En charge
          </Badge>
        )}
        {rainDetected && (
          <Badge variant="warning">
            <Droplets size={11} /> Pluie
          </Badge>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Battery */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Battery size={13} /> Batterie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-2xl font-bold text-white">{batteryPct.toFixed(0)}%</div>
            <Progress
              value={batteryPct}
              indicatorClassName={batteryColor(batteryPct)}
            />
          </CardContent>
        </Card>

        {/* GPS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Satellite size={13} /> GPS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-2xl font-bold text-white">{gpsPct.toFixed(0)}%</div>
            <Progress
              value={gpsPct}
              indicatorClassName={gpsPct > 70 ? 'bg-emerald-500' : gpsPct > 40 ? 'bg-amber-500' : 'bg-red-500'}
            />
          </CardContent>
        </Card>

        {/* Zone en cours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <MapPin size={13} /> Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {area >= 0 ? `#${area}` : '—'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {path >= 0 ? `Chemin ${path}` : 'Inactif'}
            </div>
          </CardContent>
        </Card>

        {/* Progression */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Activity size={13} /> Progression
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-2xl font-bold text-white">
              {(actionProgress * 100).toFixed(0)}%
            </div>
            <Progress value={actionProgress * 100} />
          </CardContent>
        </Card>
      </div>

      {/* Recent events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Clock size={13} /> Événements récents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="py-4 text-center text-sm text-slate-500">Aucun événement</div>
          ) : (
            <div className="flex flex-col gap-2">
              {events.slice(0, 8).map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2"
                >
                  <span className="text-base">{EVENT_ICONS[ev.type] ?? '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{ev.type}</div>
                    {ev.state && (
                      <div className="truncate text-xs text-slate-400">{String(ev.state)}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-slate-500">{formatDate(ev.t)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
