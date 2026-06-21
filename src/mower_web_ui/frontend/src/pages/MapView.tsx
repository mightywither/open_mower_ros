import { useState } from 'react'
import { Footprints, Satellite, Wifi, Compass, RotateCcw } from 'lucide-react'
import { RobotMap } from '../components/RobotMap'
import { useRobotStore } from '../store/robotStore'
import { useMqttStore } from '../store/mqttStore'
import { cn } from '../shared/utils'

const AREA_LEGEND = [
  { color: '#10b981', label: 'Tonte' },
  { color: '#3b82f6', label: 'Navigation' },
  { color: '#ef4444', label: 'Obstacle' },
  { color: '#f59e0b', label: 'Base' },
]

const HEAT_LEGEND: Record<'gps' | 'wifi', { label: string; scale: string }> = {
  gps: { label: 'Précision GPS', scale: 'vert = bon fix · rouge = dégradé' },
  wifi: { label: 'Signal WiFi', scale: 'vert = fort · rouge = faible' },
}

type Overlay = 'coverage' | 'gps' | 'wifi' | 'direction'
const RESETTABLE: Overlay[] = ['coverage', 'gps', 'wifi']

export function MapView() {
  const state = useRobotStore((s) => s.state)
  const publish = useMqttStore((s) => s.publish)
  const [overlays, setOverlays] = useState<Record<Overlay, boolean>>({
    coverage: true,
    gps: false,
    wifi: false,
    direction: false,
  })

  const toggle = (o: Overlay) => setOverlays((s) => ({ ...s, [o]: !s[o] }))

  function reset(target: Overlay, label: string) {
    if (confirm(`Réinitialiser ${label} ?`)) {
      publish('coverage/cmd', JSON.stringify({ cmd: 'clear', target }))
    }
  }

  const heat = overlays.gps ? 'gps' : overlays.wifi ? 'wifi' : null

  const overlayBtns: { key: Overlay; icon: React.ReactNode; label: string }[] = [
    { key: 'coverage', icon: <Footprints size={13} />, label: 'Couverture' },
    { key: 'gps', icon: <Satellite size={13} />, label: 'GPS' },
    { key: 'wifi', icon: <Wifi size={13} />, label: 'WiFi' },
    { key: 'direction', icon: <Compass size={13} />, label: 'Direction' },
  ]

  return (
    <div className="relative flex h-full flex-col">
      {/* Legend */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1 rounded-lg border border-surface-2 bg-surface/90 p-2 backdrop-blur-sm">
        <div className="mb-1 text-xs font-medium text-slate-400">Légende</div>
        {AREA_LEGEND.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-slate-300">
            <div className="h-2 w-4 rounded-sm" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
        {heat && (
          <div className="mt-1 border-t border-surface-2 pt-1">
            <div className="text-xs font-medium text-slate-300">{HEAT_LEGEND[heat].label}</div>
            <div className="text-[10px] text-slate-500">{HEAT_LEGEND[heat].scale}</div>
          </div>
        )}
      </div>

      {/* State badge + overlay toggles */}
      <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2">
        <div className="rounded-lg border border-surface-2 bg-surface/90 px-2 py-1 text-xs text-slate-300 backdrop-blur-sm">
          {state}
        </div>
        {overlayBtns.map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs backdrop-blur-sm transition-colors',
              overlays[key]
                ? 'border-emerald-600 bg-emerald-500/20 text-emerald-300'
                : 'border-surface-2 bg-surface/90 text-slate-300 hover:bg-surface-2',
            )}
          >
            {icon} {label}
            {overlays[key] && RESETTABLE.includes(key) && (
              <RotateCcw
                size={12}
                className="ml-1 text-slate-400 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation()
                  reset(key, label)
                }}
              />
            )}
          </button>
        ))}
      </div>

      <RobotMap
        className="flex-1"
        coverage={overlays.coverage}
        showGps={overlays.gps}
        showWifi={overlays.wifi}
        showMowDirection={overlays.direction}
      />
    </div>
  )
}
