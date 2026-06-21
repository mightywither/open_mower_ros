import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, useMap } from 'react-leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { Save, Wand2, RotateCcw, Check, AlertTriangle, Pencil, Download, Upload } from 'lucide-react'
import { useMapStore, type MapArea } from '../store/mapStore'
import { useMqttStore } from '../store/mqttStore'
import { useMapEditStore } from '../store/mapEditStore'
import { Button } from '../components/ui/button'
import { simplifyRing, type XY } from '../shared/geometry'

type AreaType = 'mow' | 'nav' | 'obstacle'

interface ExportedArea {
  type: AreaType
  name: string
  outline: XY[]
  fixed_angle?: boolean
  mow_angle?: number
}

interface ExportedMap {
  areas: ExportedArea[]
  docking_stations: { position: { x: number; y: number }; heading: number }[]
}

const TYPE_COLOR: Record<AreaType, string> = {
  mow: '#10b981',
  nav: '#3b82f6',
  obstacle: '#ef4444',
}

const SIMPLIFY_TOLERANCE = 0.15 // metres

interface OmLayer extends L.Polygon {
  _omType?: AreaType
  _omName?: string
  _omFixedAngle?: boolean
  _omAngle?: number
}

interface EditorActions {
  simplify: () => void
  save: () => void
  reload: () => void
  exportMap: () => ExportedMap
  importMap: (data: ExportedMap) => void
}

// ENU <-> Leaflet CRS.Simple: lat = y (North), lng = x (East).
function ringToXY(layer: L.Polygon): XY[] {
  const latlngs = layer.getLatLngs()[0] as L.LatLng[]
  return latlngs.map((ll) => ({ x: ll.lng, y: ll.lat }))
}
function xyToLatLngs(points: XY[]): L.LatLngTuple[] {
  return points.map((p) => [p.y, p.x])
}

function styleFor(type: AreaType) {
  return { color: TYPE_COLOR[type], fillColor: TYPE_COLOR[type], fillOpacity: 0.2, weight: 2 }
}

function EditorLayer({
  actionsRef,
  newTypeRef,
}: {
  actionsRef: React.MutableRefObject<EditorActions | null>
  newTypeRef: React.MutableRefObject<AreaType>
}) {
  const map = useMap()
  const layersRef = useRef<OmLayer[]>([])
  // Docking stations to save: live from the robot, unless an import overrides them.
  const importedDockingRef = useRef<ExportedMap['docking_stations'] | null>(null)
  const areas = useMapStore.getState().areas
  const dockingStations = useMapStore((s) => s.dockingStations)
  const publish = useMqttStore((s) => s.publish)
  const setSaving = useMapEditStore((s) => s.setSaving)

  useEffect(() => {
    // Load a snapshot of the current areas as editable polygons.
    const bounds: L.LatLngTuple[] = []
    areas.forEach((area: MapArea) => {
      const type = (area.properties.type as AreaType) ?? 'mow'
      const latlngs = xyToLatLngs(area.outline.map((p) => ({ x: p.x, y: p.y })))
      bounds.push(...latlngs)
      const layer = L.polygon(latlngs, styleFor(type)) as OmLayer
      layer._omType = type
      layer._omName = area.properties.name || ''
      layer._omFixedAngle = area.properties.fixed_angle ?? false
      layer._omAngle = area.properties.mow_angle ?? 0
      layer.addTo(map)
      layersRef.current.push(layer)
    })
    if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] })

    // Geoman controls
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawText: false,
      drawRectangle: true,
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      rotateMode: true,
      cutPolygon: false,
      removalMode: true,
    })
    map.pm.setGlobalOptions({ snappable: true, snapDistance: 15, hideMiddleMarkers: false })
    map.pm.setLang('fr')

    const onCreate = (e: { layer: L.Layer }) => {
      const layer = e.layer as OmLayer
      const type = newTypeRef.current
      layer._omType = type
      layer._omName = ''
      if (layer instanceof L.Polygon) layer.setStyle(styleFor(type))
      layersRef.current.push(layer)
    }
    const onRemove = (e: { layer: L.Layer }) => {
      layersRef.current = layersRef.current.filter((l) => l !== e.layer)
    }
    map.on('pm:create', onCreate)
    map.on('pm:remove', onRemove)

    // Replace all editable layers with the given areas.
    const loadAreas = (list: ExportedArea[]) => {
      layersRef.current.forEach((l) => l.remove())
      layersRef.current = []
      const bounds: L.LatLngTuple[] = []
      list.forEach((area) => {
        const latlngs = xyToLatLngs(area.outline)
        bounds.push(...latlngs)
        const layer = L.polygon(latlngs, styleFor(area.type)) as OmLayer
        layer._omType = area.type
        layer._omName = area.name || ''
        layer._omFixedAngle = area.fixed_angle ?? false
        layer._omAngle = area.mow_angle ?? 0
        layer.addTo(map)
        layersRef.current.push(layer)
      })
      if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] })
    }

    const buildPayload = (): ExportedMap => ({
      areas: layersRef.current.map((layer) => ({
        type: layer._omType ?? 'mow',
        name: layer._omName ?? '',
        outline: ringToXY(layer),
        fixed_angle: layer._omFixedAngle ?? false,
        mow_angle: layer._omAngle ?? 0,
      })),
      docking_stations:
        importedDockingRef.current ??
        dockingStations.map((ds) => ({ position: ds.position, heading: ds.heading ?? 0 })),
    })

    actionsRef.current = {
      simplify: () => {
        layersRef.current.forEach((layer) => {
          const simplified = simplifyRing(ringToXY(layer), SIMPLIFY_TOLERANCE)
          layer.setLatLngs(xyToLatLngs(simplified))
          if (layer.pm?.enabled()) {
            layer.pm.disable()
            layer.pm.enable()
          }
        })
      },
      save: () => {
        setSaving(true)
        publish('map/edit', JSON.stringify(buildPayload()))
      },
      reload: () => {
        importedDockingRef.current = null
        loadAreas(
          useMapStore.getState().areas.map((area) => ({
            type: (area.properties.type as AreaType) ?? 'mow',
            name: area.properties.name || '',
            outline: area.outline.map((p) => ({ x: p.x, y: p.y })),
            fixed_angle: area.properties.fixed_angle ?? false,
            mow_angle: area.properties.mow_angle ?? 0,
          })),
        )
      },
      exportMap: buildPayload,
      importMap: (data) => {
        loadAreas(data.areas ?? [])
        importedDockingRef.current = data.docking_stations ?? null
      },
    }

    return () => {
      map.off('pm:create', onCreate)
      map.off('pm:remove', onRemove)
      map.pm.removeControls()
      layersRef.current.forEach((l) => l.remove())
      layersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  return null
}

export function MapEdit() {
  const actionsRef = useRef<EditorActions | null>(null)
  const newTypeRef = useRef<AreaType>('mow')
  const [newType, setNewType] = useState<AreaType>('mow')
  const connected = useMqttStore((s) => s.connected)
  const { saving, lastResult } = useMapEditStore()
  const fileRef = useRef<HTMLInputElement>(null)

  function chooseType(t: AreaType) {
    setNewType(t)
    newTypeRef.current = t
  }

  function handleExport() {
    const data = actionsRef.current?.exportMap()
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openmower-map-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file
    if (!file) return
    file
      .text()
      .then((text) => {
        const data = JSON.parse(text)
        if (!data || !Array.isArray(data.areas)) throw new Error('format invalide')
        actionsRef.current?.importMap(data)
      })
      .catch((err) => alert(`Import impossible : ${err.message ?? err}`))
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="z-10 flex flex-wrap items-center gap-2 border-b border-surface-2 bg-surface p-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Pencil size={15} /> Éditeur de carte
        </span>

        <div className="ml-2 flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
          {(['mow', 'nav', 'obstacle'] as AreaType[]).map((t) => (
            <button
              key={t}
              onClick={() => chooseType(t)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                newType === t ? 'text-white' : 'text-slate-400'
              }`}
              style={newType === t ? { backgroundColor: TYPE_COLOR[t] } : undefined}
            >
              {t === 'mow' ? 'Tonte' : t === 'nav' ? 'Nav' : 'Obstacle'}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={() => actionsRef.current?.simplify()}>
          <Wand2 size={14} /> Simplifier
        </Button>
        <Button variant="ghost" size="sm" onClick={() => actionsRef.current?.reload()}>
          <RotateCcw size={14} /> Recharger
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Importer
        </Button>
        <Button variant="ghost" size="sm" onClick={handleExport}>
          <Download size={14} /> Exporter
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={!connected || saving}
          onClick={() => actionsRef.current?.save()}
        >
          <Save size={14} /> {saving ? 'Envoi…' : 'Sauvegarder'}
        </Button>
      </div>

      {/* Result banner */}
      {lastResult && (
        <div
          className={`flex items-center gap-2 px-3 py-2 text-sm ${
            lastResult.ok ? 'bg-emerald-950/50 text-emerald-300' : 'bg-red-950/50 text-red-300'
          }`}
        >
          {lastResult.ok ? <Check size={15} /> : <AlertTriangle size={15} />}
          {lastResult.ok ? 'Carte enregistrée sur le robot.' : `Échec : ${lastResult.error}`}
        </div>
      )}

      {/* Help */}
      <div className="border-b border-surface-2 bg-surface/60 px-3 py-1.5 text-[11px] text-slate-500">
        Glisse les sommets · clic sur une arête = ajoute un point · clic sur un sommet = supprime ·
        outils à gauche pour déplacer/pivoter/dessiner. Pense à <strong>Simplifier</strong> les zones
        enregistrées au GPS avant d'éditer.
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <MapContainer crs={L.CRS.Simple} center={[0, 0]} zoom={4} className="h-full w-full" attributionControl={false}>
          <EditorLayer actionsRef={actionsRef} newTypeRef={newTypeRef} />
        </MapContainer>
      </div>
    </div>
  )
}
