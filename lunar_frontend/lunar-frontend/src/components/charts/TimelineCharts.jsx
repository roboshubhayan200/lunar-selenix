import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtUtc } from '../../lib/analysis.js'

const SERIES = {
  sun: '#c98500',
  sunBright: '#f2b134',
  earth: '#3987e5',
  earthBright: '#6da7ec',
  comms: '#199e70',
  cursor: '#38d9f5',
}

function dayTicks(spanDays) {
  const step = spanDays > 60 ? 10 : spanDays > 30 ? 5 : spanDays > 10 ? 2 : 1
  const ticks = []
  for (let d = 0; d <= spanDays + 1e-6; d += step) ticks.push(d)
  return ticks
}

function ChartTooltip({ active, payload, fields }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="glass-strong min-w-[180px] px-3 py-2 text-xs">
      <div className="num mb-1.5 text-[11px] text-ink-dim">{fmtUtc(new Date(row.t).toISOString())}</div>
      {fields.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-ink-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />{f.label}
          </span>
          <span className="num text-ink">{f.format ? f.format(row[f.key], row) : row[f.key]}</span>
        </div>
      ))}
    </div>
  )
}

function useGradientOffset(rows, key) {
  return useMemo(() => {
    let max = -Infinity, min = Infinity
    for (const r of rows) { if (r[key] > max) max = r[key]; if (r[key] < min) min = r[key] }
    if (!rows.length) return 0.5
    if (max <= 0) return 0
    if (min >= 0) return 1
    return max / (max - min)
  }, [rows, key])
}

function Frame({ title, subtitle, legend, children }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-sm font-semibold text-ink">{title}</div>
          {subtitle && <div className="text-[11px] text-ink-muted">{subtitle}</div>}
        </div>
        {legend && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim">
                <span className="h-2 w-3 rounded-sm" style={{ background: l.color, opacity: l.opacity ?? 1 }} />{l.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

const axisProps = { stroke: 'rgba(167,180,211,0.18)', tickLine: false, axisLine: false }

export function SunElevationChart({ rows, spanDays, darkRuns = [], cursorDay, onHoverDay, height = 220 }) {
  const off = useGradientOffset(rows, 'sunEl')
  const ticks = useMemo(() => dayTicks(spanDays), [spanDays])
  const bands = darkRuns.slice(0, 80)
  return (
    <Frame
      title="Sun elevation"
      subtitle="Degrees above the local horizon · shaded bands are night"
      legend={[{ label: 'Sun elevation', color: SERIES.sunBright }, { label: 'Night', color: '#000', opacity: 0.5 }]}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId="timeline" onMouseMove={(s) => s?.activeLabel != null && onHoverDay?.(s.activeLabel)}>
          <defs>
            <linearGradient id="sunSplit" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={SERIES.sunBright} stopOpacity={0.55} />
              <stop offset={off} stopColor={SERIES.sunBright} stopOpacity={0.08} />
              <stop offset={off} stopColor="#1f2c4a" stopOpacity={0.25} />
              <stop offset={1} stopColor="#1f2c4a" stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          {bands.map((b, i) => <ReferenceArea key={i} x1={b.startDay} x2={b.endDay} fill="#000" fillOpacity={0.28} strokeOpacity={0} />)}
          <XAxis dataKey="day" type="number" domain={[0, spanDays]} ticks={ticks} tickFormatter={(d) => `D+${d}`} {...axisProps} />
          <YAxis tickFormatter={(v) => `${v}°`} width={48} domain={[(min) => Math.floor(Math.min(min, -2)), (max) => Math.ceil(Math.max(max, 2))]} {...axisProps} />
          <Tooltip content={<ChartTooltip fields={[
            { key: 'sunEl', label: 'Sun elevation', color: SERIES.sunBright, format: (v) => `${v?.toFixed(2)}°` },
            { key: 'sunAz', label: 'Sun azimuth', color: SERIES.sun, format: (v) => `${v?.toFixed(1)}°` },
            { key: 'sunFrac', label: 'Disk visible', color: SERIES.sunBright, format: (v) => `${Math.round(v * 100)}%` },
          ]} />} cursor={{ stroke: 'rgba(56,217,245,0.45)' }} />
          <ReferenceLine y={0} stroke="rgba(167,180,211,0.45)" label={{ value: 'horizon', position: 'insideTopRight', fill: '#6b7a9c', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
          <Area type="monotone" dataKey="sunEl" stroke={SERIES.sunBright} strokeWidth={1.8} fill="url(#sunSplit)" baseValue={0} dot={false} isAnimationActive={false} />
          {cursorDay != null && <ReferenceLine x={cursorDay} stroke={SERIES.cursor} strokeDasharray="0" strokeWidth={1.2} />}
        </AreaChart>
      </ResponsiveContainer>
    </Frame>
  )
}

export function EarthElevationChart({ rows, spanDays, commGaps = [], cursorDay, onHoverDay, height = 200 }) {
  const off = useGradientOffset(rows, 'earthEl')
  const ticks = useMemo(() => dayTicks(spanDays), [spanDays])
  return (
    <Frame
      title="Earth elevation"
      subtitle="Line-of-sight for direct-to-Earth comms · shaded bands are blackout"
      legend={[{ label: 'Earth elevation', color: SERIES.earthBright }, { label: 'No link', color: '#e66767', opacity: 0.35 }]}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId="timeline" onMouseMove={(s) => s?.activeLabel != null && onHoverDay?.(s.activeLabel)}>
          <defs>
            <linearGradient id="earthSplit" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={SERIES.earthBright} stopOpacity={0.55} />
              <stop offset={off} stopColor={SERIES.earthBright} stopOpacity={0.08} />
              <stop offset={off} stopColor="#1f2c4a" stopOpacity={0.25} />
              <stop offset={1} stopColor="#1f2c4a" stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          {commGaps.slice(0, 80).map((b, i) => <ReferenceArea key={i} x1={b.startDay} x2={b.endDay} fill="#e66767" fillOpacity={0.1} strokeOpacity={0} />)}
          <XAxis dataKey="day" type="number" domain={[0, spanDays]} ticks={ticks} tickFormatter={(d) => `D+${d}`} {...axisProps} />
          <YAxis tickFormatter={(v) => `${v}°`} width={48} domain={[(min) => Math.floor(Math.min(min, -2)), (max) => Math.ceil(Math.max(max, 2))]} {...axisProps} />
          <Tooltip content={<ChartTooltip fields={[
            { key: 'earthEl', label: 'Earth elevation', color: SERIES.earthBright, format: (v) => `${v?.toFixed(2)}°` },
            { key: 'earthAz', label: 'Earth azimuth', color: SERIES.earth, format: (v) => `${v?.toFixed(1)}°` },
            { key: 'earthVis', label: 'Direct link', color: SERIES.comms, format: (v) => (v ? 'available' : 'blocked') },
          ]} />} cursor={{ stroke: 'rgba(56,217,245,0.45)' }} />
          <ReferenceLine y={0} stroke="rgba(167,180,211,0.45)" />
          <Area type="monotone" dataKey="earthEl" stroke={SERIES.earthBright} strokeWidth={1.8} fill="url(#earthSplit)" baseValue={0} dot={false} isAnimationActive={false} />
          {cursorDay != null && <ReferenceLine x={cursorDay} stroke={SERIES.cursor} strokeWidth={1.2} />}
        </AreaChart>
      </ResponsiveContainer>
    </Frame>
  )
}

export function IrradianceChart({ rows, spanDays, cursorDay, onHoverDay, height = 200 }) {
  const ticks = useMemo(() => dayTicks(spanDays), [spanDays])
  return (
    <Frame
      title="Solar irradiance"
      subtitle="W/m² on a Sun-tracking surface, scaled by the visible fraction of the solar disk"
      legend={[{ label: 'Irradiance', color: SERIES.sun }]}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId="timeline" onMouseMove={(s) => s?.activeLabel != null && onHoverDay?.(s.activeLabel)}>
          <defs>
            <linearGradient id="irrFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={SERIES.sunBright} stopOpacity={0.6} />
              <stop offset={1} stopColor={SERIES.sun} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" type="number" domain={[0, spanDays]} ticks={ticks} tickFormatter={(d) => `D+${d}`} {...axisProps} />
          <YAxis domain={[0, 1400]} ticks={[0, 350, 700, 1050, 1400]} width={48} {...axisProps} />
          <Tooltip content={<ChartTooltip fields={[
            { key: 'irr', label: 'Irradiance', color: SERIES.sunBright, format: (v) => `${v?.toFixed(0)} W/m²` },
            { key: 'sunFrac', label: 'Disk visible', color: SERIES.sun, format: (v) => `${Math.round(v * 100)}%` },
          ]} />} cursor={{ stroke: 'rgba(56,217,245,0.45)' }} />
          <ReferenceLine y={1361} stroke="rgba(242,177,52,0.35)" label={{ value: 'solar constant 1361', position: 'insideTopRight', fill: '#6b7a9c', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
          <Area type="step" dataKey="irr" stroke={SERIES.sunBright} strokeWidth={1.6} fill="url(#irrFill)" dot={false} isAnimationActive={false} />
          {cursorDay != null && <ReferenceLine x={cursorDay} stroke={SERIES.cursor} strokeWidth={1.2} />}
        </AreaChart>
      </ResponsiveContainer>
    </Frame>
  )
}
