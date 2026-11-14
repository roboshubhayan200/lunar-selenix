/**
 * Client-side derivations from the timeline series. Everything here is pure
 * and cheap so it can run in a useMemo.
 */

export const DEPTH_OF_DISCHARGE = 0.8

export function batteryWh(loadW, longestDarkH, dod = DEPTH_OF_DISCHARGE) {
  if (!Number.isFinite(loadW) || !Number.isFinite(longestDarkH)) return null
  return (loadW * longestDarkH) / dod
}

/** Find contiguous runs where `pred(i)` is true. Returns [{start, end, n}] (end inclusive). */
export function runs(n, pred) {
  const out = []
  let start = -1
  for (let i = 0; i < n; i++) {
    const v = pred(i)
    if (v && start < 0) start = i
    if (!v && start >= 0) { out.push({ start, end: i - 1, n: i - start }); start = -1 }
  }
  if (start >= 0) out.push({ start, end: n - 1, n: n - start })
  return out
}

export function deriveStats(series, stepMin) {
  const n = series.t_utc.length
  const stepH = stepMin / 60
  if (!n) return null

  const lit = (i) => series.sun_frac[i] > 0.5
  const earth = (i) => !!series.earth_visible[i]

  let litCount = 0, earthCount = 0, bothCount = 0
  let peakIrr = 0, peakIrrIdx = 0
  let maxEarthEl = -90, maxEarthIdx = 0
  let maxSunEl = -90, maxSunIdx = 0
  for (let i = 0; i < n; i++) {
    const l = lit(i), e = earth(i)
    if (l) litCount++
    if (e) earthCount++
    if (l && e) bothCount++
    if (series.irradiance[i] > peakIrr) { peakIrr = series.irradiance[i]; peakIrrIdx = i }
    if (series.earth_el[i] > maxEarthEl) { maxEarthEl = series.earth_el[i]; maxEarthIdx = i }
    if (series.sun_el[i] > maxSunEl) { maxSunEl = series.sun_el[i]; maxSunIdx = i }
  }

  const t0 = new Date(series.t_utc[0])
  const toDay = (i) => (new Date(series.t_utc[i]) - t0) / 86_400_000

  const darkRuns = runs(n, (i) => !lit(i)).map((r) => ({ ...r, hours: r.n * stepH, startDay: toDay(r.start), endDay: toDay(r.end) + stepH / 24 }))
  const litRuns = runs(n, lit).map((r) => ({ ...r, hours: r.n * stepH, startDay: toDay(r.start), endDay: toDay(r.end) + stepH / 24 }))
  const commWindows = runs(n, earth).map((r) => ({
    ...r,
    hours: r.n * stepH,
    startDay: toDay(r.start),
    endDay: toDay(r.end) + stepH / 24,
    startUtc: series.t_utc[r.start],
    endUtc: series.t_utc[r.end],
  }))
  const commGaps = runs(n, (i) => !earth(i)).map((r) => ({ ...r, hours: r.n * stepH, startDay: toDay(r.start), endDay: toDay(r.end) + stepH / 24 }))

  const longest = (arr) => arr.reduce((m, r) => Math.max(m, r.hours), 0)

  return {
    n,
    stepH,
    totalHours: n * stepH,
    spanDays: (n * stepH) / 24,
    sunlitHours: litCount * stepH,
    darkHours: (n - litCount) * stepH,
    earthHours: earthCount * stepH,
    bothHours: bothCount * stepH,
    sunlitPct: (100 * litCount) / n,
    earthPct: (100 * earthCount) / n,
    bothPct: (100 * bothCount) / n,
    longestDarkH: longest(darkRuns),
    longestLitH: longest(litRuns),
    longestCommsGapH: longest(commGaps),
    longestCommsWindowH: longest(commWindows),
    darkRuns,
    litRuns,
    commWindows,
    commGaps,
    peakIrr,
    peakIrrIdx,
    maxEarthEl,
    maxEarthIdx,
    maxSunEl,
    maxSunIdx,
    startUtc: series.t_utc[0],
    endUtc: series.t_utc[n - 1],
  }
}

/** Rows for Recharts. Downsamples to at most `maxPoints` rows by striding. */
export function buildChartRows(series, maxPoints = 1500) {
  const n = series.t_utc.length
  if (!n) return []
  const stride = Math.max(1, Math.ceil(n / maxPoints))
  const t0 = new Date(series.t_utc[0]).getTime()
  const rows = []
  for (let i = 0; i < n; i += stride) {
    const t = new Date(series.t_utc[i]).getTime()
    rows.push({
      i,
      day: (t - t0) / 86_400_000,
      t,
      sunEl: round(series.sun_el[i], 3),
      sunElPos: Math.max(0, round(series.sun_el[i], 3)),
      earthEl: round(series.earth_el[i], 3),
      earthElPos: Math.max(0, round(series.earth_el[i], 3)),
      irr: round(series.irradiance[i], 1),
      sunFrac: round(series.sun_frac[i], 3),
      earthVis: series.earth_visible[i] ? 1 : 0,
      sunAz: round(series.sun_az[i], 2),
      earthAz: round(series.earth_az[i], 2),
    })
  }
  return rows
}

function round(v, d) {
  if (v == null || Number.isNaN(v)) return null
  const p = 10 ** d
  return Math.round(v * p) / p
}

export function fmtHours(h, { compact = false } = {}) {
  if (h == null || !Number.isFinite(h)) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 48 || compact) return `${h.toFixed(h < 10 ? 1 : 0)} h`
  const d = Math.floor(h / 24)
  const rem = h - d * 24
  return rem >= 0.5 ? `${d}d ${rem.toFixed(0)}h` : `${d}d`
}

export function fmtWh(wh) {
  if (wh == null || !Number.isFinite(wh)) return '—'
  if (wh >= 1_000_000) return `${(wh / 1_000_000).toFixed(2)} MWh`
  if (wh >= 1000) return `${(wh / 1000).toFixed(wh >= 100_000 ? 0 : 1)} kWh`
  return `${wh.toFixed(0)} Wh`
}

export function fmtUtc(iso, { withTime = true } = {}) {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toISOString().slice(0, 10)
  if (!withTime) return date
  return `${date} ${d.toISOString().slice(11, 16)}Z`
}

export function fmtDay(day) {
  if (day == null) return ''
  return `D+${day.toFixed(day < 10 ? 1 : 0)}`
}
