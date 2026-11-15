import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/*
 * Every plotted value is series[key][i] exactly as the API returned it:
 * no resampling, smoothing, interpolation between samples, or rounding.
 * (Lines are drawn `type="linear"` — straight segments between real samples.)
 * t_utc ISO strings are parsed to Date in api/client.js; the x-axis uses
 * their epoch milliseconds so all three charts share one time scale.
 */

const C = {
  sun: '#f2b134',
  earth: '#6da7ec',
  visible: '#22b58a',
  irr: '#d95926',
  grid: 'rgba(167,180,211,0.10)',
  axis: '#6b7a9c',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** UTC tick label, e.g. "Jun 01 00:00". */
function fmtTick(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${MONTHS[d.getUTCMonth()]} ${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** Vertical scrubber cursor drawn over the plot area (YAxis width 44, right margin 8). */
function Cursor({ frac }) {
  if (frac == null || !Number.isFinite(frac)) return null
  return <div className="pointer-events-none absolute bottom-[30px] top-[6px] w-[2px] bg-accent shadow-[0_0_8px_rgba(56,217,245,0.9)]" style={{ left: `calc(44px + (100% - 52px) * ${Math.min(1, Math.max(0, frac))})` }} />
}

/** Exact value as returned — no toFixed. */
function exact(v) {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

function ExactTooltip({ active, payload, rows, fields }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const i = row.i
  return (
    <div className="glass-strong min-w-[230px] px-3 py-2 text-xs">
      <div className="num mb-1.5 text-[11px] text-accent">{rows.t_utc[i]}</div>
      {fields.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-ink-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />{f.label}
          </span>
          <span className="num text-ink">{exact(rows[f.key][i])}{f.unit && rows[f.key][i] != null && typeof rows[f.key][i] !== 'boolean' ? ` ${f.unit}` : ''}</span>
        </div>
      ))}
      <div className="mt-1 text-[10px] text-ink-muted">sample #{i}</div>
    </div>
  )
}

/** Contiguous index runs where pred(i) is true. */
function runs(n, pred) {
  const out = []
  let s = -1
  for (let i = 0; i < n; i++) {
    if (pred(i)) { if (s < 0) s = i } else if (s >= 0) { out.push([s, i - 1]); s = -1 }
  }
  if (s >= 0) out.push([s, n - 1])
  return out
}

function Frame({ title, subtitle, children, right }) {
  return (
    <div className="glass p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-display text-sm font-semibold text-ink">{title}</div>
          {subtitle && <div className="text-[11px] text-ink-muted">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } }

/**
 * Three stacked, synced charts: sun_el, earth_el (+earth_visible shading), irradiance_w_m2.
 * `series` comes from normalizeTimeline().
 */
export default function TimelineChart({ series, height = 170, cursorIdx = null }) {
  const n = series.t_utc.length
  const data = useMemo(() => {
    const out = new Array(n)
    for (let i = 0; i < n; i++) {
      out[i] = {
        i,
        t: series.t[i].getTime(),
        sun_el: series.sun_el[i],
        earth_el: series.earth_el[i],
        irradiance_w_m2: series.irradiance_w_m2[i],
      }
    }
    return out
  }, [series, n])

  const t0 = n ? series.t[0].getTime() : 0
  const t1 = n ? series.t[n - 1].getTime() : 1
  const span = t1 - t0
  const visibleRuns = useMemo(() => runs(n, (i) => !!series.earth_visible[i]), [series, n])
  const animate = n <= 2500

  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={[t0, t1]}
      tickFormatter={fmtTick}
      tick={{ fill: C.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
      tickLine={false}
      axisLine={{ stroke: C.grid }}
      minTickGap={64}
    />
  )
  const yAxis = (unit, domain) => (
    <YAxis
      width={44}
      domain={domain}
      tick={{ fill: C.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
      tickLine={false}
      axisLine={false}
      tickFormatter={(v) => `${v}${unit}`}
    />
  )
  const cursor = { stroke: '#38d9f5', strokeWidth: 1, strokeDasharray: '3 3' }
  const margin = { top: 6, right: 8, bottom: 0, left: 0 }

  const cursorFrac = cursorIdx != null && n && span > 0 ? (series.t[Math.min(cursorIdx, n - 1)].getTime() - t0) / span : null

  const visiblePct = n ? (100 * series.earth_visible.filter(Boolean).length) / n : 0

  return (
    <motion.div variants={{ hidden: {}, show: { transition: { staggerChildren: 0.2 } } }} initial="hidden" animate="show" className="grid gap-3">
      <motion.div variants={item}>
        <Frame title="Sun elevation" subtitle={`sun_el · ${n} samples · dashed line = local horizon (0°)`}>
          <div className="relative">
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} syncId="selenix-timeline" margin={margin}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              {xAxis}
              {yAxis('°', ['auto', 'auto'])}
              <ReferenceLine y={0} stroke="#eef3ff" strokeOpacity={0.55} strokeDasharray="5 4" label={{ value: 'horizon 0°', position: 'insideTopRight', fill: '#a7b4d3', fontSize: 10 }} />
              <Tooltip cursor={cursor} content={<ExactTooltip rows={series} fields={[{ key: 'sun_el', label: 'Sun elevation', unit: '°', color: C.sun }, { key: 'sun_frac', label: 'Sun disk visible', color: C.sun }]} />} />
              <Line type="linear" dataKey="sun_el" stroke={C.sun} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#04060d' }} isAnimationActive={animate} animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
          <Cursor frac={cursorFrac} />
          </div>
        </Frame>
      </motion.div>

      <motion.div variants={item}>
        <Frame
          title="Earth elevation"
          subtitle="earth_el · green bands = earth_visible true (direct-to-Earth link possible)"
          right={<span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim"><span className="h-2.5 w-3.5 rounded-sm" style={{ background: `${C.visible}55`, border: `1px solid ${C.visible}` }} />visible {visiblePct.toFixed(1)}% of samples</span>}
        >
          <div className="relative">
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} syncId="selenix-timeline" margin={margin}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              {visibleRuns.map(([a, b]) => (
                <ReferenceArea key={a} x1={data[a].t} x2={data[b].t} fill={C.visible} fillOpacity={0.18} stroke="none" ifOverflow="hidden" />
              ))}
              {xAxis}
              {yAxis('°', ['auto', 'auto'])}
              <ReferenceLine y={0} stroke="#eef3ff" strokeOpacity={0.35} strokeDasharray="5 4" />
              <Tooltip cursor={cursor} content={<ExactTooltip rows={series} fields={[{ key: 'earth_el', label: 'Earth elevation', unit: '°', color: C.earth }, { key: 'earth_az', label: 'Earth azimuth', unit: '°', color: C.earth }, { key: 'earth_visible', label: 'Earth visible', color: C.visible }]} />} />
              <Line type="linear" dataKey="earth_el" stroke={C.earth} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#04060d' }} isAnimationActive={animate} animationDuration={900} />
            </LineChart>
          </ResponsiveContainer>
          <Cursor frac={cursorFrac} />
          </div>
        </Frame>
      </motion.div>

      <motion.div variants={item}>
        <Frame title="Solar irradiance" subtitle="irradiance_w_m2 · W/m²">
          <div className="relative">
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} syncId="selenix-timeline" margin={margin}>
              <defs>
                <linearGradient id="irrFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={C.irr} stopOpacity={0.55} />
                  <stop offset="1" stopColor={C.irr} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.grid} vertical={false} />
              {xAxis}
              {yAxis('', [0, 'auto'])}
              <Tooltip cursor={cursor} content={<ExactTooltip rows={series} fields={[{ key: 'irradiance_w_m2', label: 'Irradiance', unit: 'W/m²', color: C.irr }]} />} />
              <Area type="linear" dataKey="irradiance_w_m2" stroke={C.irr} strokeWidth={2} fill="url(#irrFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#04060d' }} isAnimationActive={animate} animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
          <Cursor frac={cursorFrac} />
          </div>
        </Frame>
      </motion.div>
    </motion.div>
  )
}
