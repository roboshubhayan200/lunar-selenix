/**
 * Operational-state helpers shared by Explorer and Planner modes.
 * Pure functions over the series returned by /api/timeline — no resampling.
 */

/** State per timestep. Sun up = sun_el[i] > 0 ; Earth = earth_visible[i] === true. */
export const OP_STATES = [
  { key: 'both', label: 'Power + comms', short: 'Sun ↑ · Earth ✓' },
  { key: 'power', label: 'Power only', short: 'Sun ↑ · Earth ✗' },
  { key: 'comms', label: 'Comms only (battery)', short: 'Sun ↓ · Earth ✓' },
  { key: 'blackout', label: 'Full blackout', short: 'Sun ↓ · Earth ✗' },
]

export function opState(sunEl, earthVisible) {
  const sun = sunEl > 0
  const earth = earthVisible === true
  if (sun && earth) return 'both'
  if (sun) return 'power'
  if (earth) return 'comms'
  return 'blackout'
}

/** Per-sample states + contiguous runs + hours per state. */
export function classifySeries(series, stepMin) {
  const n = series.t_utc.length
  const states = new Array(n)
  const counts = { both: 0, power: 0, comms: 0, blackout: 0 }
  for (let i = 0; i < n; i++) {
    const s = opState(series.sun_el[i], series.earth_visible[i])
    states[i] = s
    counts[s]++
  }
  const runs = []
  let start = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || states[i] !== states[start]) {
      runs.push({ state: states[start], start, end: i - 1, n: i - start })
      start = i
    }
  }
  const stepH = stepMin / 60
  const hours = Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, c * stepH]))
  return { n, states, runs, counts, hours, stepH }
}

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

const SERIES_COLS = ['t_utc', 'sun_az', 'sun_el', 'sun_frac', 'earth_az', 'earth_el', 'earth_visible', 'irradiance_w_m2']

function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV with every sample, values written with String() (full precision, unchanged). */
export function seriesToCsv(result, label = '') {
  const s = result.series
  const req = result.request || {}
  const lines = [
    `# Selenix timeline export${label ? ` — ${label}` : ''}`,
    `# lat_deg=${req.lat_deg}, lon_deg=${req.lon_deg}, height_m=${req.height_m}, start_utc=${req.start_utc ?? ''}, days=${req.days}, step_min=${req.step_min}`,
    SERIES_COLS.join(','),
  ]
  for (let i = 0; i < s.t_utc.length; i++) {
    lines.push(SERIES_COLS.map((c) => csvCell(c === 't_utc' ? s.t_utc[i] : s[c][i])).join(','))
  }
  return lines.join('\n')
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for non-secure contexts
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function fileStamp(req) {
  const f = (v) => String(v).replace('-', 'm').replace('.', 'p')
  return `lat${f(req?.lat_deg)}_lon${f(req?.lon_deg)}_${req?.start_utc ?? 'start'}_${req?.days}d_${req?.step_min}min`
}
