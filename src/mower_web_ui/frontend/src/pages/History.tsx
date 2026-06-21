import { useEffect, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { History as HistoryIcon, RefreshCw } from 'lucide-react'
import { useMqttStore } from '../store/mqttStore'
import { useHistoryStore, type HistoryRange, type HistoryMetric } from '../store/historyStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: 'day', label: '24 h' },
  { value: 'week', label: '7 j' },
  { value: 'month', label: '30 j' },
  { value: 'year', label: '1 an' },
]

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a78bfa', '#22d3ee', '#f472b6', '#84cc16']

function categoryOf(m: HistoryMetric): string {
  const u = m.unit.toLowerCase()
  if (u.includes('c')) return 'Températures'
  if (u === 'v') return 'Tensions'
  if (u === 'a') return 'Courants'
  if (u === '%') return 'Niveaux'
  return 'Autres'
}

function tickFmt(range: HistoryRange) {
  return (t: number) => {
    const d = new Date(t * 1000)
    if (range === 'day') return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  }
}

export function History() {
  const publish = useMqttStore((s) => s.publish)
  const connected = useMqttStore((s) => s.connected)
  const { metrics, series, range, loading, setRange, setLoading } = useHistoryStore()

  function request(r: HistoryRange) {
    setLoading(true)
    publish('history/request', JSON.stringify({ range: r }))
  }

  useEffect(() => {
    if (connected) request(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, range])

  const groups = useMemo(() => {
    const g: Record<string, HistoryMetric[]> = {}
    for (const m of metrics) {
      if (!series[m.key]?.length) continue
      ;(g[categoryOf(m)] ??= []).push(m)
    }
    return g
  }, [metrics, series])

  const fmt = tickFmt(range)
  const hasData = Object.keys(groups).length > 0

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <HistoryIcon size={20} /> Historique
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-surface-2 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  range === r.value ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => request(range)} disabled={!connected}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {!hasData && (
        <div className="rounded-lg border border-dashed border-slate-700 py-8 text-center text-sm text-slate-500">
          {connected
            ? 'Pas encore de données historiques (le service mower_history se remplit avec le temps).'
            : 'Non connecté au robot.'}
        </div>
      )}

      {Object.entries(groups).map(([cat, ms]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle>{cat}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {ms.map((m, idx) => {
              const data = (series[m.key] ?? []).map(([t, v]) => ({ t, v }))
              return (
                <div key={m.key}>
                  <div className="mb-1 text-xs text-slate-400">
                    {m.label} {m.unit && `(${m.unit})`}
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="t"
                        tickFormatter={fmt}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        minTickGap={40}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={40} domain={['auto', 'auto']} />
                      <Tooltip
                        labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleString('fr-FR')}
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke={COLORS[idx % COLORS.length]}
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
