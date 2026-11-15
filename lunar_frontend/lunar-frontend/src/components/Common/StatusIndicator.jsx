import { motion, AnimatePresence } from 'framer-motion'

/**
 * Backend health pill. `ok`: true (online) | false (offline) | null (checking).
 * Offline turns red so it's obvious the analysis buttons won't work.
 */
export default function StatusIndicator({ ok, onRetry, compact = false, light = false }) {
  const state = ok === true ? 'online' : ok === false ? 'offline' : 'checking'
  const styles = {
    online: { dot: 'bg-comms-bright', text: 'text-comms-bright', ring: 'border-comms/40', label: 'BACKEND ONLINE' },
    offline: { dot: 'bg-danger', text: 'text-danger', ring: 'border-danger/60 bg-danger/10', label: 'BACKEND OFFLINE' },
    checking: { dot: 'bg-ink-muted', text: 'text-ink-muted', ring: 'border-ink-muted/30', label: 'CONNECTING…' },
  }[state]
  const lightRing = { online: 'border-green-600 text-green-700 bg-white', offline: 'border-red-600 text-red-700 bg-red-50', checking: 'border-slate-300 text-slate-500 bg-white' }[state]

  return (
    <button
      type="button"
      onClick={onRetry}
      title={state === 'offline' ? 'Flask API on :5000 is not responding — click to re-check' : 'Backend health (/api/health)'}
      className={light ? `flex items-center gap-2 rounded border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.14em] ${lightRing}` : `glass flex items-center gap-2 border px-3 py-2 font-mono text-[10px] tracking-[0.16em] transition ${styles.ring} ${styles.text}`}
      aria-live="polite"
    >
      <span className="relative inline-flex h-2 w-2">
        {state !== 'checking' && !light && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${styles.dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${styles.dot}`} />
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={state} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className={compact ? 'hidden lg:inline' : ''}>
          {styles.label}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
