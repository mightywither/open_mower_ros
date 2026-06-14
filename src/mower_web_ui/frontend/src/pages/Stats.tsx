import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { BarChart3, Clock, CalendarDays, Hourglass, Timer, Play } from 'lucide-react'
import { useStatsStore } from '../store/statsStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { formatDuration } from '../shared/utils'

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">{value}</div>
      </CardContent>
    </Card>
  )
}

export function Stats() {
  const { totals, history, current, loaded } = useStatsStore()
  const [now, setNow] = useState(Date.now())

  // Live ticker for the current-session elapsed time.
  useEffect(() => {
    if (!current.mowing) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [current.mowing])

  const sessionElapsed = useMemo(() => {
    if (!current.mowing || !current.session_start_iso) return null
    const start = Date.parse(current.session_start_iso)
    if (Number.isNaN(start)) return null
    return Math.max(0, (now - start) / 1000)
  }, [current, now])

  // Last 14 days, padded so missing days show as 0.
  const chartData = useMemo(() => {
    const byDate = new Map(history.map((h) => [h.date, h.duration_s]))
    const days: { date: string; label: string; minutes: number }[] = []
    const today = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      days.push({
        date: iso,
        label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        minutes: Math.round((byDate.get(iso) ?? 0) / 60),
      })
    }
    return days
  }, [history])

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
        <BarChart3 size={20} /> Statistiques de tonte
      </h1>

      {!loaded && (
        <div className="rounded-lg border border-dashed border-slate-700 py-8 text-center text-sm text-slate-500">
          En attente des statistiques… (topic <code className="font-mono">stats/json</code>)
        </div>
      )}

      {/* Current session */}
      {current.mowing && (
        <Card className="border-emerald-700/50 bg-emerald-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-emerald-400">
              <Play size={13} /> Session en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {sessionElapsed !== null ? formatDuration(sessionElapsed) : 'En cours…'}
            </div>
            <div className="mt-1 text-xs text-slate-500">Temps écoulé depuis le démarrage</div>
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Clock size={13} />} label="Aujourd'hui" value={formatDuration(totals.today_s)} />
        <StatTile icon={<CalendarDays size={13} />} label="Cette semaine" value={formatDuration(totals.week_s)} />
        <StatTile icon={<Hourglass size={13} />} label="Total" value={formatDuration(totals.total_s)} />
        <StatTile icon={<Timer size={13} />} label="Sessions" value={String(totals.sessions)} />
      </div>

      {/* 14-day chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <BarChart3 size={13} /> Tonte sur 14 jours (minutes)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={42} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#1e293b66' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#cbd5e1' }}
                  formatter={(v: number) => [`${v} min`, 'Tonte']}
                />
                <Bar dataKey="minutes" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
