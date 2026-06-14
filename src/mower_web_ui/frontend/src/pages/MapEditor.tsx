import { useMemo, useState } from 'react'
import { Layers, MapPin, Navigation, AlertTriangle, Anchor, Play, X, Scissors, Home } from 'lucide-react'
import { useMapStore, type MapArea, type MapPoint } from '../store/mapStore'
import { useMowControlStore } from '../store/mowControlStore'
import { useMqttStore } from '../store/mqttStore'
import { useRobotStore } from '../store/robotStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { RobotMap } from '../components/RobotMap'

const TYPE_META: Record<
  string,
  { label: string; color: string; icon: React.ReactNode; badge: 'default' | 'secondary' | 'destructive' | 'warning' }
> = {
  mow: { label: 'Tonte', color: '#10b981', icon: <Layers size={14} />, badge: 'default' },
  nav: { label: 'Navigation', color: '#3b82f6', icon: <Navigation size={14} />, badge: 'secondary' },
  obstacle: { label: 'Obstacle', color: '#ef4444', icon: <AlertTriangle size={14} />, badge: 'destructive' },
}

function areaCenter(outline: MapPoint[]): { x: number; y: number } {
  if (!outline.length) return { x: 0, y: 0 }
  const sumX = outline.reduce((s, p) => s + p.x, 0)
  const sumY = outline.reduce((s, p) => s + p.y, 0)
  return { x: sumX / outline.length, y: sumY / outline.length }
}

function areaApproxM2(outline: MapPoint[]): number {
  let area = 0
  const n = outline.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += outline[i].x * outline[j].y
    area -= outline[j].x * outline[i].y
  }
  return Math.abs(area / 2)
}

export function MapEditor() {
  const { areas, dockingStations } = useMapStore()
  const requestArea = useMowControlStore((s) => s.requestArea)
  const targetAreaIndex = useMowControlStore((s) => s.targetAreaIndex)
  const targetAreaName = useMowControlStore((s) => s.targetAreaName)
  const currentArea = useRobotStore((s) => s.area)
  const robotState = useRobotStore((s) => s.state)
  const publish = useMqttStore((s) => s.publish)
  const [selected, setSelected] = useState<{ id: string; index: number; name: string } | null>(null)

  // "Go home": abort_mowing returns the robot to the docking station.
  // Only meaningful while mowing/paused (no firmware dock-from-idle action).
  const canGoHome = robotState === 'AUTONOMOUS' || robotState === 'MOWING' || robotState === 'PAUSED'
  function goHome() {
    if (!canGoHome) return
    publish('action', 'mower_logic:mowing/abort_mowing')
  }

  // Mow areas in map order — index matches the firmware's mowing-area index.
  const mowAreas = useMemo(() => areas.filter((a) => a.properties.type === 'mow'), [areas])

  const grouped = useMemo(() => {
    const g: Record<string, MapArea[]> = { mow: [], nav: [], obstacle: [] }
    for (const a of areas) {
      const t = a.properties.type in g ? a.properties.type : 'nav'
      g[t].push(a)
    }
    return g
  }, [areas])

  const totalMowM2 = useMemo(
    () => grouped.mow.reduce((sum, a) => sum + areaApproxM2(a.outline), 0),
    [grouped.mow],
  )

  function selectArea(area: MapArea) {
    if (area.properties.type !== 'mow') return
    const index = mowAreas.findIndex((a) => a.id === area.id)
    if (index < 0) return
    setSelected({ id: area.id, index, name: area.properties.name || `Zone ${index + 1}` })
  }

  function confirmMow() {
    if (!selected) return
    requestArea(selected.index, selected.name)
    setSelected(null)
  }

  return (
    <div className="flex h-full flex-col gap-0 md:flex-row">
      {/* Left panel */}
      <div className="flex w-full flex-col gap-3 overflow-y-auto p-4 md:w-80 md:border-r md:border-surface-2">
        {/* Active mow target */}
        {targetAreaIndex !== null && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-800 bg-amber-950/40 p-3">
            <Scissors size={18} className="shrink-0 text-amber-400" />
            <div className="flex-1 text-sm text-amber-200">
              En route vers <strong>{targetAreaName}</strong>
              <div className="text-xs text-amber-400/70">
                Zone actuelle #{currentArea} → cible #{targetAreaIndex}
              </div>
            </div>
          </div>
        )}

        {/* Selection confirmation */}
        {selected && (
          <Card className="border-emerald-800">
            <CardContent className="flex flex-col gap-3 pt-4">
              <div className="text-sm text-white">
                Tondre <strong>{selected.name}</strong> ?
              </div>
              <p className="text-xs text-slate-400">
                Le robot démarre la tonte et passe automatiquement les zones précédentes
                jusqu'à celle-ci.
              </p>
              <div className="flex gap-2">
                <Button variant="default" size="sm" className="flex-1" onClick={confirmMow}>
                  <Play size={14} /> Tondre
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  <X size={14} /> Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <MapPin size={13} /> Résumé
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Zones de tonte</span>
              <span className="font-medium text-white">{grouped.mow.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Navigation</span>
              <span className="font-medium text-white">{grouped.nav.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Obstacles</span>
              <span className="font-medium text-white">{grouped.obstacle.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Surface totale</span>
              <span className="font-medium text-white">~{totalMowM2.toFixed(0)} m²</span>
            </div>
          </CardContent>
        </Card>

        {/* Docking stations */}
        {dockingStations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Anchor size={13} /> Stations de charge
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {dockingStations.map((ds) => (
                <button
                  key={ds.id}
                  onClick={goHome}
                  disabled={!canGoHome}
                  className={`flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-left transition-colors ${
                    canGoHome ? 'cursor-pointer hover:bg-slate-700' : 'cursor-default opacity-60'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm text-white">
                    <Home size={14} className="text-amber-400" />
                    {ds.properties.name || 'Base'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {canGoHome ? 'Rentrer →' : `${ds.position.x.toFixed(1)}, ${ds.position.y.toFixed(1)}`}
                  </span>
                </button>
              ))}
              <p className="text-[11px] text-slate-500">
                Touchez la base (ici ou sur la carte) pour renvoyer le robot au chargeur.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Area lists */}
        {(['mow', 'nav', 'obstacle'] as const).map((type) => {
          const meta = TYPE_META[type]
          const list = grouped[type]
          if (!list.length) return null
          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  {meta.icon}
                  {meta.label} ({list.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {list.map((area) => {
                  const center = areaCenter(area.outline)
                  const m2 = areaApproxM2(area.outline)
                  const clickable = type === 'mow'
                  return (
                    <button
                      key={area.id}
                      onClick={() => clickable && selectArea(area)}
                      disabled={!clickable}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected?.id === area.id
                          ? 'border-emerald-600 bg-emerald-500/10'
                          : 'border-surface-2'
                      } ${clickable ? 'cursor-pointer hover:bg-surface-2' : 'cursor-default'}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                        <span className="flex-1 truncate text-sm text-white">
                          {area.properties.name || `Zone ${area.id.slice(0, 6)}`}
                        </span>
                        {clickable && <Play size={13} className="shrink-0 text-emerald-400" />}
                        <Badge variant={meta.badge} className="text-xs">
                          {type}
                        </Badge>
                      </div>
                      <div className="mt-1 flex gap-3 text-xs text-slate-500">
                        <span>{area.outline.length} pts</span>
                        {type !== 'obstacle' && <span>~{m2.toFixed(0)} m²</span>}
                        <span>
                          ({center.x.toFixed(1)}, {center.y.toFixed(1)})
                        </span>
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}

        {areas.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-500">
            Aucune carte chargée. Vérifiez la connexion MQTT.
          </div>
        )}

        <p className="rounded-lg border border-slate-800 p-3 text-xs text-slate-500">
          Touchez une zone de tonte (liste ou carte) pour y envoyer le robot.
        </p>
      </div>

      {/* Right: interactive map */}
      <div className="relative h-72 shrink-0 md:h-auto md:flex-1">
        <RobotMap
          className="h-full w-full"
          onAreaClick={selectArea}
          onDockClick={goHome}
          highlightedAreaId={selected?.id ?? null}
        />
      </div>
    </div>
  )
}
