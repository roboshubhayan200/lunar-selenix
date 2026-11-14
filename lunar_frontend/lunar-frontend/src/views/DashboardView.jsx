import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import MoonGlobe from '../components/three/MoonGlobe.jsx'
import SkyDome from '../components/three/SkyDome.jsx'
import { SunElevationChart, EarthElevationChart, IrradianceChart } from '../components/charts/TimelineCharts.jsx'
import VisibilityStrip from '../components/charts/VisibilityStrip.jsx'
import EducatorPanel from '../components/dashboard/EducatorPanel.jsx'
import {
  pageVariants, fadeUp, stagger, GlassCard, StatTile, Pill, Toggle, LoadingOverlay, ErrorBanner,
  IconBack, IconSun, IconEarth, IconBattery, IconSignal, IconMoon, IconPlay, IconPause, IconCompare, IconTarget,
} from '../components/ui/index.jsx'
import { api, normalizeTimeline } from '../lib/api.js'
import { deriveStats, buildChartRows, batteryWh, fmtHours, fmtWh, fmtUtc, DEPTH_OF_DISCHARGE } from '../lib/analysis.js'
import { describeSite, fmtLat, fmtLon, hemisphereLabel, latLonToVector3, surfaceDistanceKm } from '../lib/lunar.js'
import { useMediaQuery } from '../lib/hooks.js'

const DURATIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '1 lunar day (29.53 d)', value: 29.53 },
  { label: '2 lunar days (59.06 d)', value: 59.06 },
  { label: '3 lunar days (88.59 d)', value: 88.59 },
]
const STEPS = [15, 30, 60, 120]
const SEASONS = [
  { label: 'Jun 2027 · S. winter', value: '2027-06-01' },
  { label: 'Sep 2027', value: '2027-09-01' },
  { label: 'Dec 2027 · S. summer', value: '2027-12-01' },
  { label: 'Mar 2028', value: '2028-03-01' },
]

export default function DashboardView({ site, presets, onBack, onCompare }) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [params, setParams] = useState({ startUtc: '2027-06-01', days: 29.53, stepMin: 30 })
  const [loadW, setLoadW] = useState(100)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cursorIdx, setCursorIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [educator, setEducator] = useState(false)
  const [skyLook, setSkyLook] = useState(null)
  const abortRef = useRef()

  const siteName = useMemo(() => {
    if (site.name) return site.name
    const p = presets.sites.find((x) => surfaceDistanceKm(site.lat, site.lon, x.lat_deg, x.lon_deg) < 15)
    if (p) return p.name
    const d = describeSite(site.lat, site.lon)
    return d.near && d.near.distanceKm < 25 ? d.near.feature.name : 'Custom site'
  }, [site, presets.sites])
  const presetInfo = useMemo(() => presets.sites.find((x) => surfaceDistanceKm(site.lat, site.lon, x.lat_deg, x.lon_deg) < 15), [site, presets.sites])
  const description = useMemo(() => describeSite(site.lat, site.lon), [site])

  // ---- fetch timeline -------------------------------------------------
  const run = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    setPlaying(false)
    try {
      const raw = await api.timeline({
        lat_deg: site.lat, lon_deg: site.lon, height_m: 2.0,
        start_utc: params.startUtc, days: params.days, step_min: params.stepMin, load_w: 100,
      }, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      setData(normalizeTimeline(raw, { ...params, lat: site.lat, lon: site.lon }))
      setCursorIdx(0)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(e.message)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [site.lat, site.lon, params])

  useEffect(() => { run(); return () => abortRef.current?.abort() }, [run])

  // ---- derived --------------------------------------------------------
  const stats = useMemo(() => (data ? deriveStats(data.series, data.params.stepMin) : null), [data])
  const rows = useMemo(() => (data ? buildChartRows(data.series) : []), [data])
  const spanDays = stats?.spanDays ?? params.days
  const n = data?.series.t_utc.length ?? 0
  const idx = Math.min(Math.max(0, cursorIdx), Math.max(0, n - 1))
  const cursor = data && n ? {
    t: data.series.t_utc[idx],
    day: (new Date(data.series.t_utc[idx]) - new Date(data.series.t_utc[0])) / 86_400_000,
    sunAz: data.series.sun_az[idx], sunEl: data.series.sun_el[idx], sunFrac: data.series.sun_frac[idx],
    earthAz: data.series.earth_az[idx], earthEl: data.series.earth_el[idx], earthVisible: data.series.earth_visible[idx],
    irr: data.series.irradiance[idx],
  } : null

  const longestDark = data?.summary?.longest_dark_h ?? stats?.longestDarkH ?? null
  const battery = batteryWh(loadW, longestDark)
  const backendBattery = data?.battery_required_wh

  const setDay = useCallback((day) => {
    if (!n) return
    const i = Math.round((day / spanDays) * (n - 1))
    setCursorIdx(Math.min(n - 1, Math.max(0, i)))
  }, [n, spanDays])

  // ---- playback ---------------------------------------------------------
  useEffect(() => {
    if (!playing || !n) return
    const perTick = Math.max(1, Math.round(n / 700))
    const id = setInterval(() => setCursorIdx((i) => (i + perTick >= n ? 0 : i + perTick)), 40)
    return () => clearInterval(id)
  }, [playing, n])

  const noSun = stats && stats.sunlitHours === 0
  const miniCam = useMemo(() => latLonToVector3(site.lat, site.lon, 2.05).toArray(), [site.lat, site.lon])

  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" exit="exit" className="relative min-h-screen px-4 pb-16 pt-20 md:px-6 md:pt-24">
      <div className="mx-auto max-w-[1440px]">
        {/* Header */}
        <motion.div variants={stagger(0.05, 0)} initial="hidden" animate="show" className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <motion.div variants={fadeUp}>
            <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent">
              <IconBack className="h-3.5 w-3.5" /> Back to globe
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-4xl">{siteName}</h1>
              <Pill tone={Math.abs(site.lat) >= 85 ? 'accent' : 'neutral'}>{Math.abs(site.lat) >= 85 ? 'Polar' : Math.abs(site.lat) >= 60 ? 'High latitude' : 'Equatorial'}</Pill>
            </div>
            <div className="num mt-1 text-sm text-ink-dim">{fmtLat(site.lat, 3)} · {fmtLon(site.lon, 3)} <span className="text-ink-muted">· {hemisphereLabel(site.lat, site.lon)}</span></div>
          </motion.div>
          <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
            <Toggle checked={educator} onChange={setEducator} label="Educator mode" description="Explain the physics" />
            <button type="button" className="btn-ghost" onClick={onCompare}><IconCompare className="h-4 w-4" /> Compare sites</button>
          </motion.div>
        </motion.div>

        {error && <div className="mb-4"><ErrorBanner error={error} onRetry={run} /></div>}

        <motion.div variants={stagger(0.06, 0.1)} initial="hidden" animate="show" className="grid gap-4">
          {/* Row 1: site card + parameters */}
          <div className="grid gap-4 lg:grid-cols-12">
            <GlassCard className="relative overflow-hidden lg:col-span-4">
              <div className="absolute inset-0">
                <MoonGlobe
                  selected={{ lat: site.lat, lon: site.lon, name: siteName }}
                  interactive
                  autoRotate={false}
                  showLabels={!isMobile}
                  stars={false}
                  quality="low"
                  cameraPosition={miniCam}
                  className="opacity-90"
                />
              </div>
              <div className="pointer-events-none relative flex h-full min-h-[260px] flex-col justify-end bg-gradient-to-t from-space-900/90 via-space-900/20 to-transparent p-5">
                <div className="label-caps">Site context</div>
                <div className="mt-1 text-sm text-ink">{description.text}</div>
                {(presetInfo?.description || description.near?.feature?.note) && (
                  <div className="mt-1 text-xs leading-snug text-ink-dim">{presetInfo?.description || description.near.feature.note}</div>
                )}
                <div className="num mt-2 text-[11px] text-ink-muted">Observer height 2.0 m · {surfaceDistanceKm(site.lat, site.lon, -90, 0).toFixed(0)} km from south pole</div>
              </div>
            </GlassCard>

            <GlassCard className="p-5 lg:col-span-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="label-caps">Analysis window</div>
                  <div className="font-display text-base font-semibold text-ink">Ephemeris parameters</div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-ink-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse bg-sun-bright' : 'bg-comms-bright'}`} />
                  {loading ? 'Querying JPL Horizons…' : data ? `${n} samples · ${fmtUtc(stats.startUtc, { withTime: false })} → ${fmtUtc(stats.endUtc, { withTime: false })}` : 'idle'}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <label className="block">
                  <span className="label-caps">Start (UTC)</span>
                  <input type="date" className="field mt-1.5" value={params.startUtc} min="2020-01-01" max="2040-12-31" onChange={(e) => e.target.value && setParams((p) => ({ ...p, startUtc: e.target.value }))} />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {SEASONS.map((s) => (
                      <button key={s.value} type="button" className="chip !px-2 !py-0.5 !text-[10px]" data-active={params.startUtc === s.value} onClick={() => setParams((p) => ({ ...p, startUtc: s.value }))}>{s.label}</button>
                    ))}
                  </div>
                </label>
                <label className="block">
                  <span className="label-caps">Duration</span>
                  <select className="field mt-1.5" value={params.days} onChange={(e) => setParams((p) => ({ ...p, days: Number(e.target.value) }))}>
                    {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="label-caps">Time step</span>
                  <select className="field mt-1.5" value={params.stepMin} onChange={(e) => setParams((p) => ({ ...p, stepMin: Number(e.target.value) }))}>
                    {STEPS.map((s) => <option key={s} value={s}>{s} min</option>)}
                  </select>
                </label>
                <div className="block">
                  <div className="flex items-center justify-between">
                    <span className="label-caps">Continuous load</span>
                    <span className="num text-xs text-accent">{loadW} W</span>
                  </div>
                  <input type="range" min={25} max={1000} step={25} value={loadW} onChange={(e) => setLoadW(Number(e.target.value))} className="range mt-3" style={{ '--fill': `${((loadW - 25) / 975) * 100}%` }} />
                  <div className="mt-1 text-[10px] text-ink-muted">Drives battery sizing instantly, no re-query.</div>
                </div>
              </div>

              {noSun && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-start gap-3 rounded-xl border border-sun/30 bg-sun/10 p-3 text-xs text-ink-dim">
                  <IconSun className="mt-0.5 h-4 w-4 shrink-0 text-sun-bright" />
                  <div>
                    <b className="text-sun-bright">The Sun never clears the horizon in this window</b> (max elevation {stats.maxSunEl.toFixed(2)}°). Near the south pole the Sun is highest around the southern summer solstice — try a December start, or compare with Malapert Massif which stands higher.
                  </div>
                </motion.div>
              )}
            </GlassCard>
          </div>

          {/* Row 2: stat tiles */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Sunlit time" value={fmtHours(stats.sunlitHours)} hint={`${stats.sunlitPct.toFixed(1)}% of the window`} tone="sun" icon={<IconSun />} />
              <StatTile label="Darkness" value={fmtHours(stats.darkHours)} hint={`${(100 - stats.sunlitPct).toFixed(1)}% of the window`} tone="neutral" icon={<IconMoon />} />
              <StatTile label="Longest night" value={fmtHours(stats.longestDarkH)} hint="Max continuous darkness · sizes the battery" tone="violet" icon={<IconBattery />} />
              <StatTile label="Earth contact windows" value={stats.commWindows.length} unit="windows" hint={`${fmtHours(stats.earthHours)} total · longest gap ${fmtHours(stats.longestCommsGapH)}`} tone="earth" icon={<IconEarth />} />
              <StatTile label="Earth visibility" value={`${stats.earthPct.toFixed(1)}%`} hint={`Max Earth elevation ${stats.maxEarthEl.toFixed(1)}°`} tone="comms" icon={<IconSignal />} />
              <StatTile label="Max Sun elevation" value={`${stats.maxSunEl.toFixed(2)}°`} hint={`Peak irradiance ${stats.peakIrr.toFixed(0)} W/m²`} tone="sun" icon={<IconTarget />} />
            </div>
          )}

          {/* Row 3: timeline strip + scrubber */}
          {stats && cursor && (
            <GlassCard className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="label-caps">Illumination & comms timeline</div>
                  <div className="font-display text-base font-semibold text-ink">One lunar day at a glance</div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn-ghost !px-3" data-active={playing} onClick={() => setPlaying((p) => !p)}>
                    {playing ? <IconPause /> : <IconPlay />} {playing ? 'Pause' : 'Play'}
                  </button>
                  <div className="glass-strong flex items-center gap-3 px-3 py-1.5 font-mono text-[11px]">
                    <span className="text-accent">{fmtUtc(cursor.t)}</span>
                    <span className="text-ink-muted">D+{cursor.day.toFixed(2)}</span>
                    <span className="hidden items-center gap-1 text-sun-bright sm:flex"><IconSun className="h-3 w-3" /> {cursor.sunEl.toFixed(2)}°</span>
                    <span className={`hidden items-center gap-1 sm:flex ${cursor.earthVisible ? 'text-earth-bright' : 'text-danger'}`}><IconEarth className="h-3 w-3" /> {cursor.earthEl.toFixed(2)}°</span>
                  </div>
                </div>
              </div>
              <VisibilityStrip stats={stats} cursorDay={cursor.day} onScrub={setDay} spanDays={spanDays} />
            </GlassCard>
          )}

          {/* Row 4: charts */}
          {rows.length > 0 && (
            <>
              <GlassCard className="p-5">
                <SunElevationChart rows={rows} spanDays={spanDays} darkRuns={stats.darkRuns} cursorDay={cursor?.day} onHoverDay={setDay} height={isMobile ? 200 : 240} />
              </GlassCard>
              <div className="grid gap-4 lg:grid-cols-2">
                <GlassCard className="p-5">
                  <EarthElevationChart rows={rows} spanDays={spanDays} commGaps={stats.commGaps} cursorDay={cursor?.day} onHoverDay={setDay} height={isMobile ? 190 : 220} />
                </GlassCard>
                <GlassCard className="p-5">
                  <IrradianceChart rows={rows} spanDays={spanDays} cursorDay={cursor?.day} onHoverDay={setDay} height={isMobile ? 190 : 220} />
                </GlassCard>
              </div>
            </>
          )}

          {/* Row 5: sky view + battery + comm windows */}
          {stats && cursor && (
            <div className="grid gap-4 lg:grid-cols-12">
              <GlassCard className="relative overflow-hidden lg:col-span-7">
                <div className="h-[380px] md:h-[440px]">
                  <SkyDome sunAz={cursor.sunAz} sunEl={cursor.sunEl} sunFrac={cursor.sunFrac} earthAz={cursor.earthAz} earthEl={cursor.earthEl} earthVisible={cursor.earthVisible} lookAt={skyLook} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-4">
                  <div>
                    <div className="label-caps">Local sky · {siteName}</div>
                    <div className="font-display text-sm font-semibold text-ink">What the lander sees right now</div>
                    <div className="text-[11px] text-ink-muted">Sun and Earth placed from the ephemeris at the cursor time. Drag to look around.</div>
                  </div>
                  <div className="pointer-events-auto flex gap-1">
                    <button type="button" className="btn-ghost !px-2.5 !py-1 !text-xs" onClick={() => setSkyLook({ az: cursor.earthAz, key: Math.random() })}><IconEarth className="h-3.5 w-3.5" /> Earth</button>
                    <button type="button" className="btn-ghost !px-2.5 !py-1 !text-xs" onClick={() => setSkyLook({ az: cursor.sunAz, key: Math.random() })}><IconSun className="h-3.5 w-3.5" /> Sun</button>
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-2 p-4">
                  <Pill tone={cursor.sunFrac > 0.5 ? 'sun' : 'neutral'}>{cursor.sunFrac > 0.5 ? 'Daylight' : cursor.sunFrac > 0 ? 'Grazing twilight' : 'Night'}</Pill>
                  <Pill tone={cursor.earthVisible ? 'comms' : 'danger'}>{cursor.earthVisible ? 'DTE link available' : 'DTE link blocked'}</Pill>
                  <Pill tone="neutral">{cursor.irr.toFixed(0)} W/m²</Pill>
                </div>
              </GlassCard>

              <div className="grid gap-4 lg:col-span-5">
                <GlassCard className="relative overflow-hidden p-5">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet/10 blur-3xl" />
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="label-caps">Battery requirement</div>
                      <div className="font-display text-base font-semibold text-ink">Survive the longest night</div>
                    </div>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet/15 text-violet"><IconBattery className="h-5 w-5" /></span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <motion.div key={battery} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="num text-4xl font-semibold text-violet md:text-5xl">{fmtWh(battery)}</motion.div>
                    <div className="num text-xs text-ink-muted">({battery != null ? Math.round(battery).toLocaleString() : '—'} Wh)</div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-void/50 px-2 py-2"><div className="label-caps">Load</div><div className="num text-sm text-ink">{loadW} W</div></div>
                    <div className="rounded-lg bg-void/50 px-2 py-2"><div className="label-caps">Night</div><div className="num text-sm text-ink">{longestDark?.toFixed(0)} h</div></div>
                    <div className="rounded-lg bg-void/50 px-2 py-2"><div className="label-caps">DoD</div><div className="num text-sm text-ink">{Math.round(DEPTH_OF_DISCHARGE * 100)}%</div></div>
                  </div>
                  <div className="mt-3 font-mono text-[10px] leading-relaxed text-ink-muted">
                    capacity = load × longest_night ÷ depth_of_discharge
                    {backendBattery != null && <span className="block">backend reference at 100 W: {Math.round(backendBattery).toLocaleString()} Wh</span>}
                  </div>
                  <div className="mt-3 text-[11px] leading-snug text-ink-dim">
                    {longestDark > 300
                      ? 'A multi-week night. Chemical batteries alone become impractical at this scale — planners pair them with radioisotope heaters or site selection that shortens the night.'
                      : longestDark > 100
                        ? 'Several days of darkness. Feasible with a large lithium-ion pack plus aggressive load shedding during the night.'
                        : 'Short nights keep the pack modest; a rim site with near-continuous light is doing most of the work here.'}
                  </div>
                </GlassCard>

                <GlassCard className="p-5">
                  <div className="label-caps">Earth contact windows</div>
                  <div className="font-display text-base font-semibold text-ink">{stats.commWindows.length} window{stats.commWindows.length === 1 ? '' : 's'} · {fmtHours(stats.earthHours)} total</div>
                  <ul className="mt-3 max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                    {stats.commWindows.length === 0 && <li className="text-xs text-ink-muted">Earth never rises above the local horizon in this window — a relay is mandatory.</li>}
                    {stats.commWindows.slice(0, 40).map((w, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => setCursorIdx(w.start)} className="flex w-full items-center justify-between rounded-lg bg-void/40 px-3 py-1.5 text-left font-mono text-[11px] transition hover:bg-earth/10">
                          <span className="text-ink-dim">{fmtUtc(w.startUtc)} → {fmtUtc(w.endUtc).slice(5)}</span>
                          <span className="text-earth-bright">{fmtHours(w.hours)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </div>
            </div>
          )}

          {/* Row 6: educator */}
          <AnimatePresence>
            {educator && data && (
              <motion.div key="edu" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                <EducatorPanel data={data} stats={stats} cursor={cursor} siteName={siteName} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <LoadingOverlay
        show={loading && !data}
        title="Computing site timeline"
        note={`${fmtLat(site.lat, 2)}, ${fmtLon(site.lon, 2)} · ${params.days} days @ ${params.stepMin} min`}
        steps={['Querying JPL Horizons for Sun & Earth vectors', 'Transforming to the local horizon frame', 'Applying solar-disk occultation', 'Integrating irradiance & battery sizing']}
      />
      {loading && data && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <div className="glass-strong flex items-center gap-3 px-4 py-2 font-mono text-[11px] text-ink-dim">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sun-bright" /> Re-running ephemeris…
          </div>
        </div>
      )}
    </motion.main>
  )
}
