/* eslint-disable react-refresh/only-export-components */
import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import MoonGlobe from '../components/Globe/MoonGlobe.jsx'
import SkyIndicators from '../components/Globe/SkyIndicators.jsx'
import TimeScrubber from '../components/Globe/TimeScrubber.jsx'
import { pageVariants, fadeUp, stagger, Pill, Kbd, IconGrid, IconLayers, IconTarget, IconBack, IconArrow, IconCompare, IconSun, Spinner } from '../components/ui/index.jsx'
import { useToast } from '../components/Common/Toast.jsx'
import { DEFAULT_WINDOW, useTimelineCache } from '../lib/timelineCache.jsx'
import { fmtDeg, COORD_DECIMALS } from '../lib/lunar.js'
import { useMediaQuery } from '../lib/hooks.js'

// Presentation-only fallback colours (the API may provide `color`; it wins when present).
export const PRESET_COLORS = ['#38d9f5', '#f2b134', '#22b58a', '#9085e9', '#6da7ec', '#e66767', '#d95926', '#a7b4d3', '#7ee8fa', '#c98500']

/** Build the canonical site object from an API preset — values copied verbatim. */
export function siteFromPreset(p, i = 0) {
  return {
    lat: p.lat_deg,
    lon: p.lon_deg,
    height_m: p.height_m ?? 2.0,
    name: p.name,
    description: p.description,
    color: p.color || PRESET_COLORS[i % PRESET_COLORS.length],
    source: 'preset',
  }
}

export default function GlobeView({ site, onSiteChange, onAnalyze, onCompare, onBackToSystem, presets, backendOk }) {
  const [ready, setReady] = useState(false)
  const [focus, setFocus] = useState(null)
  const [showLabels, setShowLabels] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [hover, setHover] = useState(null)
  const [listOpen, setListOpen] = useState(true)
  const [popupOpen, setPopupOpen] = useState(!!site)
  const [scrubIdx, setScrubIdx] = useState(0)
  const [previewing, setPreviewing] = useState(false)
  const cache = useTimelineCache()
  const toast = useToast()
  const previewCtrl = useRef()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const isWide = useMediaQuery('(min-width: 1280px)')

  const flyTo = useCallback((lat, lon, distance) => setFocus({ lat, lon, distance, key: Math.random() }), [])

  const select = useCallback((s) => {
    previewCtrl.current?.abort()
    setPreviewing(false)
    onSiteChange(s)
    setPopupOpen(true)
    setScrubIdx(0)
    if (!isWide) setListOpen(false)
  }, [onSiteChange, isWide])

  const handleGlobePick = useCallback((s) => {
    if (s.source === 'feature') {
      select({ lat: s.lat, lon: s.lon, height_m: 2.0, name: s.name, source: 'feature' })
    } else {
      // s.lat/s.lon are already rounded to COORD_DECIMALS in MoonGlobe — used as-is.
      select({ lat: s.lat, lon: s.lon, height_m: 2.0, name: null, source: 'click' })
    }
  }, [select])

  const choosePreset = useCallback((p, i) => {
    select(siteFromPreset(p, i))
    flyTo(p.lat_deg, p.lon_deg, Math.abs(p.lat_deg) > 80 ? 1.75 : 2.3)
  }, [select, flyTo])

  // Sky markers use the latest timeline cached for this exact site (from /analysis or a quick preview).
  const tl = site ? cache.latestForSite(site.lat, site.lon, site.height_m ?? 2.0) : null

  const preview = useCallback(async () => {
    if (!site) return
    previewCtrl.current?.abort()
    const c = new AbortController()
    previewCtrl.current = c
    setPreviewing(true)
    try {
      await cache.fetchTimeline({ lat_deg: site.lat, lon_deg: site.lon, height_m: site.height_m ?? 2.0, ...DEFAULT_WINDOW }, { signal: c.signal })
      if (c.signal.aborted) return
      setScrubIdx(0)
      setFocus({ lat: site.lat, lon: site.lon, distance: 1.85, key: Math.random() })
    } catch (e) {
      if (!e.cancelled && !c.signal.aborted) toast.error(e, 'Preview failed')
    } finally {
      if (!c.signal.aborted) setPreviewing(false)
    }
  }, [site, cache, toast])
  const si = tl ? Math.min(scrubIdx, tl.series.t_utc.length - 1) : 0
  const showList = ready && listOpen

  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" exit="exit" className="fixed inset-0 overflow-hidden">
      <div className="absolute inset-0">
        <MoonGlobe
          selected={site ? { lat: site.lat, lon: site.lon, name: site.name || 'Custom site' } : null}
          onSelect={handleGlobePick}
          focus={focus}
          showLabels={showLabels}
          showGrid={showGrid}
          autoRotate
          onReady={() => setReady(true)}
          onHover={setHover}
          quality={isMobile ? 'low' : 'high'}
          cameraPosition={isMobile ? [0, 0.6, 4.2] : [0.6, 0.7, 3.3]}
        >
          {tl && (
            <SkyIndicators
              lat={tl.request.lat_deg}
              lon={tl.request.lon_deg}
              sunAz={tl.series.sun_az[si]}
              sunEl={tl.series.sun_el[si]}
              earthAz={tl.series.earth_az[si]}
              earthEl={tl.series.earth_el[si]}
              earthVisible={tl.series.earth_visible[si]}
            />
          )}
        </MoonGlobe>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_45%,_rgba(4,6,13,0.75)_100%)]" />

      {/* Loading surface */}
      <AnimatePresence>
        {!ready && (
          <motion.div key="loader" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }} className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-void">
            <div className="relative h-28 w-28">
              <div className="absolute inset-0 rounded-full border border-accent/20" />
              <div className="absolute inset-0 animate-spin rounded-full border-t border-accent [animation-duration:2.4s]" />
              <div className="absolute inset-4 animate-spin rounded-full border-b border-accent/50 [animation-duration:3.6s]" />
              <div className="absolute inset-9 rounded-full bg-gradient-to-br from-space-500 to-void shadow-[inset_-8px_-6px_18px_rgba(0,0,0,0.8)]" />
            </div>
            <div className="shimmer-text mt-6 font-display text-sm tracking-[0.2em]">LOADING LROC SURFACE MOSAIC</div>
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">NASA LRO · WAC color · LOLA elevation</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Headline */}
      <AnimatePresence>
        {ready && (
          <motion.div key="headline" variants={stagger(0.08, 0.3)} initial="hidden" animate="show" exit={{ opacity: 0, transition: { duration: 0.2 } }} className="pointer-events-none absolute left-4 top-20 z-20 max-w-[min(92vw,520px)] md:left-6 md:top-24">
            <motion.div variants={fadeUp} className="flex items-center gap-2">
              <button type="button" onClick={onBackToSystem} className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border hairline bg-void/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim transition hover:text-accent">
                <IconBack className="h-3 w-3" /> Solar system
              </button>
              <Pill tone="accent">JPL Horizons</Pill>
            </motion.div>
            <motion.h1 variants={fadeUp} className="mt-3 font-display text-3xl font-semibold leading-[1.05] tracking-tight text-ink md:text-5xl">
              Where should the next<br />
              <span className="bg-gradient-to-r from-accent-soft via-accent to-earth-bright bg-clip-text text-transparent">lunar mission</span> land?
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-3 hidden max-w-md text-sm leading-relaxed text-ink-dim md:block">
              Click anywhere on the Moon, or pick a candidate site, to model sunlight, Earth line-of-sight and power needs.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Presets list */}
      <AnimatePresence>
        {showList && (
          <motion.aside
            key="presets"
            initial={{ opacity: 0, x: isMobile ? 0 : -24, y: isMobile ? 40 : 0 }}
            animate={{ opacity: 1, x: 0, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, x: isMobile ? 0 : -24, transition: { duration: 0.25 } }}
            className={`glass-strong absolute z-20 flex flex-col overflow-hidden max-md:inset-x-3 max-md:bottom-3 max-md:max-h-[50vh] md:left-6 md:top-[19.5rem] md:w-[330px] lg:top-[21rem] ${tl ? 'md:bottom-[10.5rem]' : 'md:bottom-6'}`}
          >
            <div className="flex items-center justify-between border-b hairline px-4 py-3">
              <div>
                <div className="label-caps">Candidate sites</div>
                <div className="font-display text-sm font-semibold text-ink">/api/site-presets <span className="num text-xs text-ink-muted">({presets.sites.length})</span></div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="btn-ghost !px-2 !py-1.5" data-active={showLabels} onClick={() => setShowLabels((v) => !v)} title="Toggle feature labels"><IconLayers className="h-3.5 w-3.5" /></button>
                <button type="button" className="btn-ghost !px-2 !py-1.5" data-active={showGrid} onClick={() => setShowGrid((v) => !v)} title="Toggle lat/lon grid"><IconGrid className="h-3.5 w-3.5" /></button>
                <button type="button" className="btn-ghost !px-2 !py-1.5" onClick={() => flyTo(-89.5, 0, 1.75)} title="Fly to the south pole"><IconTarget className="h-3.5 w-3.5" /></button>
                <button type="button" className="btn-ghost !px-2 !py-1.5" onClick={() => setListOpen(false)} title="Hide list">✕</button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {presets.loading && <div className="flex items-center gap-2 p-3 text-xs text-ink-muted"><Spinner className="h-4 w-4" /> Loading presets…</div>}
              {presets.error && <div className="p-3 text-xs text-danger">Could not load presets: {presets.error}</div>}
              {!presets.loading && !presets.error && presets.sites.length === 0 && <div className="p-3 text-xs text-ink-muted">No presets returned by the backend.</div>}
              <motion.ul variants={stagger(0.04, 0.1)} initial="hidden" animate="show" className="space-y-1">
                {presets.sites.map((p, i) => {
                  const active = site?.source === 'preset' && site.name === p.name
                  const color = p.color || PRESET_COLORS[i % PRESET_COLORS.length]
                  return (
                    <motion.li key={p.name} variants={fadeUp}>
                      <button type="button" onClick={() => choosePreset(p, i)} className={`group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? 'bg-accent/10 ring-1 ring-accent/40' : 'hover:bg-white/5'}`}>
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-display text-sm font-medium ${active ? 'text-accent' : 'text-ink'}`}>{p.name}</span>
                          <span className="num block text-[10px] text-ink-muted">lat {fmtDeg(p.lat_deg)} · lon {fmtDeg(p.lon_deg)} · h {p.height_m} m</span>
                          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-ink-muted">{p.description}</span>
                        </span>
                      </button>
                    </motion.li>
                  )
                })}
              </motion.ul>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {ready && !showList && (
        <button type="button" onClick={() => setListOpen(true)} className={`btn-ghost absolute left-4 z-20 md:left-6 ${tl ? 'bottom-40' : 'bottom-4 md:bottom-6'}`}>
          <IconLayers className="h-3.5 w-3.5" /> Sites
        </button>
      )}

      {/* Hover readout — same rounding & sign convention as a click */}
      <AnimatePresence>
        {ready && hover && !isMobile && !tl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full border hairline bg-void/60 px-3 py-1.5 font-mono text-[11px] text-ink-dim backdrop-blur">
            lat {hover.lat.toFixed(COORD_DECIMALS)}° · lon {hover.lon.toFixed(COORD_DECIMALS)}°
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty hint */}
      <AnimatePresence>
        {ready && !site && !isMobile && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: 1 } }} exit={{ opacity: 0 }} className="glass pointer-events-none absolute bottom-6 right-6 z-20 flex items-center gap-3 px-4 py-3 text-xs text-ink-dim">
            <span className="relative inline-flex h-2.5 w-2.5"><span className="ring-pulse absolute inset-0 rounded-full" /><span className="relative h-2.5 w-2.5 rounded-full bg-accent" /></span>
            <span>Click the surface to analyse a site · <Kbd>drag</Kbd> rotate · <Kbd>scroll</Kbd> zoom</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Site popup — coordinates + Analyze This Site */}
      <AnimatePresence>
        {ready && site && popupOpen && (
          <motion.div key={`${site.lat}|${site.lon}`} initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }} className="glass-strong absolute right-3 top-[4.5rem] z-30 w-[min(92vw,320px)] p-4 md:right-6 md:top-24" role="dialog" aria-label="Selected site">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent via-accent/40 to-transparent" />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="label-caps">{site.source === 'preset' ? 'Preset site' : site.source === 'feature' ? 'Map feature' : 'Picked on globe'}</div>
                <div className="truncate font-display text-lg font-semibold text-ink">{site.name || 'Custom Site'}</div>
              </div>
              <button type="button" className="text-ink-muted transition hover:text-ink" onClick={() => setPopupOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[['lat_deg', `${Number(site.lat).toFixed(2)}°`], ['lon_deg', `${Number(site.lon).toFixed(2)}°`], ['height_m', `${site.height_m ?? 2.0} m`]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-void/50 px-2 py-1.5">
                  <div className="label-caps !text-[0.55rem]">{k}</div>
                  <div className="num text-sm text-ink">{v}</div>
                </div>
              ))}
            </div>
            <button type="button" className="btn-primary mt-4 w-full !py-3 !text-sm" onClick={() => onAnalyze(site)} disabled={backendOk === false}>
              Analyze This Site <IconArrow />
            </button>
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-ghost flex-1 !py-1.5 !text-xs" onClick={preview} disabled={previewing || !!tl || backendOk === false} title="Fetch the timeline and show the Sun and Earth over this site on the globe">
                {previewing ? <Spinner className="h-3.5 w-3.5" /> : <IconSun className="h-3.5 w-3.5" />} {tl ? 'Previewing on globe' : previewing ? 'Loading…' : 'Preview Sun & Earth'}
              </button>
              <button type="button" className="btn-ghost !px-2.5 !py-1.5" onClick={onCompare} title="Compare sites"><IconCompare className="h-3.5 w-3.5" /></button>
            </div>
            {backendOk === false && <div className="mt-2 text-[11px] text-danger">Backend offline. Start the Flask API on port 5000.</div>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick-preview time scrubber — Sun/Earth position in the site sky (full player is on /analysis) */}
      <AnimatePresence>
        {ready && tl && (
          <div key="scrubber" className={`absolute bottom-4 right-4 z-20 md:bottom-6 md:right-6 ${showList ? 'left-4 md:left-[372px]' : 'left-4 md:left-6'}`}>
            <TimeScrubber data={tl} index={si} onIndex={setScrubIdx} title="Quick preview" />
          </div>
        )}
      </AnimatePresence>
    </motion.main>
  )
}
