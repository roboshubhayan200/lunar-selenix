import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p2 = (n) => String(n).padStart(2, '0')
const fmtUtcTick = (ms) => { const d = new Date(ms); return `${MONTHS[d.getUTCMonth()]} ${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` }
const fmtElapsedTick = (h) => `${Number(h).toFixed(h % 1 ? 1 : 0)} h`

const COLORS = {
  sun: { A: '#b45309', B: '#d97706' },
  earth: { A: '#1d4ed8', B: '#3b82f6' },
  irr: { A: '#ea580c', B: '#9a3412' },
}

/** x for sample i of a result: epoch ms (utc) or hours since that config's first sample (elapsed). */
function xs(result, mode) {
  const t = result.series.t
  const t0 = t[0].getTime()
  return t.map((d) => (mode === 'utc' ? d.getTime() : (d.getTime() - t0) / 3_600_000))
}

function nearestIdx(arr, x) {
  let lo = 0, hi = arr.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m; else hi = m }
  return Math.abs(arr[lo] - x) <= Math.abs(arr[hi] - x) ? lo : hi
}

function PTooltip({ active, label, mode, sets, field, unit }) {
  if (!active || label == null) return null
  return (
    <div className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-800 shadow-md">
      <div className="mb-1 text-slate-500">{mode === 'utc' ? fmtUtcTick(label) + ' UTC' : `t + ${Number(label).toFixed(2)} h`}</div>
      {sets.map(({ id, res, x }) => {
        const i = nearestIdx(x, label)
        const exactHit = x[i] === label
        return (
          <div key={id} className="flex items-baseline justify-between gap-4">
            <span className="font-sans font-semibold">{id}</span>
            <span>{String(res.series[field][i])} {unit}</span>
            <span className="text-[10px] text-slate-400">{exactHit ? res.series.t_utc[i] : `nearest: ${res.series.t_utc[i]}`}</span>
          </div>
        )
      })}
    </div>
  )
}

function Legend({ color }) {
  return (
    <span className="flex items-center gap-3 text-[11px] text-slate-600">
      <span className="flex items-center gap-1"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={color.A} strokeWidth="2" /></svg>A</span>
      <span className="flex items-center gap-1"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={color.B} strokeWidth="2" strokeDasharray="4 3" /></svg>B</span>
    </span>
  )
}

export default function PlannerCharts({ resA, resB }) {
  const sameStart = resA && resB && resA.series.t[0]?.getTime() === resB.series.t[0]?.getTime()
  const [modePref, setModePref] = useState(null)
  const mode = modePref ?? (resA && resB && !sameStart ? 'elapsed' : 'utc')

  const sets = useMemo(() => [['A', resA], ['B', resB]].filter(([, r]) => r).map(([id, res]) => ({ id, res, x: xs(res, mode) })), [resA, resB, mode])

  const rows = useMemo(() => {
    const map = new Map()
    for (const { id, res, x } of sets) {
      const s = res.series
      for (let i = 0; i < x.length; i++) {
        let row = map.get(x[i])
        if (!row) { row = { x: x[i] }; map.set(x[i], row) }
        row[`${id}_sun`] = s.sun_el[i]
        row[`${id}_earth`] = s.earth_el[i]
        row[`${id}_irr`] = s.irradiance_w_m2[i]
      }
    }
    return [...map.values()].sort((a, b) => a.x - b.x)
  }, [sets])

  if (!sets.length) return null
  const has = (id) => sets.some((s) => s.id === id)
  const xAxis = (
    <XAxis dataKey="x" type="number" scale={mode === 'utc' ? 'time' : 'linear'} domain={['dataMin', 'dataMax']} tickFormatter={mode === 'utc' ? fmtUtcTick : fmtElapsedTick} tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={{ stroke: '#94a3b8' }} axisLine={{ stroke: '#94a3b8' }} minTickGap={48} />
  )
  const yAxis = (u, domain = ['auto', 'auto']) => (
    <YAxis width={50} domain={domain} tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={{ stroke: '#94a3b8' }} tickFormatter={(v) => `${v}${u}`} />
  )
  const common = { data: rows, syncId: 'planner', syncMethod: 'value', margin: { top: 6, right: 12, bottom: 0, left: 0 } }
  const cursor = { stroke: '#0f172a', strokeWidth: 1 }
  const horizon = <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1.5} label={{ value: 'horizon 0°', position: 'insideTopLeft', fill: '#0f172a', fontSize: 10 }} />
  const box = 'rounded border border-slate-300 bg-white p-2'
  const title = 'text-xs font-bold text-slate-900'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
        <span>{rows.length.toLocaleString()} x-positions · every API sample plotted, nothing interpolated or resampled</span>
        <span className="flex items-center gap-1">
          X-axis:
          <button type="button" onClick={() => setModePref('utc')} className={`rounded border px-2 py-0.5 ${mode === 'utc' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`}>UTC</button>
          <button type="button" onClick={() => setModePref('elapsed')} className={`rounded border px-2 py-0.5 ${mode === 'elapsed' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`}>Elapsed (aligned at start)</button>
        </span>
      </div>
      {resA && resB && !sameStart && mode === 'utc' && <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">A and B start on different dates, so on a UTC axis they don't overlap. Switch to Elapsed to overlay them.</div>}

      <div className={box}>
        <div className="mb-1 flex items-center justify-between"><span className={title}>Sun elevation (sun_el, °)</span><Legend color={COLORS.sun} /></div>
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart {...common}>
            <CartesianGrid stroke="#e2e8f0" />
            {xAxis}{yAxis('°')}{horizon}
            <Tooltip cursor={cursor} isAnimationActive={false} content={<PTooltip mode={mode} sets={sets} field="sun_el" unit="°" />} />
            {has('A') && <Line dataKey="A_sun" type="linear" stroke={COLORS.sun.A} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />}
            {has('B') && <Line dataKey="B_sun" type="linear" stroke={COLORS.sun.B} strokeWidth={1.75} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className={box}>
        <div className="mb-1 flex items-center justify-between"><span className={title}>Earth elevation (earth_el, °)</span><Legend color={COLORS.earth} /></div>
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart {...common}>
            <CartesianGrid stroke="#e2e8f0" />
            {xAxis}{yAxis('°')}{horizon}
            <Tooltip cursor={cursor} isAnimationActive={false} content={<PTooltip mode={mode} sets={sets} field="earth_el" unit="°" />} />
            {has('A') && <Line dataKey="A_earth" type="linear" stroke={COLORS.earth.A} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />}
            {has('B') && <Line dataKey="B_earth" type="linear" stroke={COLORS.earth.B} strokeWidth={1.75} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className={box}>
        <div className="mb-1 flex items-center justify-between"><span className={title}>Solar irradiance (irradiance_w_m2, W/m²)</span><Legend color={COLORS.irr} /></div>
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart {...common}>
            <CartesianGrid stroke="#e2e8f0" />
            {xAxis}{yAxis('', [0, 'auto'])}
            <Tooltip cursor={cursor} isAnimationActive={false} content={<PTooltip mode={mode} sets={sets} field="irradiance_w_m2" unit="W/m²" />} />
            {has('A') && <Area dataKey="A_irr" type="linear" stroke={COLORS.irr.A} strokeWidth={1.5} fill={COLORS.irr.A} fillOpacity={0.22} dot={false} connectNulls isAnimationActive={false} />}
            {has('B') && <Area dataKey="B_irr" type="linear" stroke={COLORS.irr.B} strokeWidth={1.75} strokeDasharray="5 4" fill="none" dot={false} connectNulls isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
