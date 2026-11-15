import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'

/** Polls /api/health. Returns {ok: true|false|null, recheck}. */
export function useBackendHealth(intervalMs = 10000) {
  const [ok, setOk] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const r = await api.health()
        if (alive) setOk(r?.status === 'ok')
      } catch {
        if (alive) setOk(false)
      }
    }
    check()
    const id = setInterval(check, intervalMs)
    return () => { alive = false; clearInterval(id) }
  }, [intervalMs, tick])
  const recheck = useCallback(() => { setOk(null); setTick((t) => t + 1) }, [])
  return { ok, recheck }
}

/**
 * Loads /api/site-presets. Values are kept exactly as the API returns them
 * (e.g. Connecting Ridge lon_deg 222.0 is NOT rewrapped to -138).
 * Re-fetches when the backend comes back online after a failure.
 */
export function useSitePresets(backendOk) {
  const [state, setState] = useState({ sites: [], loading: true, error: null })
  const needsFetch = state.sites.length === 0 && backendOk !== false
  useEffect(() => {
    if (!needsFetch) return
    let alive = true
    api.sitePresets()
      .then((r) => alive && setState({ sites: Array.isArray(r?.sites) ? r.sites : [], loading: false, error: null }))
      .catch((e) => alive && setState({ sites: [], loading: false, error: e.message }))
    return () => { alive = false }
  }, [needsFetch])
  return state
}

/** Loads /api/weight-profiles, already mapped to documented criterion keys. */
export function useWeightProfiles(backendOk) {
  const [state, setState] = useState({ profiles: {}, defaults: {}, loading: true, error: null })
  const needsFetch = Object.keys(state.defaults).length === 0 && backendOk !== false
  useEffect(() => {
    if (!needsFetch) return
    let alive = true
    api.weightProfiles()
      .then((r) => alive && setState({ profiles: r.profiles, defaults: r.default, loading: false, error: null }))
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e.message })))
    return () => { alive = false }
  }, [needsFetch])
  return state
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const m = window.matchMedia(query)
    const fn = (e) => setMatches(e.matches)
    m.addEventListener('change', fn)
    return () => m.removeEventListener('change', fn)
  }, [query])
  return matches
}
