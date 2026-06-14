import { SensorsPanel } from '../components/SensorsPanel'

export function Sensors() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-white">Capteurs &amp; alimentation</h1>
      <SensorsPanel />
    </div>
  )
}
