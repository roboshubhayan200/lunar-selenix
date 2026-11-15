/**
 * Selenix API client — every network call in the app goes through here.
 *
 * In development Vite proxies `/api/*` to http://localhost:5000 (vite.config.js).
 * Set VITE_API_BASE to call a different host in production.
 *
 * KEY MAPPING
 * -----------
 * The Flask backend (lunar_backend/, not modified) uses its own key names
 * (`longest_dark_h`, `earth_vis`, `irradiance`, `ranking` + `score_*`/`raw_*`).
 * The UI is written against the documented contract (`max_continuous_dark_hr`,
 * `earth_visible`, `irradiance_w_m2`, `ranked` + `breakdown`). The normalisers
 * below *rename* fields; they never rescale, round, resample or invent values.
 * When the backend already uses the documented name, that value wins.
 */
import axios from 'axios'

const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export const http = axios.create({
  baseURL: "https://lunar-selenix.onrender.com/",
  timeout: 300_000, // Horizons fetches for multi-site compares can be slow
  headers: { 'Content-Type': 'application/json' },
})

/* ------------------------------------------------------------------ */
/*  Errors                                                             */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  /**
   * @param {string} message  user-facing text (never a traceback)
   * @param {number} status   HTTP status, 0 = network / unreachable
   * @param {string} [detail] backend's own `error` string, for a details line
   */
  constructor(message, status, detail) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function toApiError(err) {
  if (axios.isCancel(err)) {
    const e = new ApiError('Request cancelled', -1)
    e.cancelled = true
    return e
  }
  if (err.code === 'ECONNABORTED') {
    return new ApiError('The backend took too long to respond. Try a shorter window or a larger time step.', 0)
  }
  const res = err.response
  if (!res) {
    return new ApiError('Backend unreachable. Start the Flask server on port 5000 and try again.', 0)
  }
  // Backend error JSON: {error, traceback?}. The traceback is deliberately dropped.
  const backendMsg = typeof res.data?.error === 'string' ? res.data.error : null
  if (res.status === 400) {
    return new ApiError(backendMsg || 'The request was rejected as invalid.', 400, backendMsg)
  }
  if (res.status >= 500) {
    // e.g. "Timeline computation failed: <reason>" -> keep only the reason's first line.
    const reason = backendMsg ? backendMsg.split('\n')[0].replace(/^[^:]+failed:\s*/i, '') : null
    return new ApiError(
      'The backend could not finish the calculation. JPL Horizons may be busy — please retry in a moment.',
      res.status,
      reason,
    )
  }
  return new ApiError(backendMsg || `Request failed (${res.status})`, res.status, backendMsg)
}

async function call(config) {
  try {
    const res = await http.request(config)
    return res.data
  } catch (err) {
    throw toApiError(err)
  }
}

/* ------------------------------------------------------------------ */
/*  Validation (mirrors backend rules so we never send a doomed request) */
/* ------------------------------------------------------------------ */

/** Returns an error string, or null when valid. */
export function validateStepMin(step) {
  if (step === '' || step == null) return 'Time step is required.'
  const n = Number(step)
  if (!Number.isFinite(n)) return 'Time step must be a number.'
  if (!Number.isInteger(n)) return 'Time step must be a whole number of minutes.'
  if (n < 1 || n > 1440) return 'Time step must be between 1 and 1440 minutes.'
  return null
}
export function validateDays(days) {
  const n = Number(days)
  if (!Number.isFinite(n) || n <= 0 || n > 365.25) return 'Duration must be between 0 and 365.25 days.'
  return null
}
export function validateLatLon(lat, lon) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitude must be between -90 and 90.'
  if (!Number.isFinite(lon) || lon < -360 || lon > 360) return 'Longitude must be between -360 and 360.'
  return null
}
export function validateHeight(h) {
  const n = Number(h)
  if (!Number.isFinite(n) || n < 0) return 'Height must be a non-negative number of metres.'
  return null
}

/* ------------------------------------------------------------------ */
/*  Summary / criteria field definitions                               */
/* ------------------------------------------------------------------ */

/**
 * Documented summary fields, each with the backend aliases it may arrive as.
 * `unit` belongs to the alias actually found, so a kWh value is never
 * labelled Wh (and is never multiplied to fake it).
 */
const SUMMARY_FIELDS = [
  { key: 'sunlit_pct', label: 'Sunlit time', aliases: [['sunlit_pct', '%']] },
  { key: 'max_continuous_dark_hr', label: 'Longest continuous dark', aliases: [['max_continuous_dark_hr', 'hr'], ['longest_dark_h', 'hr']] },
  { key: 'earth_visible_pct', label: 'Earth visible', aliases: [['earth_visible_pct', '%'], ['earth_pct', '%']] },
  { key: 'longest_comms_gap_hr', label: 'Longest comms gap', aliases: [['longest_comms_gap_hr', 'hr'], ['longest_comms_gap_h', 'hr']] },
  { key: 'energy_vertical', label: 'Energy · vertical panel', aliases: [['energy_vertical_wh_m2', 'Wh/m²'], ['energy_vert_kwh_m2', 'kWh/m²']] },
  { key: 'energy_horizontal', label: 'Energy · horizontal panel', aliases: [['energy_horizontal_wh_m2', 'Wh/m²'], ['energy_flat_kwh_m2', 'kWh/m²']] },
  { key: 'max_sun_elevation_deg', label: 'Max Sun elevation', aliases: [['max_sun_elevation_deg', '°'], ['max_sun_el', '°']] },
  { key: 'battery_required_wh', label: 'Battery required', aliases: [['battery_required_wh', 'Wh']] },
]

/**
 * Compare criteria in documented naming, mapped to the backend's weight keys.
 * The backend silently ignores unknown weight keys, so this mapping is what
 * makes the sliders actually affect the ranking.
 */
export const CRITERIA = [
  { key: 'sunlit_pct', backend: 'sunlit_pct', label: 'Sunlit time', unit: '%', higherIsBetter: true },
  { key: 'max_continuous_dark_hr', backend: 'longest_dark_h', label: 'Longest night', unit: 'hr', higherIsBetter: false },
  { key: 'earth_visible_pct', backend: 'earth_pct', label: 'Earth visibility', unit: '%', higherIsBetter: true },
  { key: 'energy_vertical_wh_m2', backend: 'energy_vert_kwh_m2', label: 'Energy (vertical panel)', unit: 'kWh/m²', higherIsBetter: true },
  { key: 'longest_comms_gap_hr', backend: 'longest_comms_gap_h', label: 'Longest comms gap', unit: 'hr', higherIsBetter: false },
  { key: 'max_sun_elevation_deg', backend: 'max_sun_el', label: 'Max Sun elevation', unit: '°', higherIsBetter: true },
  { key: 'terrain_horizon_max_deg', backend: 'terrain_hz_max', label: 'Terrain horizon (max)', unit: '°', higherIsBetter: false },
  { key: 'terrain_horizon_mean_deg', backend: 'terrain_hz_mean', label: 'Terrain horizon (mean)', unit: '°', higherIsBetter: false },
]
const BY_BACKEND = Object.fromEntries(CRITERIA.map((c) => [c.backend, c]))
const BY_KEY = Object.fromEntries(CRITERIA.map((c) => [c.key, c]))

/** backend weight dict -> documented weight dict */
export function weightsFromBackend(w = {}) {
  const out = {}
  for (const [k, v] of Object.entries(w)) {
    const c = BY_BACKEND[k] || BY_KEY[k]
    if (c) out[c.key] = v
  }
  return out
}
/** documented weight dict -> backend weight dict */
function weightsToBackend(w = {}) {
  const out = {}
  for (const [k, v] of Object.entries(w)) {
    const c = BY_KEY[k] || BY_BACKEND[k]
    if (c) out[c.backend] = Number(v)
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Normalisers                                                        */
/* ------------------------------------------------------------------ */

export function normalizeTimeline(raw, request) {
  const s = raw?.series || {}
  const summaryRaw = { ...(raw?.summary || {}) }
  if (summaryRaw.battery_required_wh == null && raw?.battery_required_wh != null) {
    summaryRaw.battery_required_wh = raw.battery_required_wh
  }

  const summary = SUMMARY_FIELDS.map((f) => {
    const hit = f.aliases.find(([alias]) => summaryRaw[alias] != null)
    return {
      key: f.key,
      label: f.label,
      value: hit ? summaryRaw[hit[0]] : null,
      unit: hit ? hit[1] : f.aliases[0][1],
      sourceKey: hit ? hit[0] : null,
    }
  })

  const t_utc = s.t_utc ?? []
  return {
    raw,                           // untouched API response (for JSON export)
    request,                       // the exact body that produced this result
    summary,                       // [{key,label,value,unit,sourceKey}]
    summaryRaw,                    // untouched backend summary object
    series: {
      t_utc,
      t: t_utc.map((iso) => new Date(iso)), // parsed once; same length/order as backend
      sun_az: s.sun_az ?? [],
      sun_el: s.sun_el ?? [],
      sun_frac: s.sun_frac ?? [],
      earth_az: s.earth_az ?? [],
      earth_el: s.earth_el ?? [],
      earth_visible: s.earth_visible ?? s.earth_vis ?? [],
      irradiance_w_m2: s.irradiance_w_m2 ?? s.irradiance ?? [],
    },
    battery_required_wh: raw?.battery_required_wh ?? summaryRaw.battery_required_wh ?? null,
    physics_notes: raw?.physics_notes || '',
  }
}

/**
 * Returns {ranked:[{rank,name,lat_deg,lon_deg,total_score,breakdown:{criterionKey:{value,score,weight,contribution}}}], metadata}
 * `contribution` = score × weight (the exact term the backend sums into total_score).
 */
export function normalizeCompare(raw) {
  const metadata = raw?.metadata || {}
  if (Array.isArray(raw?.ranked)) {
    return {
      metadata,
      weights: weightsFromBackend(metadata.weights || {}),
      ranked: raw.ranked.map((r) => ({
        ...r,
        breakdown: Object.fromEntries(Object.entries(r.breakdown || {}).map(([k, b]) => {
          const c = BY_BACKEND[k] || BY_KEY[k]
          return [c ? c.key : k, { ...b, contribution: b.contribution ?? (b.score ?? 0) * (b.weight ?? 0) }]
        })),
      })),
    }
  }
  const backendWeights = metadata.weights || {}
  const ranked = (raw?.ranking || []).map((row) => {
    const breakdown = {}
    for (const c of CRITERIA) {
      const score = row[`score_${c.backend}`]
      if (score == null) continue
      const weight = backendWeights[c.backend] ?? 0
      breakdown[c.key] = { value: row[`raw_${c.backend}`] ?? null, score, weight, contribution: score * weight }
    }
    return { rank: row.rank, name: row.name, lat_deg: row.lat_deg, lon_deg: row.lon_deg, total_score: row.total_score, breakdown }
  })
  return { metadata, weights: weightsFromBackend(backendWeights), ranked }
}

/* ------------------------------------------------------------------ */
/*  Endpoints                                                          */
/* ------------------------------------------------------------------ */

export const api = {
  health: (opts = {}) => call({ url: '/api/health', method: 'GET', timeout: 5000, ...opts }),

  sitePresets: (opts = {}) => call({ url: '/api/site-presets', method: 'GET', ...opts }),

  weightProfiles: async (opts = {}) => {
    const r = await call({ url: '/api/weight-profiles', method: 'GET', ...opts })
    const profiles = Object.fromEntries(Object.entries(r?.profiles || {}).map(([k, w]) => [k, weightsFromBackend(w)]))
    return { default: weightsFromBackend(r?.default || {}), profiles }
  },

  /**
   * body: {lat_deg, lon_deg, days, step_min, height_m?, start_utc?}
   * Validates locally first; rejects with ApiError(400) without a network call.
   */
  timeline: async (body, { signal } = {}) => {
    const err = validateLatLon(body.lat_deg, body.lon_deg) || validateStepMin(body.step_min) || validateDays(body.days) || validateHeight(body.height_m ?? 2.0)
    if (err) throw new ApiError(err, 400)
    const request = { ...body, step_min: Number(body.step_min), height_m: body.height_m ?? 2.0 }
    const raw = await call({ url: '/api/timeline', method: 'POST', data: request, signal })
    return normalizeTimeline(raw, request)
  },

  /** body: {sites:[{name,lat_deg,lon_deg,height_m}], days, step_min, weights:{documentedKey: number}, start_utc?} */
  compare: async (body, { signal } = {}) => {
    const err = validateStepMin(body.step_min) || validateDays(body.days)
    if (err) throw new ApiError(err, 400)
    if (!body.sites?.length || body.sites.length < 2) throw new ApiError('Select at least two sites to compare.', 400)
    const backendWeights = weightsToBackend(body.weights)
    const sum = Object.values(backendWeights).reduce((a, b) => a + b, 0)
    if (!(sum > 0)) throw new ApiError('At least one criterion weight must be above zero.', 400)
    const request = { ...body, step_min: Number(body.step_min), weights: backendWeights }
    const raw = await call({ url: '/api/compare', method: 'POST', data: request, signal })
    return normalizeCompare(raw)
  },
}
