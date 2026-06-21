import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MqttProvider } from './components/MqttProvider'
import { MowController } from './components/MowController'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { MapView } from './pages/MapView'
import { MapEditor } from './pages/MapEditor'
import { MapEdit } from './pages/MapEdit'
import { Teleop } from './pages/Teleop'
import { Sensors } from './pages/Sensors'
import { Stats } from './pages/Stats'
import { Planning } from './pages/Planning'
import { History } from './pages/History'
import { Incidents } from './pages/Incidents'
import { Events } from './pages/Events'
import { Settings } from './pages/Settings'

export function App() {
  return (
    <BrowserRouter>
      <MqttProvider>
        <MowController />
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/map-editor" element={<MapEditor />} />
            <Route path="/map-edit" element={<MapEdit />} />
            <Route path="/teleop" element={<Teleop />} />
            <Route path="/sensors" element={<Sensors />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/history" element={<History />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/events" element={<Events />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </MqttProvider>
    </BrowserRouter>
  )
}
