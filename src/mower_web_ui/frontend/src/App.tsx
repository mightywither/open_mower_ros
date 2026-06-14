import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MqttProvider } from './components/MqttProvider'
import { MowController } from './components/MowController'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { MapView } from './pages/MapView'
import { MapEditor } from './pages/MapEditor'
import { Control } from './pages/Control'
import { Teleop } from './pages/Teleop'
import { Sensors } from './pages/Sensors'
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
            <Route path="/control" element={<Control />} />
            <Route path="/teleop" element={<Teleop />} />
            <Route path="/sensors" element={<Sensors />} />
            <Route path="/events" element={<Events />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </MqttProvider>
    </BrowserRouter>
  )
}
