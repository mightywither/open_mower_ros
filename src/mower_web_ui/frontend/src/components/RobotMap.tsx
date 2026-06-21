import { memo, useMemo, Fragment } from 'react'
import L from 'leaflet'
import { MapContainer, Polygon, Polyline, Marker, CircleMarker, Rectangle, useMap } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import { useMapStore, type MapArea, type MapPoint } from '../store/mapStore'
import { useIncidentsStore } from '../store/incidentsStore'
import { useCoverageStore } from '../store/coverageStore'
import { useFieldsStore, type FieldData } from '../store/fieldsStore'

const MAX_DISPLAY_CELLS = 8000 // cap rendered coverage/heatmap squares for performance

// GPS accuracy in metres: low = good (green) -> high = bad (red).
function gpsColor(accuracyM: number): string {
  if (accuracyM <= 0.1) return '#10b981'
  if (accuracyM <= 0.25) return '#84cc16'
  if (accuracyM <= 0.5) return '#f59e0b'
  return '#ef4444'
}

// WiFi signal in dBm: high = good (green) -> low = bad (red).
function wifiColor(dbm: number): string {
  if (dbm >= -55) return '#10b981'
  if (dbm >= -67) return '#84cc16'
  if (dbm >= -75) return '#f59e0b'
  return '#ef4444'
}

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

// Persistent mowing coverage: green squares for visited grid cells.
const CoverageLayer = memo(function CoverageLayer() {
  const cells = useCoverageStore((s) => s.cells)
  const cell = useCoverageStore((s) => s.cell)

  const rects = useMemo(() => {
    const half = cell / 2
    const stride = cells.length > MAX_DISPLAY_CELLS ? Math.ceil(cells.length / MAX_DISPLAY_CELLS) : 1
    const out: L.LatLngBoundsLiteral[] = []
    for (let i = 0; i < cells.length; i += stride) {
      const [x, y] = cells[i]
      // bounds: [[lat=y-half, lng=x-half], [lat=y+half, lng=x+half]]
      out.push([
        [y - half, x - half],
        [y + half, x + half],
      ])
    }
    return out
  }, [cells, cell])

  return (
    <>
      {rects.map((bounds, i) => (
        <Rectangle
          key={i}
          bounds={bounds}
          pathOptions={{ stroke: false, fillColor: '#34d399', fillOpacity: 0.35 }}
        />
      ))}
    </>
  )
})

// Value heatmap (GPS quality / WiFi signal): squares coloured by their value.
function ValueHeatmap({ data, colorFn }: { data: FieldData; colorFn: (v: number) => string }) {
  const rects = useMemo(() => {
    const half = data.cell / 2
    const cells = data.cells
    const stride = cells.length > MAX_DISPLAY_CELLS ? Math.ceil(cells.length / MAX_DISPLAY_CELLS) : 1
    const out: { bounds: L.LatLngBoundsLiteral; color: string }[] = []
    for (let i = 0; i < cells.length; i += stride) {
      const [x, y, v] = cells[i]
      out.push({
        bounds: [
          [y - half, x - half],
          [y + half, x + half],
        ],
        color: colorFn(v),
      })
    }
    return out
  }, [data, colorFn])

  return (
    <>
      {rects.map((r, i) => (
        <Rectangle
          key={i}
          bounds={r.bounds}
          pathOptions={{ stroke: false, fillColor: r.color, fillOpacity: 0.45 }}
        />
      ))}
    </>
  )
}

function GpsHeatmap() {
  const gps = useFieldsStore((s) => s.gps)
  return <ValueHeatmap data={gps} colorFn={gpsColor} />
}

function WifiHeatmap() {
  const wifi = useFieldsStore((s) => s.wifi)
  return <ValueHeatmap data={wifi} colorFn={wifiColor} />
}

function arrowIcon(thetaRad: number) {
  const deg = headingToCssDeg(thetaRad)
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;transform:rotate(${deg}deg);">
      <svg viewBox="0 0 16 16"><polygon points="8,1 3,12 8,9 13,12" fill="#f1f5f9" stroke="#0f172a" stroke-width="0.5"/></svg>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

// Auto-detected base mow angle: direction of the first outline edge longer than
// 2 m (mirrors MowingBehavior). Returns radians (ENU, 0 = East).
function autoBaseAngle(outline: MapPoint[]): number {
  if (outline.length < 2) return 0
  const first = outline[0]
  for (const p of outline) {
    const dx = p.x - first.x
    const dy = p.y - first.y
    if (Math.hypot(dx, dy) > 2) return Math.atan2(dy, dx)
  }
  return 0
}

// Per-zone mowing-direction arrows: solid for a forced angle, dashed for the
// auto base angle.
const MowDirectionLayer = memo(function MowDirectionLayer() {
  const areas = useMapStore((s) => s.areas)

  const items = useMemo(() => {
    return areas
      .filter((a) => a.properties.type === 'mow' && a.outline.length >= 3)
      .map((a) => {
        const xs = a.outline.map((p) => p.x)
        const ys = a.outline.map((p) => p.y)
        const cx = xs.reduce((s, v) => s + v, 0) / xs.length
        const cy = ys.reduce((s, v) => s + v, 0) / ys.length
        const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
        const len = Math.min(8, Math.max(1.5, span * 0.4))
        const fixed = a.properties.fixed_angle ?? false
        const theta = fixed ? ((a.properties.mow_angle ?? 0) * Math.PI) / 180 : autoBaseAngle(a.outline)
        const dx = Math.cos(theta) * (len / 2)
        const dy = Math.sin(theta) * (len / 2)
        return {
          id: a.id,
          fixed,
          theta,
          p1: { x: cx - dx, y: cy - dy },
          p2: { x: cx + dx, y: cy + dy },
        }
      })
  }, [areas])

  return (
    <>
      {items.map((it) => (
        <Fragment key={it.id}>
          <Polyline
            positions={[toLatLng(it.p1), toLatLng(it.p2)]}
            pathOptions={{
              color: '#f1f5f9',
              weight: 2,
              opacity: 0.9,
              dashArray: it.fixed ? undefined : '5,6',
            }}
          />
          <Marker position={toLatLng(it.p2)} icon={arrowIcon(it.theta)} interactive={false} />
        </Fragment>
      ))}
    </>
  )
})

// Incident heatmap: red circles where the robot went into emergency.
function IncidentsLayer() {
  const incidents = useIncidentsStore((s) => s.incidents)
  return (
    <>
      {incidents.map((inc, i) => (
        <CircleMarker
          key={`${inc.t}-${i}`}
          center={toLatLng(inc)}
          radius={10}
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.35, weight: 1 }}
        />
      ))}
    </>
  )
}

export interface RobotMapProps {
  /** Allow zoom/drag. Default true. */
  interactive?: boolean
  /** Show the robot's travelled trail. Default true. */
  showTrail?: boolean
  /** Overlay the incident (emergency) heatmap. */
  showIncidents?: boolean
  /** Overlay the GPS-quality heatmap. */
  showGps?: boolean
  /** Overlay the WiFi-signal heatmap. */
  showWifi?: boolean
  /** Show per-zone mowing-direction arrows. */
  showMowDirection?: boolean
  /** Called when a mowing area is clicked. Enables hover/click affordance. */
  onAreaClick?: (area: MapArea) => void
  /** Called when a docking station is clicked. */
  onDockClick?: () => void
  /** Highlight a specific area id (e.g. selected to mow). */
  highlightedAreaId?: string | null
  /** Draw the robot trail as a thick semi-transparent coverage path. */
  coverage?: boolean
  className?: string
}

// Static layers (areas + docking stations). Memoised and isolated from the
// high-frequency robot/trail updates so the ~10k area points are NOT rebuilt on
// every position tick (the main source of UI jank).
const StaticLayers = memo(function StaticLayers({
  onAreaClick,
  onDockClick,
  highlightedAreaId,
}: {
  onAreaClick?: (area: MapArea) => void
  onDockClick?: () => void
  highlightedAreaId?: string | null
}) {
  const areas = useMapStore((s) => s.areas)
  const dockingStations = useMapStore((s) => s.dockingStations)

  const polygons = useMemo(
    () =>
      areas.map((area) => {
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
            eventHandlers={clickable ? { click: () => onAreaClick?.(area) } : undefined}
          />
        )
      }),
    [areas, highlightedAreaId, onAreaClick],
  )

  return (
    <>
      {polygons}
      {dockingStations.map((ds) => (
        <Marker
          key={ds.id}
          position={toLatLng(ds.position)}
          icon={dockIcon(ds.heading ?? 0)}
          eventHandlers={onDockClick ? { click: () => onDockClick() } : undefined}
        />
      ))}
    </>
  )
})

// High-frequency layers (robot marker + trail). Only this small subtree
// re-renders on position updates.
function DynamicLayers({ showTrail }: { showTrail: boolean }) {
  const position = useMapStore((s) => s.position)
  const trail = useMapStore((s) => s.trail)
  const trailLatLngs = useMemo(() => trail.map(toLatLng), [trail])

  return (
    <>
      {showTrail && trailLatLngs.length > 1 && (
        <Polyline
          positions={trailLatLngs}
          pathOptions={{ color: '#10b981', weight: 2, opacity: 0.5 }}
        />
      )}
      {position && (
        <Marker
          position={toLatLng(position)}
          icon={robotIcon(position.heading)}
          zIndexOffset={1000}
        />
      )}
    </>
  )
}

export function RobotMap({
  interactive = true,
  showTrail = true,
  showIncidents = false,
  showGps = false,
  showWifi = false,
  showMowDirection = false,
  onAreaClick,
  onDockClick,
  highlightedAreaId,
  coverage = false,
  className,
}: RobotMapProps) {
  return (
    <MapContainer
      crs={L.CRS.Simple}
      center={[0, 0]}
      zoom={4}
      preferCanvas
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
      {coverage && <CoverageLayer />}
      {showGps && <GpsHeatmap />}
      {showWifi && <WifiHeatmap />}
      <StaticLayers
        onAreaClick={onAreaClick}
        onDockClick={onDockClick}
        highlightedAreaId={highlightedAreaId}
      />
      {showIncidents && <IncidentsLayer />}
      {showMowDirection && <MowDirectionLayer />}
      <DynamicLayers showTrail={showTrail} />
    </MapContainer>
  )
}
