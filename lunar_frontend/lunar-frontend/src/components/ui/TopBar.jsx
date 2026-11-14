import { motion } from 'framer-motion'
import { Logo, StatusDot, IconCompare, IconMoon } from './index.jsx'

export default function TopBar({ view, onNavigate, backendOk, right }) {
  const items = [
    { id: 'landing', label: 'Globe', icon: <IconMoon className="h-3.5 w-3.5" /> },
    { id: 'compare', label: 'Compare', icon: <IconCompare className="h-3.5 w-3.5" /> },
  ]
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-4 py-3 md:px-6"
    >
      <button type="button" onClick={() => onNavigate('landing')} className="pointer-events-auto rounded-xl p-1 transition hover:bg-white/5">
        <Logo />
      </button>

      <nav className="pointer-events-auto glass hidden items-center gap-1 p-1 md:flex">
        {items.map((it) => {
          const active = view === it.id || (it.id === 'landing' && view === 'dashboard')
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onNavigate(it.id)}
              className={`relative flex items-center gap-2 rounded-lg px-3 py-1.5 font-display text-xs font-medium transition ${active ? 'text-ink' : 'text-ink-muted hover:text-ink-dim'}`}
            >
              {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-white/6 ring-1 ring-accent/30" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className="relative flex items-center gap-2">{it.icon}{it.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="pointer-events-auto flex items-center gap-3">
        {right}
        <div className="glass hidden px-3 py-2 sm:block">
          <StatusDot ok={backendOk} label={backendOk ? 'Backend online' : backendOk === false ? 'Backend offline' : 'Connecting'} />
        </div>
        <button type="button" onClick={() => onNavigate('compare')} className="glass pointer-events-auto flex items-center gap-2 px-3 py-2 font-display text-xs font-medium text-ink-dim md:hidden">
          <IconCompare className="h-3.5 w-3.5" /> Compare
        </button>
      </div>
    </motion.header>
  )
}
