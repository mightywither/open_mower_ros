import { useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Polygon, Polyline, Marker, useMap } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import { useMapStore, type MapArea, type MapPoint } from '../store/mapStore'

// Local metric frame (ENU: x=East, y=North) -> Leaflet CRS.Simple.
// CRS.Simple has lat increasing upward and lng increasing rightward, so
// North (y) maps to lat and East (x) maps to lng — north is up, east is right.
export function toLatLng(p: { x: number; y: number }): L.LatLngTuple {
  return [p.y, p.x]
}

// ENU heading (radians, 0 = East, CCW positive) -> CSS clockwise rotation for
// an icon that points up (North) by default, on a north-up map.
function headingToCssDeg(heading: number): number {
  return 90 - (heading * 180) / Math.PI
}

function toLatLngs(pts: MapPoint[]): L.LatLngTuple[] {
  return pts.map(toLatLng)
}

const AREA_STYLES: Record<string, { color: string; fillOpacity: number }> = {
  mow: { color: '#10b981', fillOpacity: 0.15 },
  nav: { color: '#3b82f6', fillOpacity: 0.1 },
  obstacle: { color: '#ef4444', fillOpacity: 0.2 },
}

function robotIcon(heading: number) {
  const deg = headingToCssDeg(heading)
  return L.divIcon({
    className: '',
    html: `
      <div style="width:28px;height:28px;transform:rotate(${deg}deg);">
        <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="14" r="10" fill="#10b981" stroke="white" stroke-width="2"/>
          <polygon points="14,3 10,13 14,10 18,13" fill="white"/>
        </svg>
      </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function dockIcon(heading: number) {
  // The little notch points toward the docking heading so the orientation is visible.
  const deg = headingToCssDeg(heading)
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:26px;height:26px;">
        <div style="position:absolute;top:50%;left:50%;width:0;height:0;
          transform:translate(-50%,-50%) rotate(${deg}deg) translateY(-13px);
          border-left:5px solid transparent;border-right:5px solid transparent;
          border-bottom:8px solid #f59e0b;"></div>
        <div style="position:absolute;inset:0;background:#f59e0b;border-radius:50%;
          border:2px solid white;display:flex;align-items:center;justify-content:center;
          font-size:13px;line-height:1;">🏠</div>
      </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function FitBounds() {
  const areas = useMapStore((s) => s.areas)
  const dockingStations = useMapStore((s) => s.dockingStations)
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return
    const pts: L.LatLngTuple[] = areas.flatMap((a) => a.outline).map(toLatLng)
    dockingStations.forEach((ds) => pts.push(toLatLng(ds.position)))
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] })
      fitted.current = true
    }
  }, [areas, dockingStations, map])

  return null
}

export interface RobotMapProps {
  /** Allow zoom/drag. Default true. */
  interactive?: boolean
  /** Show the robot's travelled trail. Default true. */
  showTrail?: boolean
  /** Called when a mowing area is clicked. Enables hover/click affordance. */
  onAreaClick?: (area: MapArea) => void
  /** Called when a docking station is clicked. */
  onDockClick?: () => void
  /** Highlight a specific area id (e.g. selected to mow). */
  highlightedAreaId?: string | null
  className?: string
}

export function RobotMap({
  interactive = true,
  showTrail = true,
  onAreaClick,
  onDockClick,
  highlightedAreaId,
  className,
}: RobotMapProps) {
  const areas = useMapStore((s) => s.areas)
  const dockingStations = useMapStore((s) => s.dockingStations)
  const position = useMapStore((s) => s.position)
  const trail = useMapStore((s) => s.trail)

  const trailLatLngs = useMemo(() => trail.map(toLatLng), [trail])

  return (
    <MapContainer
      crs={L.CRS.Simple}
      center={[0, 0]}
      zoom={4}
      className={className ?? 'h-full w-full'}
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      boxZoom={interactive}
      keyboard={interactive}
      attributionControl={false}
    >
      <FitBounds />

      {/* Areas */}
      {areas.map((area) => {
        const style = AREA_STYLES[area.properties.type] ?? AREA_STYLES.nav
        const clickable = !!onAreaClick && area.properties.type === 'mow'
        const highlighted = highlightedAreaId === area.id
        return (
          <Polygon
            key={area.id}
            positions={toLatLngs(area.outline)}
            pathOptions={{
              color: highlighted ? '#fbbf24' : style.color,
              fillColor: highlighted ? '#fbbf24' : style.color,
              fillOpacity: highlighted ? 0.4 : style.fillOpacity,
              weight: highlighted ? 3 : 2,
              interactive: clickable,
            }}
            eventHandlers={
              clickable ? { click: () => onAreaClick?.(area) } : undefined
            }
          />
        )
      })}

      {/* Travelled trail */}
      {showTrail && trailLatLngs.length > 1 && (
        <Polyline
          positions={trailLatLngs}
          pathOptions={{ color: '#10b981', weight: 2, opacity: 0.5 }}
        />
      )}

      {/* Docking stations */}
      {dockingStations.map((ds) => (
        <Marker
          key={ds.id}
          position={toLatLng(ds.position)}
          icon={dockIcon(ds.heading ?? 0)}
          eventHandlers={onDockClick ? { click: () => onDockClick() } : undefined}
        />
      ))}

      {/* Robot */}
      {position && (
        <Marker
          position={toLatLng(position)}
          icon={robotIcon(position.heading)}
          zIndexOffset={1000}
        />
      )}
    </MapContainer>
  )
}
