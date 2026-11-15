import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export function IconGradCap({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 9 12 4 2 9l10 5 10-5z" /><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /><path d="M22 9v6" />
    </svg>
  )
}

/** Educator Mode: shows the backend's physics_notes verbatim in an expandable card. */
export default function EducatorPanel({ notes }) {
  const [open, setOpen] = useState(true)
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
      <div className="glass relative overflow-hidden border-violet/30">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet/15 blur-3xl" />
        <button type="button" onClick={() => setOpen((o) => !o)} className="relative flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={open}>
          <span className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet/15 text-violet"><IconGradCap className="h-5 w-5" /></span>
            <span>
              <span className="label-caps block">Educator mode</span>
              <span className="block font-display text-sm font-semibold text-ink">The physics behind these numbers</span>
            </span>
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-ink-muted">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative overflow-hidden">
              <div className="border-t hairline px-4 pb-4 pt-3">
                {notes ? (
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-dim">{notes}</p>
                ) : (
                  <p className="text-xs text-ink-muted">The backend returned no physics notes for this run.</p>
                )}
                <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-muted">source: physics_notes · /api/timeline</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
