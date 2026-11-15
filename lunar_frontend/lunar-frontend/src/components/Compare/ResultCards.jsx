/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import BreakdownChart, { fmtValue } from './BreakdownChart.jsx'
import { CRITERIA } from '../../api/client.js'
import { fmtDeg } from '../../lib/lunar.js'
import { IconArrow } from '../ui/index.jsx'

const MEDALS = [
  { name: 'Gold', ring: '#f2c94c', glow: 'rgba(242,201,76,0.28)', text: '#f6d878' },
  { name: 'Silver', ring: '#c9d3e6', glow: 'rgba(201,211,230,0.20)', text: '#dfe6f3' },
  { name: 'Bronze', ring: '#cd8a4f', glow: 'rgba(205,138,79,0.22)', text: '#e3a978' },
]

/** Rank → colour on a green → yellow → red ramp (rank 1 = green). Used for cards and map pins. */
export function rankColor(rank, total) {
  if (total <= 1) return '#22b58a'
  const t = (rank - 1) / (total - 1)
  const stops = [[0x22, 0xb5, 0x8a], [0xf2, 0xb1, 0x34], [0xe6, 0x67, 0x67]]
  const seg = t <= 0.5 ? 0 : 1
  const lt = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5
  const [a, b] = [stops[seg], stops[seg + 1]]
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * lt))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function Card({ r, total, i, onAnalyze }) {
  const medal = MEDALS[r.rank - 1]
  const color = rankColor(r.rank, total)
  const big = r.rank === 1
  const [open, setOpen] = useState(big)
  return (
    <motion.article
      initial={{ rotateY: -90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ delay: 0.15 + i * 0.25, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformPerspective: 1200, borderColor: medal ? `${medal.ring}88` : undefined, boxShadow: medal ? `0 0 0 1px ${medal.ring}33, 0 18px 50px -20px ${medal.glow}` : undefined }}
      className={`glass-strong relative flex flex-col overflow-hidden p-4 ${big ? 'md:col-span-2 md:row-span-2 md:p-6' : ''}`}
    >
      {medal && <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full blur-3xl" style={{ background: medal.glow }} />}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-void ${big ? 'h-12 w-12 text-xl' : 'h-9 w-9 text-sm'}`} style={{ background: medal ? `linear-gradient(135deg, ${medal.text}, ${medal.ring})` : color }}>
            {r.rank}
          </span>
          <div className="min-w-0">
            {medal && <div className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: medal.text }}>{medal.name}</div>}
            <h3 className={`truncate font-display font-semibold text-ink ${big ? 'text-2xl' : 'text-base'}`} title={r.name}>{r.name}</h3>
            <div className="num text-[10px] text-ink-muted">lat {fmtDeg(r.lat_deg)} · lon {fmtDeg(r.lon_deg)}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`num font-semibold leading-none text-ink ${big ? 'text-5xl' : 'text-3xl'}`} title={`total_score = ${r.total_score}`}>{Number(r.total_score).toFixed(1)}</div>
          <div className="num mt-1 text-[10px] text-ink-muted">/ 100 total_score</div>
        </div>
      </div>
      <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-void/70">
        <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, r.total_score))}%` }} transition={{ delay: 0.4 + i * 0.25, duration: 0.9 }} />
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative mt-3 flex items-center justify-between rounded-lg bg-void/40 px-3 py-1.5 text-left text-[11px] text-ink-dim transition hover:bg-white/5" aria-expanded={open}>
        <span className="label-caps !text-[0.56rem]">Score breakdown · {Object.keys(r.breakdown).length} criteria</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="bd" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative overflow-hidden">
            <table className="mt-2 w-full select-text text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-[0.12em] text-ink-muted">
                  <th className="py-1 text-left font-medium">Criterion</th>
                  <th className="py-1 text-right font-medium">Raw value</th>
                  <th className="py-1 text-right font-medium">Score</th>
                  <th className="py-1 text-right font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {CRITERIA.filter((c) => r.breakdown[c.key]).map((c) => {
                  const b = r.breakdown[c.key]
                  return (
                    <tr key={c.key} className="border-t hairline">
                      <td className="py-1 pr-2 text-ink-dim">{c.label}</td>
                      <td className="num py-1 text-right text-ink" title={String(b.value)}>{fmtValue(c.key, b.value)}</td>
                      <td className="num py-1 text-right text-ink" title={String(b.score)}>{Number(b.score).toFixed(1)}</td>
                      <td className="num py-1 text-right text-ink-dim" title={String(b.weight)}>{(b.weight * 100).toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="label-caps mb-1 mt-3 !text-[0.56rem]">Weighted contribution (score × weight)</div>
            <BreakdownChart breakdown={r.breakdown} color={color} compact={!big} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex-1" />
      {onAnalyze && (
        <button type="button" className="btn-ghost relative mt-3 !py-1.5 !text-xs" onClick={() => onAnalyze(r)}>
          Open timeline <IconArrow className="h-3.5 w-3.5" />
        </button>
      )}
    </motion.article>
  )
}

export default function ResultCards({ ranked, onAnalyze }) {
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank)
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
      {sorted.map((r, i) => <Card key={r.name} r={r} total={sorted.length} i={i} onAnalyze={onAnalyze} />)}
    </div>
  )
}
