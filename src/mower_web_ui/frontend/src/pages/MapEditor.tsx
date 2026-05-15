import { useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Polygon, useMap } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import { Layers, MapPin, Navigation, AlertTriangle, Anchor } from 'lucide-react'
import { useMapStore, type MapArea, type MapPoint } from '../store/mapStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'

function toLatLng(p: MapPoint): L.LatLngTuple {
  return [-p.y, p.x]
}

function toLatLngs(pts: MapPoint[]): L.LatLngTuple[] {
  return pts.map(toLatLng)
}

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode; badge: 'default' | 'secondary' | 'destructive' | 'warning' }> = {
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

function MapFitter({ areas }: { areas: MapArea[] }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !areas.length) return
    const pts = areas.flatMap((a) => a.outline).map(toLatLng)
    if (pts.length) {
      map.fitBounds(L.latLngBounds(pts), { padding: [20, 20] })
      fitted.current = true
    }
  }, [areas, map])
  return null
}

export function MapEditor() {
  const { areas, dockingStations } = useMapStore()

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

  return (
    <div className="flex h-full flex-col gap-0 md:flex-row">
      {/* Left panel: area list */}
      <div className="flex w-full flex-col gap-3 overflow-y-auto p-4 md:w-72 md:border-r md:border-surface-2">
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
              <span className="font-medium text-white">~{(totalMowM2).toFixed(0)} m²</span>
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
                <div key={ds.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                  <span className="text-sm text-white">{ds.properties.name || 'Base'}</span>
                  <span className="text-xs text-slate-500">
                    {ds.position.x.toFixed(1)}, {ds.position.y.toFixed(1)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Area list */}
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
                  return (
                    <div
                      key={area.id}
                      className="rounded-lg border border-surface-2 px-3 py-2 hover:bg-surface-2 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="flex-1 truncate text-sm text-white">
                          {area.properties.name || `Zone ${area.id.slice(0, 6)}`}
                        </span>
                        <Badge variant={meta.badge} className="text-xs">{type}</Badge>
                      </div>
                      <div className="mt-1 flex gap-3 text-xs text-slate-500">
                        <span>{area.outline.length} pts</span>
                        {type !== 'obstacle' && <span>~{m2.toFixed(0)} m²</span>}
                        <span>
                          ({center.x.toFixed(1)}, {center.y.toFixed(1)})
                        </span>
                      </div>
                    </div>
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
          Pour modifier la carte (ajouter des zones, déplacer des obstacles), éditez le fichier{' '}
          <code className="font-mono">map.json</code> sur le robot ou utilisez l'enregistrement de
          zone dans l'interface de contrôle.
        </p>
      </div>

      {/* Right: map preview */}
      <div className="hidden flex-1 md:flex">
        <MapContainer
          crs={L.CRS.Simple}
          center={[0, 0]}
          zoom={2}
          className="flex-1"
          attributionControl={false}
        >
          <MapFitter areas={areas} />
          {areas.map((area) => {
            const meta = TYPE_META[area.properties.type] ?? TYPE_META.nav
            return (
              <Polygon
                key={area.id}
                positions={toLatLngs(area.outline)}
                pathOptions={{
                  color: meta.color,
                  fillColor: meta.color,
                  fillOpacity: 0.15,
                  weight: 2,
                }}
              />
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}
