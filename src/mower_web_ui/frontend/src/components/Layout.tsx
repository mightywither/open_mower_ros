import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Map,
  Layers,
  Gamepad2,
  Bell,
  Settings,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react'
import { useMqttStore } from '../store/mqttStore'
import { useRobotStore } from '../store/robotStore'
import { cn } from '../shared/utils'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Accueil' },
  { to: '/map', icon: Map, label: 'Carte' },
  { to: '/map-editor', icon: Layers, label: 'Zones' },
  { to: '/control', icon: Gamepad2, label: 'Contrôle' },
  { to: '/events', icon: Bell, label: 'Événements' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const connected = useMqttStore((s) => s.connected)
  const emergency = useRobotStore((s) => s.emergency)
  const publish = useMqttStore((s) => s.publish)

  function handleEmergency() {
    publish('action', 'mower_logic/reset_emergency')
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="z-20 flex items-center justify-between border-b border-surface-2 bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-primary-light">OpenMower</span>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs',
              connected
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-slate-800 text-slate-500',
            )}
          >
            {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {connected ? 'Connecté' : 'Déconnecté'}
          </div>
        </div>

        <button
          onClick={handleEmergency}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-all',
            emergency
              ? 'animate-pulse bg-red-600 text-white shadow-lg shadow-red-900'
              : 'bg-red-950 text-red-400 hover:bg-red-600 hover:text-white',
          )}
        >
          <AlertTriangle size={15} />
          {emergency ? 'URGENCE' : 'Urgence'}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <nav className="hidden w-44 flex-col gap-0.5 border-r border-surface-2 bg-surface p-2 md:flex">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-slate-400 hover:bg-surface-2 hover:text-white',
                )
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="z-20 flex items-center justify-around border-t border-surface-2 bg-surface py-1 md:hidden">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5 text-xs transition-colors',
                isActive ? 'text-emerald-400' : 'text-slate-500',
              )
            }
          >
            <Icon size={21} />
            <span className="leading-none">{label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
