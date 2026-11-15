/* eslint-disable react-refresh/only-export-components */
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CRITERIA } from '../../api/client.js'
import { fmtNumber } from '../../lib/format.js'

const LABEL = Object.fromEntries(CRITERIA.map((c) => [c.key, c]))

export function fmtValue(key, v) {
  return fmtNumber(v, LABEL[key]?.unit ?? '')
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="glass-strong min-w-[220px] px-3 py-2 text-xs">
      <div className="mb-1 font-display font-semibold text-ink">{d.label}</div>
      <Row k="Raw value" v={`${fmtValue(d.key, d.value)}`} sub={String(d.value)} />
      <Row k="Normalised score" v={`${Number(d.score).toFixed(2)} / 100`} sub={String(d.score)} />
      <Row k="Weight" v={`${(d.weight * 100).toFixed(1)}%`} sub={String(d.weight)} />
      <Row k="Contribution" v={`${d.contribution.toFixed(2)} pts`} />
    </div>
  )
}
function Row({ k, v, sub }) {
  return (
    <div className="flex items-start justify-between gap-4 py-0.5">
      <span className="text-ink-muted">{k}</span>
      <span className="text-right"><span className="num text-ink">{v}</span>{sub && <span className="num block text-[9px] text-ink-muted">{sub}</span>}</span>
    </div>
  )
}

/**
 * Horizontal bars, one per criterion: contribution = score × weight.
 * Bars sum to total_score. Track behind each bar = the weight's maximum possible.
 */
export default function BreakdownChart({ breakdown, color = '#38d9f5', compact = false }) {
  const rows = CRITERIA.filter((c) => breakdown[c.key]).map((c) => {
    const b = breakdown[c.key]
    return { key: c.key, label: c.label, value: b.value, score: b.score, weight: b.weight, contribution: b.contribution, max: 100 * b.weight }
  })
  const h = rows.length * (compact ? 20 : 24) + 8
  const maxX = Math.max(1, ...rows.map((r) => r.max))
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 34, bottom: 0, left: 0 }} barCategoryGap={4} barGap={compact ? -9 : -11}>
        <XAxis type="number" domain={[0, maxX]} hide />
        <YAxis type="category" dataKey="label" width={compact ? 104 : 124} tickLine={false} axisLine={false} tick={{ fill: '#a7b4d3', fontSize: compact ? 9 : 10, fontFamily: 'Inter' }} />
        <Tooltip cursor={{ fill: 'rgba(56,217,245,0.06)' }} content={<Tip />} />
        <Bar dataKey="max" barSize={compact ? 9 : 11} fill="rgba(167,180,211,0.10)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        <Bar dataKey="contribution" barSize={compact ? 9 : 11} radius={[0, 4, 4, 0]} animationDuration={900} label={{ position: 'right', fill: '#eef3ff', fontSize: 9, fontFamily: 'JetBrains Mono', formatter: (v) => Number(v).toFixed(1) }}>
          {rows.map((r) => <Cell key={r.key} fill={color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
