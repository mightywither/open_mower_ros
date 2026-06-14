import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { LineChart as LineChartIcon, Battery, Zap, Thermometer } from 'lucide-react'
import { useSensorHistoryStore, type HistorySample } from '../store/sensorHistoryStore'
import { useSensorsStore } from '../store/sensorsStore'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface Series {
  key: string // history-store key
  name: string
  unit: string
}

function MiniChart({
  title,
  icon,
  series,
  color,
  unit,
}: {
  title: string
  icon: React.ReactNode
  series: HistorySample[]
  color: string
  unit: string
}) {
  const data = useMemo(
    () =>
      series.map((s) => ({
        t: s.ts,
        label: new Date(s.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        value: s.value,
      })),
    [series],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <div className="flex h-40 items-center justify-center text-xs text-slate-500">
            Collecte des données…
          </div>
        ) : (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} minTickGap={32} />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} domain={['auto', 'auto']} width={40} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#cbd5e1' }}
                  formatter={(v: number) => [`${v.toFixed(1)}${unit ? ' ' + unit : ''}`, title]}
                />
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const PALETTE = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4']

export function SensorCharts() {
  const seriesMap = useSensorHistoryStore((s) => s.series)
  const infos = useSensorsStore((s) => s.infos)

  // Build the list of numeric series worth charting: battery + voltages + temperatures.
  const { voltages, temps } = useMemo(() => {
    const voltages: Series[] = []
    const temps: Series[] = []
    for (const id of Object.keys(infos)) {
      const info = infos[id]
      if (info.value_type !== 'DOUBLE') continue
      const entry: Series = { key: `sensor:${id}`, name: info.sensor_name, unit: info.unit }
      if (info.value_description === 'VOLTAGE') voltages.push(entry)
      else if (info.value_description === 'TEMPERATURE') temps.push(entry)
    }
    voltages.sort((a, b) => a.name.localeCompare(b.name))
    temps.sort((a, b) => a.name.localeCompare(b.name))
    return { voltages, temps }
  }, [infos])

  const batterySeries = seriesMap['robot:battery'] ?? []
  const hasBattery = batterySeries.length > 0

  if (!hasBattery && voltages.length === 0 && temps.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-slate-400">
        <LineChartIcon size={14} /> Graphiques (10 dernières minutes)
      </h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {hasBattery && (
          <MiniChart
            title="Batterie"
            icon={<Battery size={13} />}
            series={batterySeries}
            color="#10b981"
            unit="%"
          />
        )}
        {voltages.map((s, i) => (
          <MiniChart
            key={s.key}
            title={s.name}
            icon={<Zap size={13} />}
            series={seriesMap[s.key] ?? []}
            color={PALETTE[(i + 1) % PALETTE.length]}
            unit={s.unit}
          />
        ))}
        {temps.map((s, i) => (
          <MiniChart
            key={s.key}
            title={s.name}
            icon={<Thermometer size={13} />}
            series={seriesMap[s.key] ?? []}
            color={PALETTE[(i + 3) % PALETTE.length]}
            unit={s.unit}
          />
        ))}
      </div>
    </div>
  )
}
