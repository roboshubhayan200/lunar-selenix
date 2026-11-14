/**
 * Thin client for the Flask backend.
 *
 * In development Vite proxies `/api/*` to http://localhost:5000 (see
 * vite.config.js). Set VITE_API_BASE to point somewhere else in production.
 */
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

async function request(path, { method = 'GET', body, signal, timeoutMs = 240_000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('Request timed out')), timeoutMs)
  if (signal) signal.addEventListener('abort', () => ctrl.abort(signal.reason), { once: true })

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err?.name === 'AbortError') throw new ApiError(err.message || 'Request aborted', 0)
    throw new ApiError('Backend unreachable. Is the Flask server running on port 5000?', 0)
  }
  clearTimeout(timer)

  let data = null
  try { data = await res.json() } catch { /* non-JSON */ }

  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`
    throw new ApiError(msg, res.status, data)
  }
  return data
}

export const api = {
  health: (opts) => request('/api/health', opts),
  sitePresets: (opts) => request('/api/site-presets', opts),
  criteria: (opts) => request('/api/criteria', opts),
  weightProfiles: (opts) => request('/api/weight-profiles', opts),
  timeline: (body, opts) => request('/api/timeline', { method: 'POST', body, ...opts }),
  compare: (body, opts) => request('/api/compare', { method: 'POST', body, ...opts }),
}

/**
 * Normalise the timeline payload so the rest of the app can rely on one shape,
 * regardless of whether the backend uses `earth_vis` or `earth_visible`,
 * `irradiance` or `irradiance_w_m2`, and whether battery sits at the top level
 * or inside `summary`.
 */
export function normalizeTimeline(raw, params) {
  const s = raw.series || {}
  const earthVisRaw = s.earth_visible ?? s.earth_vis ?? []
  const series = {
    t_utc: s.t_utc ?? [],
    sun_az: s.sun_az ?? [],
    sun_el: s.sun_el ?? [],
    sun_frac: s.sun_frac ?? [],
    earth_az: s.earth_az ?? [],
    earth_el: s.earth_el ?? [],
    earth_visible: earthVisRaw.map(Boolean),
    irradiance: s.irradiance_w_m2 ?? s.irradiance ?? [],
  }
  const summary = raw.summary || {}
  const battery = raw.battery_required_wh ?? summary.battery_required_wh ?? null
  return {
    summary,
    series,
    battery_required_wh: battery,
    physics_notes: raw.physics_notes || '',
    params,
  }
}
