import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, LayoutGroup } from 'framer-motion'
import SpaceBackground from './components/ui/SpaceBackground.jsx'
import TopBar from './components/ui/TopBar.jsx'
import LandingView from './views/LandingView.jsx'
import DashboardView from './views/DashboardView.jsx'
import CompareView from './views/CompareView.jsx'
import { useBackendHealth, useSitePresets } from './lib/hooks.js'

/* ---- tiny hash router: #/dashboard?lat=-89.9&lon=0&name=Shackleton%20Rim ---- */
function readHash() {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = h.split('?')
  const q = new URLSearchParams(query)
  const lat = parseFloat(q.get('lat'))
  const lon = parseFloat(q.get('lon'))
  const site = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, name: q.get('name') || null } : null
  const view = path === 'dashboard' && site ? 'dashboard' : path === 'compare' ? 'compare' : 'landing'
  return { view, site, autoRun: q.get('run') === '1' }
}

function writeHash(view, site) {
  const q = site ? `?lat=${site.lat.toFixed(4)}&lon=${site.lon.toFixed(4)}${site.name ? `&name=${encodeURIComponent(site.name)}` : ''}` : ''
  const next = view === 'landing' ? (site ? `#/globe${q}` : '#/') : `#/${view}${q}`
  if (window.location.hash !== next) window.history.replaceState(null, '', next)
}

export default function App() {
  const [{ view, site, autoRun }, setState] = useState(() => readHash())
  const backendOk = useBackendHealth()
  const presets = useSitePresets()

  const setView = useCallback((v) => setState((s) => ({ ...s, view: v })), [])
  const setSite = useCallback((s) => setState((st) => ({ ...st, site: s })), [])
  const analyze = useCallback((s) => setState({ view: 'dashboard', site: s }), [])

  useEffect(() => { writeHash(view, site) }, [view, site])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setView('landing') }
    const onHash = () => setState(readHash())
    window.addEventListener('keydown', onKey)
    window.addEventListener('hashchange', onHash)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onHash) }
  }, [setView])

  return (
    <LayoutGroup>
      <div className="relative min-h-full">
        <SpaceBackground dim={view === 'landing'} />
        <TopBar view={view} onNavigate={setView} backendOk={backendOk} />

        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <LandingView key="landing" site={site} onSiteChange={setSite} onAnalyze={analyze} onCompare={() => setView('compare')} presets={presets} backendOk={backendOk} />
          )}
          {view === 'dashboard' && site && (
            <DashboardView key="dashboard" site={site} presets={presets} onBack={() => setView('landing')} onCompare={() => setView('compare')} onSiteChange={setSite} />
          )}
          {view === 'compare' && (
            <CompareView key="compare" presets={presets} currentSite={site} autoRun={autoRun} onBack={() => setView('landing')} onAnalyze={analyze} />
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  )
}
