/* eslint-disable react-refresh/only-export-components */
import { motion, AnimatePresence } from 'framer-motion'

export const fadeUp = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}
export const stagger = (delay = 0.06, start = 0.1) => ({
  hidden: {},
  show: { transition: { staggerChildren: delay, delayChildren: start } },
})
export const pageVariants = {
  initial: { opacity: 0, scale: 0.985, filter: 'blur(10px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 1.015, filter: 'blur(10px)', transition: { duration: 0.35, ease: 'easeIn' } },
}

export function GlassCard({ children, className = '', strong = false, as: Tag = motion.div, ...rest }) {
  return (
    <Tag variants={fadeUp} className={`${strong ? 'glass-strong' : 'glass'} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function SectionTitle({ eyebrow, title, right, className = '' }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div>
        {eyebrow && <div className="label-caps mb-1">{eyebrow}</div>}
        {title && <h3 className="font-display text-base font-semibold text-ink md:text-lg">{title}</h3>}
      </div>
      {right}
    </div>
  )
}

export function StatTile({ label, value, unit, hint, tone = 'accent', icon, className = '' }) {
  const tones = {
    accent: 'text-accent',
    sun: 'text-sun-bright',
    earth: 'text-earth-bright',
    comms: 'text-comms-bright',
    violet: 'text-violet',
    danger: 'text-danger',
    neutral: 'text-ink',
  }
  const bars = {
    accent: 'from-accent/60',
    sun: 'from-sun-bright/60',
    earth: 'from-earth-bright/60',
    comms: 'from-comms-bright/60',
    violet: 'from-violet/60',
    danger: 'from-danger/60',
    neutral: 'from-ink-dim/40',
  }
  return (
    <GlassCard className={`relative overflow-hidden p-4 ${className}`}>
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${bars[tone]} via-transparent to-transparent`} />
      <div className="flex items-start justify-between gap-2">
        <div className="label-caps">{label}</div>
        {icon && <div className={`${tones[tone]} opacity-80`}>{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <div className={`num text-2xl font-semibold md:text-[1.7rem] ${tones[tone]}`}>{value}</div>
        {unit && <div className="num text-xs text-ink-muted">{unit}</div>}
      </div>
      {hint && <div className="mt-1.5 text-[11px] leading-snug text-ink-muted">{hint}</div>}
    </GlassCard>
  )
}

export function Pill({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'border-ink-muted/30 text-ink-dim',
    accent: 'border-accent/40 text-accent bg-accent/10',
    sun: 'border-sun-bright/40 text-sun-bright bg-sun/10',
    earth: 'border-earth/40 text-earth-bright bg-earth/10',
    comms: 'border-comms/40 text-comms-bright bg-comms/10',
    danger: 'border-danger/40 text-danger bg-danger/10',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-3 text-left"
    >
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${checked ? 'border-accent bg-accent/30' : 'border-ink-muted/40 bg-space-800'}`}>
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={`absolute h-4 w-4 rounded-full ${checked ? 'right-1 bg-accent shadow-[0_0_12px_rgba(56,217,245,0.8)]' : 'left-1 bg-ink-muted'}`}
        />
      </span>
      <span>
        <span className="block font-display text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-[11px] text-ink-muted">{description}</span>}
      </span>
    </button>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`${className} animate-spin text-accent`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function StatusDot({ ok, label }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
      <span className="relative inline-flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full rounded-full ${ok ? 'bg-comms-bright' : ok === false ? 'bg-danger' : 'bg-ink-muted'} ${ok ? 'animate-ping opacity-60' : ''}`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${ok ? 'bg-comms-bright' : ok === false ? 'bg-danger' : 'bg-ink-muted'}`} />
      </span>
      {label}
    </span>
  )
}

export function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-8 w-8">
        <svg viewBox="0 0 32 32" className="h-8 w-8">
          <defs>
            <linearGradient id="lg" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#7ee8fa" />
              <stop offset="1" stopColor="#0ea5c9" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="16" r="13" fill="none" stroke="url(#lg)" strokeWidth="1.5" opacity="0.9" />
          <path d="M16 3 a13 13 0 0 1 0 26 a9 13 0 0 0 0 -26z" fill="url(#lg)" opacity="0.85" />
          <circle cx="16" cy="27" r="1.6" fill="#f2b134" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="font-display text-[15px] font-semibold tracking-[0.18em] text-ink">SELENIX</div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Lunar Site Navigator</div>
        </div>
      )}
    </div>
  )
}

export function Kbd({ children }) {
  return <kbd className="rounded border border-ink-muted/30 bg-space-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">{children}</kbd>
}

export function LoadingOverlay({ show, title, steps = [], note }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-void/60 backdrop-blur-md"
        >
          <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} className="glass-strong w-[min(92vw,420px)] p-6">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border border-accent/30" />
                <div className="absolute inset-0 rounded-full border-t-2 border-accent animate-spin" />
                <div className="absolute inset-[9px] rounded-full bg-accent/20" />
              </div>
              <div>
                <div className="font-display text-base font-semibold text-ink">{title}</div>
                {note && <div className="text-xs text-ink-muted">{note}</div>}
              </div>
            </div>
            {steps.length > 0 && (
              <ul className="mt-4 space-y-2">
                {steps.map((s, i) => (
                  <motion.li
                    key={s}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.6 }}
                    className="flex items-center gap-2 font-mono text-[11px] text-ink-dim"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(56,217,245,0.9)]" />
                    {s}
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="glass flex flex-wrap items-center justify-between gap-3 border-danger/40 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger">!</span>
        <div>
          <div className="font-display text-sm font-semibold text-danger">Request failed</div>
          <div className="text-xs text-ink-dim">{String(error)}</div>
        </div>
      </div>
      {onRetry && <button className="btn-ghost" onClick={onRetry}>Retry</button>}
    </motion.div>
  )
}

export function IconArrow({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
export function IconBack({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  )
}
export function IconSun({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
export function IconEarth({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  )
}
export function IconBattery({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="2" y="7" width="18" height="10" rx="2" /><path d="M22 10v4M6 11v2M10 11v2" />
    </svg>
  )
}
export function IconSignal({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 20v-8M8.5 16.5a5 5 0 0 1 0-7M15.5 9.5a5 5 0 0 1 0 7M5.6 19.4a9 9 0 0 1 0-12.8M18.4 6.6a9 9 0 0 1 0 12.8" />
    </svg>
  )
}
export function IconMoon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}
export function IconLayers({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3 2 8l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5M2 16l10 5 10-5" />
    </svg>
  )
}
export function IconGrid({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M5 7.5c4 2 10 2 14 0M5 16.5c4-2 10-2 14 0" />
    </svg>
  )
}
export function IconTarget({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  )
}
export function IconPlay({ className = 'h-4 w-4' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
}
export function IconPause({ className = 'h-4 w-4' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
}
export function IconCompare({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}
export function IconBook({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  )
}
