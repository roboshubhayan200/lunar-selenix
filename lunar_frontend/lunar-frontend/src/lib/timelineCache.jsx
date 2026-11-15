/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { api } from '../api/client.js'

/** Default analysis window — the backend's default start, one synodic month, hourly samples. */
export const DEFAULT_WINDOW = { start_utc: '2027-06-01', days: 29.53, step_min: 60 }

const reqKey = (b) => [b.lat_deg, b.lon_deg, b.height_m, b.start_utc, b.days, b.step_min].join('|')
const siteKey = (lat, lon, h) => [lat, lon, h].join('|')

const Ctx = createContext(null)

/**
 * In-memory cache of /api/timeline results for this session.
 * Results are stored exactly as normalizeTimeline() returned them.
 */
export function TimelineCacheProvider({ children }) {
  const byReq = useRef(new Map())
  const bySite = useRef(new Map())
  const [version, setVersion] = useState(0)

  const get = useCallback((body) => byReq.current.get(reqKey(body)) || null, [])
  const latestForSite = useCallback((lat, lon, h) => bySite.current.get(siteKey(lat, lon, h)) || null, [])

  const fetchTimeline = useCallback(async (body, opts) => {
    const hit = byReq.current.get(reqKey(body))
    if (hit) return hit
    const r = await api.timeline(body, opts)
    byReq.current.set(reqKey(body), r)
    bySite.current.set(siteKey(r.request.lat_deg, r.request.lon_deg, r.request.height_m), r)
    setVersion((v) => v + 1)
    return r
  }, [])

  const value = useMemo(() => ({ get, latestForSite, fetchTimeline, version }), [get, latestForSite, fetchTimeline, version])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTimelineCache() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTimelineCache must be used inside <TimelineCacheProvider>')
  return c
}

/** Build the /analysis URL for a site. `name` is only added for non-preset picks (e.g. a map feature). */
export function analysisPath(site, { includeName = false } = {}) {
  const q = new URLSearchParams({ lat: String(site.lat), lon: String(site.lon), height: String(site.height_m ?? 2.0) })
  if (includeName && site.name) q.set('name', site.name)
  return `/analysis?${q.toString()}`
}
