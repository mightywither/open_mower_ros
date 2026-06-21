import { useEffect, useState } from 'react'
import { Save, RefreshCw, Wifi, Bot, CloudRain, Bell } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { useSettingsStore } from '../store/settingsStore'
import { useMqttStore } from '../store/mqttStore'
import { useMapStore } from '../store/mapStore'
import { useSchedulerStore } from '../store/schedulerStore'
import { useNotifyStore, NOTIFY_EVENT_KEYS, type NotifyEvents } from '../store/notifyStore'

const AUTO_MODES = [
  { value: 0, label: 'Manuel', desc: 'Ne démarre jamais seul' },
  { value: 1, label: 'Semi-auto', desc: 'Une tâche à la fois' },
  { value: 2, label: 'Automatique', desc: 'Reprend après charge' },
]

const RAIN_MODES = [
  { value: 0, label: 'Ignorer', desc: 'Continue sous la pluie' },
  { value: 1, label: 'Dock', desc: 'Rentre à la base' },
  { value: 2, label: 'Dock + sec', desc: 'Attend que ce soit sec' },
  { value: 3, label: 'Pause auto', desc: 'Met en pause' },
]

const NOTIFY_LABELS: Record<keyof NotifyEvents, string> = {
  emergency: 'Urgence déclenchée',
  emergency_cleared: 'Urgence levée',
  stuck: 'Robot bloqué',
  docking_success: 'Retour base réussi',
  docking_failed: 'Échec retour base',
}

function LabeledInput({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string
  description?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-300">{label}</label>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-slate-700 bg-surface-2 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </div>
  )
}

export function Settings() {
  const { brokerUrl, setBrokerUrl } = useSettingsStore()
  const connected = useMqttStore((s) => s.connected)
  const publish = useMqttStore((s) => s.publish)
  const clearTrail = useMapStore((s) => s.clearTrail)
  const autoMode = useSchedulerStore((s) => s.autoMode)
  const rainMode = useSchedulerStore((s) => s.rainMode)
  const schedulerLoaded = useSchedulerStore((s) => s.loaded)

  const notify = useNotifyStore()

  const [localBrokerUrl, setLocalBrokerUrl] = useState(brokerUrl)
  const [saved, setSaved] = useState(false)
  const [localNtfyUrl, setLocalNtfyUrl] = useState(notify.ntfyUrl)
  const [ntfySaved, setNtfySaved] = useState(false)

  // Keep the local ntfy field in sync when the retained state arrives.
  useEffect(() => {
    setLocalNtfyUrl(notify.ntfyUrl)
  }, [notify.ntfyUrl])

  function setAutoMode(mode: number) {
    publish('scheduler/cmd', JSON.stringify({ cmd: 'set_auto_mode', mode }))
  }

  function setRainMode(value: number) {
    publish('scheduler/cmd', JSON.stringify({ cmd: 'set_param', name: 'rain_mode', value }))
  }

  function toggleNotifyEvent(key: keyof NotifyEvents) {
    publish(
      'notify/cmd',
      JSON.stringify({ cmd: 'set', events: { [key]: !notify.events[key] } }),
    )
  }

  function saveNtfyUrl() {
    publish('notify/cmd', JSON.stringify({ cmd: 'set', ntfy_url: localNtfyUrl }))
    setNtfySaved(true)
    setTimeout(() => setNtfySaved(false), 2000)
  }

  function handleSave() {
    setBrokerUrl(localBrokerUrl)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Wifi size={13} /> Connexion MQTT
          </CardTitle>
          <div
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
              connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
            }`}
          >
            <div className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {connected ? 'Connecté' : 'Déconnecté'}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LabeledInput
            label="URL du broker MQTT"
            description="URL WebSocket du broker mosquitto. Par défaut : ws://<ip-robot>:9001"
            value={localBrokerUrl}
            onChange={setLocalBrokerUrl}
            placeholder="ws://openmower.local:9001"
          />
          <p className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-400">
            Modifier l'URL entraîne une reconnexion au broker. Assurez-vous que la branche{' '}
            <code className="font-mono">feat/events-and-position</code> est déployée sur le robot.
          </p>
          <Button onClick={handleSave} className="w-full sm:w-auto">
            <Save size={15} />
            {saved ? 'Enregistré !' : 'Enregistrer'}
          </Button>
        </CardContent>
      </Card>

      {/* Automatic mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Bot size={13} /> Mode automatique
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!schedulerLoaded ? (
            <p className="text-xs text-slate-500">
              En attente du service <code className="font-mono">mower_scheduler</code>…
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {AUTO_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setAutoMode(m.value)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-3 text-center transition-colors ${
                    autoMode === m.value
                      ? 'border-emerald-600 bg-emerald-500/10'
                      : 'border-surface-2 hover:bg-surface-2'
                  }`}
                >
                  <span className="text-sm font-medium text-white">{m.label}</span>
                  <span className="text-[10px] leading-tight text-slate-500">{m.desc}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">
            En mode <strong>Automatique</strong>, le robot reprend la tonte automatiquement après
            avoir chargé et suit la planification.
          </p>
        </CardContent>
      </Card>

      {/* Rain mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <CloudRain size={13} /> Mode pluie
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!schedulerLoaded ? (
            <p className="text-xs text-slate-500">
              En attente du service <code className="font-mono">mower_scheduler</code>…
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RAIN_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setRainMode(m.value)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-3 text-center transition-colors ${
                    rainMode === m.value
                      ? 'border-emerald-600 bg-emerald-500/10'
                      : 'border-surface-2 hover:bg-surface-2'
                  }`}
                >
                  <span className="text-sm font-medium text-white">{m.label}</span>
                  <span className="text-[10px] leading-tight text-slate-500">{m.desc}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Comportement du robot lorsque la pluie est détectée pendant la tonte.
          </p>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Bell size={13} /> Notifications (ntfy)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!notify.loaded ? (
            <p className="text-xs text-slate-500">
              En attente du service <code className="font-mono">mower_notify</code>…
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">URL ntfy</label>
                <p className="text-xs text-slate-500">
                  URL du sujet ntfy.sh recevant les notifications push.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={localNtfyUrl}
                    onChange={(e) => setLocalNtfyUrl(e.target.value)}
                    placeholder="https://ntfy.sh/mon-sujet"
                    className="flex-1 rounded-lg border border-slate-700 bg-surface-2 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <Button onClick={saveNtfyUrl} size="sm" className="shrink-0">
                    <Save size={14} />
                    {ntfySaved ? 'Enregistré !' : 'Enregistrer'}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-300">Événements notifiés</span>
                {NOTIFY_EVENT_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-surface-2 bg-surface-2/40 px-3 py-2"
                  >
                    <span className="text-sm text-slate-300">{NOTIFY_LABELS[key]}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notify.events[key]}
                      onClick={() => toggleNotifyEvent(key)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                        notify.events[key] ? 'bg-emerald-600' : 'bg-slate-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                          notify.events[key] ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </label>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Map */}
      <Card>
        <CardHeader>
          <CardTitle>Carte</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-slate-500">
            La trace (ligne fine) est gardée en mémoire jusqu'au rechargement. La couverture de
            tonte (cellules vertes) est persistée sur le robot.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={clearTrail}>
              <RefreshCw size={14} />
              Effacer la trace
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm('Réinitialiser la couverture de tonte enregistrée ?')) {
                  publish('coverage/cmd', JSON.stringify({ cmd: 'clear' }))
                }
              }}
            >
              <RefreshCw size={14} />
              Réinitialiser la couverture
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>À propos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-xs text-slate-500">
          <p>OpenMower Web UI · React + Vite + MQTT</p>
          <p>
            Communique via MQTT WebSocket avec{' '}
            <code className="font-mono text-slate-400">xbot_monitoring</code>.
          </p>
          <p className="mt-1">
            Topics : <code className="font-mono">robot_state/json</code>,{' '}
            <code className="font-mono">position/json</code>,{' '}
            <code className="font-mono">map/json</code>,{' '}
            <code className="font-mono">events/json</code>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
