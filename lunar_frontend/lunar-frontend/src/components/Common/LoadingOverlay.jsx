/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/** Seconds since `active` became true (0 while inactive). */
export function useElapsed(active) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) return
    const t0 = performance.now()
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 250)
    return () => { clearInterval(id); setElapsed(0) }
  }, [active])
  return elapsed
}

function Orbiter() {
  return (
    <div className="relative h-14 w-14 shrink-0">
      <div className="absolute inset-0 rounded-full border border-accent/25" />
      <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-accent [animation-duration:1.4s]" />
      <div className="absolute inset-[7px] animate-spin rounded-full border-b border-sun-bright/70 [animation-direction:reverse] [animation-duration:2.2s]" />
      <div className="absolute inset-[18px] rounded-full bg-gradient-to-br from-ink-dim to-space-600 shadow-[inset_-4px_-3px_8px_rgba(0,0,0,0.7)]" />
    </div>
  )
}

/**
 * Loading card.
 *  - variant 'overlay' covers its positioned parent; 'inline' renders in flow.
 *  - progress: {current, total, estimated?} renders "Analyzing site 2 of 4…" + bar.
 */
export default function LoadingOverlay({ show, title, message, progress, steps = [], variant = 'overlay', elapsed }) {
  const ownElapsed = useElapsed(show && elapsed == null)
  const secs = elapsed ?? ownElapsed
  const card = (
    <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} className="glass-strong w-full max-w-[440px] p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-4">
        <Orbiter />
        <div className="min-w-0">
          <div className="font-display text-base font-semibold text-ink">{title}</div>
          {message && <div className="shimmer-text mt-0.5 font-mono text-[11px] tracking-wide">{message}</div>}
          <div className="num mt-1 text-[10px] text-ink-muted">{secs.toFixed(0)} s elapsed</div>
        </div>
      </div>
      {progress && progress.total > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between font-mono text-[11px] text-ink-dim">
            <span>Analyzing site {progress.current} of {progress.total}…</span>
            {progress.estimated && <span className="text-[10px] text-ink-muted">estimated</span>}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-void/70">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-accent-deep to-accent" animate={{ width: `${Math.min(100, (progress.fraction ?? (progress.current - 1) / progress.total) * 100)}%` }} transition={{ ease: 'easeOut', duration: 0.4 }} />
          </div>
        </div>
      )}
      {steps.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {steps.map((s, i) => (
            <motion.li key={s} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.9 }} className="flex items-center gap-2 font-mono text-[11px] text-ink-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(56,217,245,0.9)]" />
              {s}
            </motion.li>
          ))}
        </ul>
      )}
    </motion.div>
  )

  return (
    <AnimatePresence>
      {show && (variant === 'inline' ? (
        <motion.div key="inline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center py-8">{card}</motion.div>
      ) : (
        <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex items-center justify-center bg-void/60 p-4 backdrop-blur-md">{card}</motion.div>
      ))}
    </AnimatePresence>
  )
}
