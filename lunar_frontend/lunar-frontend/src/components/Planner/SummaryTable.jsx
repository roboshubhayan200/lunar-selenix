/* eslint-disable react-refresh/only-export-components */
import { fmtNumber } from '../../lib/format.js'

/** Row order, display names and which direction is "better" (for A-vs-B colouring). */
export const METRICS = [
  { key: 'sunlit_pct', label: 'Sunlit time', higher: true },
  { key: 'max_continuous_dark_hr', label: 'Max continuous dark', higher: false },
  { key: 'earth_visible_pct', label: 'Earth visibility', higher: true },
  { key: 'longest_comms_gap_hr', label: 'Longest comms gap', higher: false },
  { key: 'energy_vertical', label: 'Energy (vertical)', higher: true },
  { key: 'energy_horizontal', label: 'Energy (horizontal)', higher: true },
  { key: 'max_sun_elevation_deg', label: 'Max Sun elevation', higher: true },
  { key: 'battery_required_wh', label: 'Battery required', higher: false },
]

function entry(result, key) {
  return result?.summary.find((s) => s.key === key) || null
}

/** Builds table rows; Difference = A − B only when both values exist with the same unit. */
export function summaryRows(resA, resB) {
  return METRICS.map((m) => {
    const a = entry(resA, m.key)
    const b = entry(resB, m.key)
    const unit = a?.unit ?? b?.unit ?? ''
    const av = a?.value
    const bv = b?.value
    const comparable = av != null && bv != null && a.unit === b.unit
    const diff = comparable ? av - bv : null
    let verdict = null
    if (comparable) verdict = diff === 0 ? 'same' : (diff > 0) === m.higher ? 'better' : 'worse'
    return { ...m, unit, a: av ?? null, b: bv ?? null, aKey: a?.sourceKey, bKey: b?.sourceKey, diff, verdict }
  })
}

/** Tab-separated table for Excel. Exact API values (unformatted) so nothing is lost on paste. */
export function summaryTsv(rows, reqA, reqB) {
  const req = (r, k) => (r ? r[k] : '')
  const lines = [
    ['Metric', 'Config A', 'Config B', 'Difference (A-B)', 'Unit'].join('\t'),
    ['lat_deg', req(reqA, 'lat_deg'), req(reqB, 'lat_deg'), '', 'deg'].join('\t'),
    ['lon_deg', req(reqA, 'lon_deg'), req(reqB, 'lon_deg'), '', 'deg'].join('\t'),
    ['height_m', req(reqA, 'height_m'), req(reqB, 'height_m'), '', 'm'].join('\t'),
    ['start_utc', req(reqA, 'start_utc'), req(reqB, 'start_utc'), '', ''].join('\t'),
    ['days', req(reqA, 'days'), req(reqB, 'days'), '', 'd'].join('\t'),
    ['step_min', req(reqA, 'step_min'), req(reqB, 'step_min'), '', 'min'].join('\t'),
    ...rows.map((r) => [r.label, r.a ?? '', r.b ?? '', r.diff ?? '', r.unit].join('\t')),
  ]
  return lines.join('\n')
}

const VERDICT = {
  better: 'text-green-700 bg-green-50',
  worse: 'text-red-700 bg-red-50',
  same: 'text-slate-500',
}

export default function SummaryTable({ rows, reqA, reqB, exact }) {
  const val = (v, unit) => (v == null ? '—' : exact ? String(v) : fmtNumber(v, unit))
  const diffTxt = (r) => (r.diff == null ? '—' : exact ? `${r.diff > 0 ? '+' : ''}${r.diff}` : fmtNumber(r.diff, r.unit, { signed: true }))
  const reqCell = (r, k, d) => (r ? (d != null ? Number(r[k]).toFixed(d) : String(r[k])) : '—')
  const th = 'border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600'
  const td = 'border-b border-slate-200 px-3 py-1.5 font-mono text-[13px] tabular-nums'

  return (
    <table className="w-full select-text border-collapse border border-slate-300 bg-white">
      <thead>
        <tr>
          <th className={th}>Metric</th>
          <th className={`${th} text-right`}>Config A</th>
          <th className={`${th} text-right`}>Config B</th>
          <th className={`${th} text-right`}>Difference (A − B)</th>
          <th className={th}>Unit · source key</th>
        </tr>
      </thead>
      <tbody>
        {[['lat_deg', 2], ['lon_deg', 2], ['height_m', null], ['start_utc', null], ['days', null], ['step_min', null]].map(([k, d]) => (
          <tr key={k} className="bg-slate-50/60">
            <td className={`${td} font-sans text-slate-500`}>{k}</td>
            <td className={`${td} text-right text-slate-700`}>{reqCell(reqA, k, d)}</td>
            <td className={`${td} text-right text-slate-700`}>{reqCell(reqB, k, d)}</td>
            <td className={`${td} text-right text-slate-300`}>·</td>
            <td className={`${td} font-sans text-[11px] text-slate-400`}>request</td>
          </tr>
        ))}
        {rows.map((r) => (
          <tr key={r.key}>
            <td className={`${td} font-sans font-medium text-slate-900`}>{r.label} <span className="text-slate-400">{r.higher ? '↑' : '↓'}</span></td>
            <td className={`${td} text-right text-slate-900`} title={r.a == null ? '' : String(r.a)}>{val(r.a, r.unit)}</td>
            <td className={`${td} text-right text-slate-900`} title={r.b == null ? '' : String(r.b)}>{val(r.b, r.unit)}</td>
            <td className={`${td} text-right font-semibold ${r.verdict ? VERDICT[r.verdict] : 'text-slate-400'}`} title={r.diff == null ? '' : String(r.diff)}>{diffTxt(r)}</td>
            <td className={`${td} font-sans text-[11px] text-slate-500`}>{r.unit} · {r.aKey || r.bKey || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
