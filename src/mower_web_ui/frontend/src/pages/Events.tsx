import { useState } from 'react'
import { useEventsStore, type MowerEvent } from '../store/eventsStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { formatDate } from '../lib/utils'

const EVENT_META: Record<string, { icon: string; label: string; badge: 'default' | 'destructive' | 'warning' | 'secondary' }> = {
  EMERGENCY: { icon: '🚨', label: 'Urgence', badge: 'destructive' },
  STATE: { icon: '🔄', label: 'État', badge: 'secondary' },
  DOCKING: { icon: '🏠', label: 'Docking', badge: 'secondary' },
  BOOTED: { icon: '🟢', label: 'Démarrage', badge: 'default' },
  SHUTDOWN: { icon: '🔴', label: 'Arrêt', badge: 'secondary' },
  GPS: { icon: '📡', label: 'GPS', badge: 'warning' },
  BLADES: { icon: '🌿', label: 'Lames', badge: 'secondary' },
  AREA: { icon: '📍', label: 'Zone', badge: 'secondary' },
}

const ALL_TYPES = ['Tous', ...Object.keys(EVENT_META)]

function eventDetails(ev: MowerEvent): string {
  const skip = new Set(['id', 't', 'type'])
  const parts = Object.entries(ev)
    .filter(([k, v]) => !skip.has(k) && v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${String(v)}`)
  return parts.join(' · ')
}

export function Events() {
  const events = useEventsStore((s) => s.events)
  const [filter, setFilter] = useState('Tous')

  const filtered = filter === 'Tous' ? events : events.filter((e) => e.type === filter)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ALL_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === type
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-surface-2 text-slate-400 hover:text-white'
            }`}
          >
            {type === 'Tous' ? type : (EVENT_META[type]?.icon ?? '') + ' ' + (EVENT_META[type]?.label ?? type)}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {filtered.length} événement{filtered.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">Aucun événement</div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((ev) => {
                const meta = EVENT_META[ev.type]
                const details = eventDetails(ev)
                return (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2 transition-colors"
                  >
                    <span className="mt-0.5 shrink-0 text-base">{meta?.icon ?? '📋'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={meta?.badge ?? 'secondary'} className="text-xs">
                          {meta?.label ?? ev.type}
                        </Badge>
                        {details && (
                          <span className="truncate text-xs text-slate-400">{details}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">{formatDate(ev.t)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
