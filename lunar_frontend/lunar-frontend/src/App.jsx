import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup } from 'framer-motion'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import SpaceBackground from './components/ui/SpaceBackground.jsx'
import TopBar from './components/ui/TopBar.jsx'
import { ToastProvider } from './components/Common/Toast.jsx'
import SolarSystemView from './views/SolarSystemView.jsx'
import GlobeView from './views/GlobeView.jsx'
import AnalysisView from './views/AnalysisView.jsx'
import CompareView from './components/Compare/CompareView.jsx'
import PlannerView from './components/Planner/PlannerView.jsx'
import { useBackendHealth, useSitePresets } from './lib/hooks.js'
import { TimelineCacheProvider, analysisPath } from './lib/timelineCache.jsx'

/*
 * Routes
 *   /                                   Globe (Explorer Mode default)
 *   /analysis?lat=X&lon=Y&height=Z      Full site analysis report
 *   /compare                            Compare view
 *   /planner                            Planner Mode
 *   /system                             Solar-system overview (Sun–Earth–Moon)
 */
const NAV_PATHS = { system: '/system', moon: '/', compare: '/compare', planner: '/planner' }

function viewOf(pathname) {
  if (pathname.startsWith('/planner')) return 'planner'
  if (pathname.startsWith('/compare')) return 'compare'
  if (pathname.startsWith('/system')) return 'system'
  return 'moon' // "/" and "/analysis"
}

/** Redirect pre-router hash links (#/moon?…, #/compare, #/planner) to real paths. */
function useLegacyHashRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    const h = window.location.hash
    if (!h.startsWith('#/')) return
    const [path, query = ''] = h.slice(2).split('?')
    const q = new URLSearchParams(query)
    if (path === 'compare' || path === 'planner') navigate(`/${path}`, { replace: true })
    else if ((path === 'moon' || path === 'globe' || path === 'dashboard') && q.has('lat') && q.has('lon')) {
      navigate(analysisPath({ lat: q.get('lat'), lon: q.get('lon'), height_m: q.get('h') ?? 2.0 }), { replace: true })
    } else navigate('/', { replace: true })
  }, [navigate])
}

function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { ok: backendOk, recheck } = useBackendHealth()
  const presets = useSitePresets(backendOk)
  const [site, setSite] = useState(null) // globe selection, kept while navigating
  useLegacyHashRedirect()

  const view = viewOf(location.pathname)
  const mode = view === 'planner' ? 'planner' : 'explorer'
  const lastExplorer = useRef('/')
  useEffect(() => {
    if (view !== 'planner') lastExplorer.current = location.pathname + location.search
  }, [view, location.pathname, location.search])

  const onNavigate = useCallback((id) => navigate(NAV_PATHS[id] ?? '/'), [navigate])
  const onMode = useCallback((m) => navigate(m === 'planner' ? '/planner' : lastExplorer.current), [navigate])
  const analyze = useCallback((s) => {
    setSite(s)
    navigate(analysisPath(s, { includeName: s.source === 'feature' }))
  }, [navigate])

  return (
    <LayoutGroup>
      <div className="relative min-h-full">
        {mode === 'explorer' && <SpaceBackground dim={view !== 'compare'} />}
        <TopBar view={view} mode={mode} onNavigate={onNavigate} onMode={onMode} backendOk={backendOk} onRecheck={recheck} />

        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<GlobeView site={site} onSiteChange={setSite} onAnalyze={analyze} onCompare={() => navigate('/compare')} onBackToSystem={() => navigate('/system')} presets={presets} backendOk={backendOk} />} />
            <Route path="/analysis" element={<AnalysisView presets={presets} backendOk={backendOk} />} />
            <Route path="/compare" element={<CompareView presets={presets} currentSite={site} backendOk={backendOk} onBack={() => navigate('/')} onAnalyze={analyze} />} />
            <Route path="/planner" element={<PlannerView presets={presets} backendOk={backendOk} initialSite={site} />} />
            <Route path="/system" element={<SolarSystemView onEnterMoon={() => navigate('/')} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </div>
    </LayoutGroup>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <TimelineCacheProvider>
        <Shell />
      </TimelineCacheProvider>
    </ToastProvider>
  )
}
