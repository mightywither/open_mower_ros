import { useState } from 'react'
import { Footprints } from 'lucide-react'
import { RobotMap } from '../components/RobotMap'
import { useRobotStore } from '../store/robotStore'
import { cn } from '../shared/utils'

const LEGEND = [
  { color: '#10b981', label: 'Tonte' },
  { color: '#3b82f6', label: 'Navigation' },
  { color: '#ef4444', label: 'Obstacle' },
  { color: '#f59e0b', label: 'Base' },
]

export function MapView() {
  const state = useRobotStore((s) => s.state)
  const [coverage, setCoverage] = useState(false)

  return (
    <div className="relative flex h-full flex-col">
      {/* Legend */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1 rounded-lg border border-surface-2 bg-surface/90 p-2 backdrop-blur-sm">
        <div className="mb-1 text-xs font-medium text-slate-400">Légende</div>
        {LEGEND.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-slate-300">
            <div className="h-2 w-4 rounded-sm" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
      </div>

      {/* State badge + coverage toggle */}
      <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2">
        <div className="rounded-lg border border-surface-2 bg-surface/90 px-2 py-1 text-xs text-slate-300 backdrop-blur-sm">
          {state}
        </div>
        <button
          onClick={() => setCoverage((c) => !c)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs backdrop-blur-sm transition-colors',
            coverage
              ? 'border-emerald-600 bg-emerald-500/20 text-emerald-300'
              : 'border-surface-2 bg-surface/90 text-slate-300 hover:bg-surface-2',
          )}
        >
          <Footprints size={13} /> Couverture
        </button>
      </div>

      <RobotMap className="flex-1" coverage={coverage} />
    </div>
  )
}
