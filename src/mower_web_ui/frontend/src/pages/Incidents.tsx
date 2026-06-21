import { AlertTriangle, MapPin } from 'lucide-react'
import { useIncidentsStore } from '../store/incidentsStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { RobotMap } from '../components/RobotMap'
import { formatDate } from '../shared/utils'

export function Incidents() {
  const incidents = useIncidentsStore((s) => s.incidents)
  const recent = [...incidents].sort((a, b) => b.t - a.t).slice(0, 30)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-surface-2 bg-surface p-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <AlertTriangle size={18} className="text-red-400" /> Incidents ({incidents.length})
        </h1>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 lg:flex-row">
        {/* Heatmap */}
        <div className="relative h-72 shrink-0 overflow-hidden rounded-lg lg:h-auto lg:flex-1">
          <RobotMap className="h-full w-full" showIncidents showTrail={false} />
        </div>

        {/* List */}
        <div className="flex flex-col gap-2 lg:w-80">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <MapPin size={13} /> Derniers incidents
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              <p className="text-xs text-slate-500">
                Points rouges = endroits où le robot s'est mis en urgence. Les zones denses signalent
                un problème récurrent (obstacle, GPS, terrain).
              </p>
              {recent.length === 0 ? (
                <div className="py-4 text-center text-sm text-slate-500">Aucun incident enregistré 🎉</div>
              ) : (
                recent.map((inc, i) => (
                  <div
                    key={`${inc.t}-${i}`}
                    className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-300">
                      {inc.x.toFixed(1)}, {inc.y.toFixed(1)}
                      {inc.state ? <span className="ml-2 text-xs text-slate-500">{inc.state}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">{formatDate(inc.t)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
