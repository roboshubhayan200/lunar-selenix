import { useEffect, useState } from 'react'
import { api } from './api.js'

/** Polls /api/health. Returns true | false | null (unknown). */
export function useBackendHealth(intervalMs = 15000) {
  const [ok, setOk] = useState(null)
  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const r = await api.health({ timeoutMs: 5000 })
        if (alive) setOk(r?.status === 'ok')
      } catch {
        if (alive) setOk(false)
      }
    }
    check()
    const id = setInterval(check, intervalMs)
    return () => { alive = false; clearInterval(id) }
  }, [intervalMs])
  return ok
}

/** Loads site presets once. */
export function useSitePresets() {
  const [state, setState] = useState({ sites: [], loading: true, error: null })
  useEffect(() => {
    let alive = true
    api.sitePresets()
      .then((r) => alive && setState({ sites: r.sites || [], loading: false, error: null }))
      .catch((e) => alive && setState({ sites: [], loading: false, error: e.message }))
    return () => { alive = false }
  }, [])
  return state
}

export function useWeightProfiles() {
  const [state, setState] = useState({ profiles: {}, defaults: {}, loading: true, error: null })
  useEffect(() => {
    let alive = true
    api.weightProfiles()
      .then((r) => alive && setState({ profiles: r.profiles || {}, defaults: r.default || {}, loading: false, error: null }))
      .catch((e) => alive && setState({ profiles: {}, defaults: {}, loading: false, error: e.message }))
    return () => { alive = false }
  }, [])
  return state
}

export function useCriteria() {
  const [state, setState] = useState({ criteria: [], loading: true })
  useEffect(() => {
    let alive = true
    api.criteria()
      .then((r) => alive && setState({ criteria: r.criteria || [], loading: false }))
      .catch(() => alive && setState({ criteria: [], loading: false }))
    return () => { alive = false }
  }, [])
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
