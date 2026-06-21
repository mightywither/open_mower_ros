import { useMemo } from 'react'
import { Plus, Trash2, Play, Home, CalendarClock, Power, MapPin } from 'lucide-react'
import { useMqttStore } from '../store/mqttStore'
import { useSchedulerStore, type ScheduleEntry } from '../store/schedulerStore'
import { useMapStore } from '../store/mapStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function newId() {
  return Math.random().toString(36).slice(2, 8)
}

export function Planning() {
  const publish = useMqttStore((s) => s.publish)
  const connected = useMqttStore((s) => s.connected)
  const { enabled, schedule, loaded, autoMode } = useSchedulerStore()
  const areas = useMapStore((s) => s.areas)

  // Mow areas only; their position in this list IS the area_index.
  const mowAreas = useMemo(
    () => areas.filter((a) => a.properties.type === 'mow'),
    [areas],
  )

  function pushSchedule(next: ScheduleEntry[]) {
    publish('scheduler/cmd', JSON.stringify({ cmd: 'set_schedule', schedule: next }))
  }

  function setEnabled(value: boolean) {
    publish('scheduler/cmd', JSON.stringify({ cmd: 'set_enabled', enabled: value }))
  }

  function addEntry() {
    pushSchedule([
      ...schedule,
      {
        id: newId(),
        days: [0, 1, 2, 3, 4],
        start: '10:00',
        end: null,
        enabled: true,
        area_index: null,
        area_name: '',
      },
    ])
  }

  function updateEntry(id: string, patch: Partial<ScheduleEntry>) {
    pushSchedule(schedule.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  function removeEntry(id: string) {
    pushSchedule(schedule.filter((e) => e.id !== id))
  }

  function toggleDay(entry: ScheduleEntry, day: number) {
    const days = entry.days.includes(day)
      ? entry.days.filter((d) => d !== day)
      : [...entry.days, day].sort((a, b) => a - b)
    updateEntry(entry.id, { days })
  }

  function setEntryArea(entry: ScheduleEntry, value: string) {
    if (value === '') {
      updateEntry(entry.id, { area_index: null, area_name: '' })
      return
    }
    const idx = Number(value)
    const area = mowAreas[idx]
    updateEntry(entry.id, {
      area_index: idx,
      area_name: area?.properties.name ?? '',
    })
  }

  if (!connected) {
    return (
      <div className="p-4 text-center text-sm text-slate-500">
        Non connecté au robot. La planification sera disponible une fois connecté.
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="p-4 text-center text-sm text-slate-500">
        En attente du planificateur… (vérifie que le service <code>mower_scheduler</code> tourne)
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <CalendarClock size={20} /> Planification
        </h1>
        <Button
          variant={enabled ? 'default' : 'outline'}
          size="sm"
          onClick={() => setEnabled(!enabled)}
        >
          <Power size={14} />
          {enabled ? 'Planning actif' : 'Planning désactivé'}
        </Button>
      </div>

      {loaded && autoMode !== 0 && autoMode !== null && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
          La planification ne s'applique qu'en mode <strong>Manuel</strong>. En Semi-auto / Auto le
          robot gère lui-même la tonte. Change le mode dans <strong>Paramètres</strong>.
        </div>
      )}

      {/* Manual triggers */}
      <Card>
        <CardHeader>
          <CardTitle>Déclenchement manuel</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            variant="default"
            className="flex-1"
            onClick={() => publish('scheduler/cmd', JSON.stringify({ cmd: 'trigger_now', action: 'start' }))}
          >
            <Play size={16} /> Tondre maintenant
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => publish('scheduler/cmd', JSON.stringify({ cmd: 'trigger_now', action: 'home' }))}
          >
            <Home size={16} /> Rentrer
          </Button>
        </CardContent>
      </Card>

      {/* Schedule entries */}
      {schedule.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-700 py-8 text-center text-sm text-slate-500">
          Aucun créneau. Ajoute un horaire de tonte ci-dessous.
        </div>
      )}

      {schedule.map((entry) => (
        <Card key={entry.id} className={entry.enabled ? '' : 'opacity-60'}>
          <CardContent className="flex flex-col gap-3 pt-4">
            {/* Days */}
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((label, day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(entry, day)}
                  className={`h-9 w-10 rounded-lg text-xs font-medium transition-colors ${
                    entry.days.includes(day)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-surface-2 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Times */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                Début
                <input
                  type="time"
                  value={entry.start}
                  onChange={(e) => updateEntry(entry.id, { start: e.target.value })}
                  className="rounded-lg border border-surface-2 bg-surface-2 px-2 py-1 text-white"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                Fin
                <input
                  type="time"
                  value={entry.end ?? ''}
                  onChange={(e) => updateEntry(entry.id, { end: e.target.value || null })}
                  className="rounded-lg border border-surface-2 bg-surface-2 px-2 py-1 text-white"
                />
                <span className="text-xs text-slate-500">(optionnel → retour base)</span>
              </label>
            </div>

            {/* Target mow area */}
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <MapPin size={14} className="shrink-0 text-slate-400" />
              Zone
              <select
                value={entry.area_index ?? ''}
                onChange={(e) => setEntryArea(entry, e.target.value)}
                className="flex-1 rounded-lg border border-surface-2 bg-surface-2 px-2 py-1 text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Toutes les zones</option>
                {mowAreas.map((a, idx) => (
                  <option key={a.id} value={idx}>
                    {a.properties.name || `Zone #${idx}`}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-between">
              <Button
                variant={entry.enabled ? 'ghost' : 'outline'}
                size="sm"
                onClick={() => updateEntry(entry.id, { enabled: !entry.enabled })}
              >
                <Power size={13} />
                {entry.enabled ? 'Activé' : 'Désactivé'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => removeEntry(entry.id)}>
                <Trash2 size={14} className="text-red-400" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" onClick={addEntry}>
        <Plus size={16} /> Ajouter un créneau
      </Button>

      <p className="rounded-lg border border-slate-800 p-3 text-xs text-slate-500">
        Les créneaux déclenchent la tonte à l'heure de début (et le retour à la base à l'heure de
        fin si renseignée). Pour que le robot reprenne seul après charge, active le mode automatique
        dans les Paramètres.
      </p>
    </div>
  )
}
