import { motion } from 'framer-motion'
import { Logo, IconCompare, IconMoon, IconSun } from './index.jsx'
import StatusIndicator from '../Common/StatusIndicator.jsx'

const ITEMS = [
  { id: 'system', label: 'Solar System', icon: <IconSun className="h-3.5 w-3.5" /> },
  { id: 'moon', label: 'Moon', icon: <IconMoon className="h-3.5 w-3.5" /> },
  { id: 'compare', label: 'Compare', icon: <IconCompare className="h-3.5 w-3.5" /> },
]

function ModeToggle({ mode, onMode, light }) {
  const base = light ? 'border-slate-300 bg-slate-100' : 'glass'
  return (
    <div className={`flex items-center gap-0.5 rounded-lg border p-0.5 ${base}`} role="radiogroup" aria-label="Interface mode">
      {[['explorer', 'Explorer'], ['planner', 'Planner']].map(([id, label]) => {
        const on = mode === id
        const cls = light
          ? on ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          : on ? 'bg-accent/15 text-accent ring-1 ring-accent/40' : 'text-ink-muted hover:text-ink-dim'
        return (
          <button key={id} type="button" role="radio" aria-checked={on} onClick={() => onMode(id)} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${cls}`}>
            {label}<span className="hidden lg:inline"> Mode</span>
          </button>
        )
      })}
    </div>
  )
}

export default function TopBar({ view, mode, onNavigate, onMode, backendOk, onRecheck }) {
  if (mode === 'planner') {
    return (
      <header className="fixed inset-x-0 top-0 z-50 flex h-[3.25rem] items-center justify-between gap-3 border-b border-slate-300 bg-white px-3 md:px-5">
        <button type="button" onClick={() => onMode('explorer')} className="rounded p-0.5 hover:bg-slate-100" aria-label="Lunar Selenix — back to Explorer">
          <span className="hidden sm:block"><Logo light small /></span>
          <span className="sm:hidden"><Logo compact small /></span>
        </button>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:inline">Mission planning workspace</span>
          <ModeToggle mode={mode} onMode={onMode} light />
        </div>
        <StatusIndicator ok={backendOk} onRetry={onRecheck} compact light />
      </header>
    )
  }

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-2 px-3 py-3 md:px-6"
    >
      <button type="button" onClick={() => onNavigate('system')} className="pointer-events-auto rounded-xl p-1 transition hover:bg-white/5" aria-label="Lunar Selenix home">
        <span className="hidden xl:block"><Logo /></span>
        <span className="xl:hidden"><Logo compact /></span>
      </button>

      <div className="pointer-events-auto flex items-center gap-2">
        <nav className="glass flex items-center gap-1 p-1">
          {ITEMS.map((it) => {
            const active = view === it.id
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onNavigate(it.id)}
                className={`relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-display text-xs font-medium transition md:px-3 ${active ? 'text-ink' : 'text-ink-muted hover:text-ink-dim'}`}
                aria-current={active ? 'page' : undefined}
              >
                {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-white/[0.06] ring-1 ring-accent/30" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                <span className="relative flex items-center gap-2">{it.icon}<span className="hidden md:inline">{it.label}</span></span>
              </button>
            )
          })}
        </nav>
        <ModeToggle mode={mode} onMode={onMode} />
      </div>

      <div className="pointer-events-auto">
        <StatusIndicator ok={backendOk} onRetry={onRecheck} compact />
      </div>
    </motion.header>
  )
}
