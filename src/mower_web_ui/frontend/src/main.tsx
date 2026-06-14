import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import 'leaflet/dist/leaflet.css'

// Register the service worker so the app is installable on a phone home screen.
// Plain vanilla SW (no build-time plugin) to keep the dependency tree small and
// the lockfile unchanged.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW registration is best-effort; the app still works without it. */
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
