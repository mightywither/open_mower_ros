import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { MapContainer, Polygon, Polyline, useMap } from 'react-leaflet'
import { useMapStore } from '../store/mapStore'
import { useRobotStore } from '../store/robotStore'
import type { MapPoint } from '../store/mapStore'

// Coordinate helpers: flip Y so north is up
function toLatLng(p: MapPoint): L.LatLngTuple {
  return [-p.y, p.x]
}

function toLatLngs(pts: MapPoint[]): L.LatLngTuple[] {
  return pts.map(toLatLng)
}

const AREA_STYLES: Record<string, { color: string; fillOpacity: number }> = {
  mow: { color: '#10b981', fillOpacity: 0.15 },
  nav: { color: '#3b82f6', fillOpacity: 0.10 },
  obstacle: { color: '#ef4444', fillOpacity: 0.20 },
}

function robotIcon(heading: number) {
  const deg = (heading * 180) / Math.PI
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 28px;
        height: 28px;
        position: relative;
        transform: rotate(${deg}deg);
      ">
        <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="14" r="10" fill="#10b981" stroke="white" stroke-width="2"/>
          <polygon points="14,3 10,13 14,10 18,13" fill="white"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function dockIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="width:24px;height:24px;background:#f59e0b;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:12px;">
        🏠
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function RobotMarker() {
  const position = useMapStore((s) => s.position)
  const map = useMap()
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!position) return
    const latlng = toLatLng(position)
    if (!markerRef.current) {
      markerRef.current = L.marker(latlng, { icon: robotIcon(position.heading), zIndexOffset: 1000 })
      markerRef.current.addTo(map)
    } else {
      markerRef.current.setLatLng(latlng)
      markerRef.current.setIcon(robotIcon(position.heading))
    }
  }, [position, map])

  useEffect(() => {
    return () => {
      markerRef.current?.remove()
      markerRef.current = null
    }
  }, [])

  return null
}

function DockMarkers() {
  const dockingStations = useMapStore((s) => s.dockingStations)
  const map = useMap()
  const markersRef = useRef<L.Marker[]>([])

  useEffect(() => {
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = dockingStations.map((ds) => {
      const m = L.marker(toLatLng(ds.position), { icon: dockIcon() })
      m.bindTooltip(ds.properties.name || 'Base')
      m.addTo(map)
      return m
    })
    return () => markersRef.current.forEach((m) => m.remove())
  }, [dockingStations, map])

  return null
}

function MapFitter() {
  const areas = useMapStore((s) => s.areas)
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current || areas.length === 0) return
    const allPoints = areas.flatMap((a) => a.outline).map(toLatLng)
    if (allPoints.length > 0) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [20, 20] })
      fitted.current = true
    }
  }, [areas, map])

  return null
}

export function MapView() {
  const { areas, trail } = useMapStore()
  const { state } = useRobotStore()

  const trailLatLngs = trail.map(toLatLng)

  return (
    <div className="relative flex h-full flex-col">
      {/* Legend */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1 rounded-lg border border-surface-2 bg-surface/90 p-2 backdrop-blur-sm">
        <div className="text-xs font-medium text-slate-400 mb-1">Légende</div>
        {[
          { color: '#10b981', label: 'Tonte' },
          { color: '#3b82f6', label: 'Navigation' },
          { color: '#ef4444', label: 'Obstacle' },
          { color: '#f59e0b', label: 'Base' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-slate-300">
            <div className="h-2 w-4 rounded-sm" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
      </div>

      {/* State badge */}
      <div className="absolute left-3 top-3 z-[1000] rounded-lg border border-surface-2 bg-surface/90 px-2 py-1 text-xs text-slate-300 backdrop-blur-sm">
        {state}
      </div>

      <MapContainer
        crs={L.CRS.Simple}
        center={[0, 0]}
        zoom={4}
        className="flex-1"
        zoomControl={true}
        attributionControl={false}
      >
        <MapFitter />
        <RobotMarker />
        <DockMarkers />

        {/* Map areas */}
        {areas.map((area) => {
          const style = AREA_STYLES[area.properties.type] ?? AREA_STYLES.nav
          return (
            <Polygon
              key={area.id}
              positions={toLatLngs(area.outline)}
              pathOptions={{
                color: style.color,
                fillColor: style.color,
                fillOpacity: style.fillOpacity,
                weight: 2,
              }}
            >
            </Polygon>
          )
        })}

        {/* Robot trail */}
        {trailLatLngs.length > 1 && (
          <Polyline
            positions={trailLatLngs}
            pathOptions={{ color: '#10b981', weight: 2, opacity: 0.5 }}
          />
        )}
      </MapContainer>
    </div>
  )
}
