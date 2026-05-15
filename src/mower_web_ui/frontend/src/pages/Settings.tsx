import { useState } from 'react'
import { Save, RefreshCw, Wifi } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { useSettingsStore } from '../store/settingsStore'
import { useMqttStore } from '../store/mqttStore'
import { useMapStore } from '../store/mapStore'

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
  const clearTrail = useMapStore((s) => s.clearTrail)

  const [localBrokerUrl, setLocalBrokerUrl] = useState(brokerUrl)
  const [saved, setSaved] = useState(false)

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

      {/* Map */}
      <Card>
        <CardHeader>
          <CardTitle>Carte</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-slate-500">
            La trace de déplacement du robot est conservée en mémoire jusqu'au rechargement de la
            page.
          </p>
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={clearTrail}>
            <RefreshCw size={14} />
            Effacer la trace
          </Button>
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
