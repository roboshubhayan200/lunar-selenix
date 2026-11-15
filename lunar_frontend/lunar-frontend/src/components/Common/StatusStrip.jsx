import { useMemo, useRef, useState } from 'react'
import { OP_STATES, classifySeries } from '../../lib/ops.js'

const THEMES = {
  dark: {
    colors: { both: '#f2b134', power: '#f7e26b', comms: '#3987e5', blackout: '#262e40' },
    glow: true,
    track: 'rgba(4,6,13,0.6)',
    text: 'text-ink-dim',
    muted: 'text-ink-muted',
    tip: 'glass-strong text-ink',
    cursor: '#38d9f5',
  },
  light: {
    colors: { both: '#b8860b', power: '#f2d03b', comms: '#2563eb', blackout: '#374151' },
    glow: false,
    track: '#e5e7eb',
    text: 'text-slate-700',
    muted: 'text-slate-500',
    tip: 'bg-white text-slate-900 border border-slate-300 shadow-md rounded',
    cursor: '#dc2626',
  },
}

/**
 * Operational heatmap: one cell per timestep of the API series.
 *   gold = sun up & Earth visible · yellow = sun up only · blue = Earth only · gray = blackout
 * Props: series, stepMin, theme ('dark'|'light'), cursor (index), onSelect(index), height, label
 */
export default function StatusStrip({ series, stepMin, theme = 'dark', cursor = null, onSelect, height = 26, label, showLegend = true }) {
  const t = THEMES[theme]
  const ops = useMemo(() => classifySeries(series, stepMin), [series, stepMin])
  const [hover, setHover] = useState(null)
  const ref = useRef()
  const n = ops.n

  const idxFromEvent = (e) => {
    const r = ref.current.getBoundingClientRect()
    const x = Math.min(Math.max(0, e.clientX - r.left), r.width - 0.001)
    return Math.floor((x / r.width) * n)
  }

  if (!n) return null
  const totalH = n * ops.stepH

  return (
    <div className="select-text">
      {label && <div className={`mb-1 text-xs font-semibold ${t.text}`}>{label}</div>}
      <div
        ref={ref}
        className={`relative w-full cursor-crosshair overflow-visible ${theme === 'light' ? 'rounded-sm' : 'rounded-md'}`}
        style={{ height, background: t.track }}
        onMouseMove={(e) => setHover(idxFromEvent(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect?.(idxFromEvent(e))}
        role="img"
        aria-label={`Operational status over ${n} timesteps`}
      >
        <svg viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={t.glow ? { filter: 'drop-shadow(0 0 4px rgba(242,177,52,0.35))' } : undefined}>
          {ops.runs.map((r) => (
            <rect key={r.start} x={r.start} y={0} width={r.n} height={1} fill={t.colors[r.state]} />
          ))}
        </svg>
        {cursor != null && cursor >= 0 && cursor < n && (
          <div className="pointer-events-none absolute inset-y-[-3px] w-[2px]" style={{ left: `${((cursor + 0.5) / n) * 100}%`, background: t.cursor, boxShadow: theme === 'dark' ? `0 0 6px ${t.cursor}` : undefined }} />
        )}
        {hover != null && (
          <div className={`pointer-events-none absolute bottom-full z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap px-2 py-1 font-mono text-[10px] ${t.tip}`} style={{ left: `${((hover + 0.5) / n) * 100}%` }}>
            <div>{series.t_utc[hover]}</div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: t.colors[ops.states[hover]] }} />
              {OP_STATES.find((s) => s.key === ops.states[hover]).label} · sun_el {String(series.sun_el[hover])} · earth_visible {String(series.earth_visible[hover])}
            </div>
          </div>
        )}
      </div>
      {showLegend && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
          {OP_STATES.map((s) => (
            <div key={s.key} className={`flex items-center gap-1.5 text-[11px] ${t.text}`}>
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: t.colors[s.key], boxShadow: t.glow ? `0 0 6px ${t.colors[s.key]}` : undefined }} />
              <span className="truncate">{s.label}</span>
              <span className={`ml-auto font-mono tabular-nums ${t.muted}`} title={`${ops.counts[s.key]} samples × ${stepMin} min`}>{ops.hours[s.key].toFixed(1)} h</span>
            </div>
          ))}
        </div>
      )}
      {showLegend && <div className={`mt-1 font-mono text-[10px] ${t.muted}`}>{n} timesteps × {stepMin} min = {totalH.toFixed(1)} h · sun up = sun_el &gt; 0° · Earth = earth_visible</div>}
    </div>
  )
}
