import { useMemo } from 'react'
import { Zap, Thermometer, Gauge, Battery } from 'lucide-react'
import { useSensorsStore, sensorSeverity, type SensorInfo, type SensorValue } from '../store/sensorsStore'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

function formatValue(info: SensorInfo, v: SensorValue): string {
  if (typeof v.value === 'string') return v.value
  if (Number.isNaN(v.value)) return '—'
  const decimals = info.unit === 'rpm' || info.unit === '' ? 0 : info.value_description === 'VOLTAGE' ? 2 : 1
  return `${v.value.toFixed(decimals)}${info.unit ? ' ' + info.unit : ''}`
}

interface Group {
  key: string
  title: string
  icon: React.ReactNode
  match: (d: string) => boolean
}

const GROUPS: Group[] = [
  { key: 'power', title: 'Alimentation', icon: <Zap size={13} />, match: (d) => d === 'VOLTAGE' || d === 'CURRENT' },
  { key: 'temp', title: 'Températures', icon: <Thermometer size={13} />, match: (d) => d === 'TEMPERATURE' },
  { key: 'other', title: 'Autres capteurs', icon: <Gauge size={13} />, match: () => true },
]

export function SensorsPanel() {
  const infos = useSensorsStore((s) => s.infos)
  const values = useSensorsStore((s) => s.values)

  const grouped = useMemo(() => {
    const ids = Object.keys(infos)
    const result: Record<string, string[]> = { power: [], temp: [], other: [] }
    for (const id of ids) {
      const desc = infos[id].value_description
      const group = GROUPS.find((g) => g.match(desc))!
      result[group.key].push(id)
    }
    return result
  }, [infos])

  const hasAny = Object.keys(infos).length > 0

  if (!hasAny) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Battery size={13} /> Capteurs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-3 text-center text-sm text-slate-500">
            En attente des données capteurs…
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {GROUPS.map((g) => {
        const ids = grouped[g.key].sort((a, b) =>
          infos[a].sensor_name.localeCompare(infos[b].sensor_name),
        )
        if (!ids.length) return null
        return (
          <Card key={g.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                {g.icon} {g.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ids.map((id) => {
                  const info = infos[id]
                  const val = values[id]
                  const critical = val && sensorSeverity(info, val.value) === 'critical'
                  return (
                    <div
                      key={id}
                      className={`rounded-lg border px-3 py-2 ${
                        critical ? 'border-red-700 bg-red-950/40' : 'border-surface-2 bg-surface-2/50'
                      }`}
                    >
                      <div className="truncate text-xs text-slate-400">{info.sensor_name}</div>
                      <div
                        className={`mt-0.5 text-lg font-semibold ${
                          critical ? 'text-red-400' : 'text-white'
                        }`}
                      >
                        {val ? formatValue(info, val) : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
