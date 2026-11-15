import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SurfaceViewport from '../components/Analysis/SurfaceViewport.jsx'
import SummaryGrid from '../components/Dashboard/SummaryGrid.jsx'
import TimelineChart from '../components/Dashboard/TimelineChart.jsx'
import BatteryCard from '../components/Dashboard/BatteryCard.jsx'
import EducatorPanel, { IconGradCap } from '../components/Dashboard/EducatorPanel.jsx'
import TimeScrubber from '../components/Globe/TimeScrubber.jsx'
import StatusStrip from '../components/Common/StatusStrip.jsx'
import LoadingOverlay from '../components/Common/LoadingOverlay.jsx'
import { useToast } from '../components/Common/Toast.jsx'
import { pageVariants, Toggle, IconBack } from '../components/ui/index.jsx'
import { validateDays, validateHeight, validateLatLon, validateStepMin } from '../api/client.js'
import { DEFAULT_WINDOW, useTimelineCache } from '../lib/timelineCache.jsx'
import { downloadText, fileStamp, seriesToCsv } from '../lib/ops.js'

const DURATIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '1 lunar day · 29.53 d', value: 29.53 },
  { label: '2 lunar days · 59.06 d', value: 59.06 },
]
const STEPS = [10, 15, 30, 60, 120, 180]

const section = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } } }

function Section({ n, title, subtitle, right, children }) {
  return (
    <motion.section variants={section} className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label-caps">Section {n}</div>
          <h2 className="font-display text-xl font-semibold text-ink md:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </motion.section>
  )
}

export default function AnalysisView({ presets, backendOk }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { get: cacheGet, fetchTimeline } = useTimelineCache()

  // Site exactly as given in the URL — these numbers are what gets sent.
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const height = params.has('height') ? Number(params.get('height')) : 2.0
  const urlErr = !params.has('lat') || !params.has('lon') ? 'The URL needs ?lat=…&lon=…' : validateLatLon(lat, lon) || validateHeight(height)

  const preset = presets.sites.find((p) => p.lat_deg === lat && p.lon_deg === lon)
  const name = preset?.name || params.get('name') || 'Custom Site'

  const [win, setWin] = useState(DEFAULT_WINDOW)
  const body = useMemo(() => ({ lat_deg: lat, lon_deg: lon, height_m: height, ...win }), [lat, lon, height, win])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [idx, setIdx] = useState(0)
  const [educator, setEducator] = useState(false)
  const ctrl = useRef()
  // The session cache is the source of truth: re-renders when a fetch lands.
  const data = urlErr ? null : cacheGet(body)

  const run = useCallback(async (b) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setLoading(true)
    setError(null)
    setIdx(0)
    try {
      await fetchTimeline(b, { signal: c.signal }) // result lands in the cache -> re-render
    } catch (e) {
      if (e.cancelled || c.signal.aborted) return
      setError(e.message)
      toast.error(e, 'Timeline failed')
    } finally {
      if (!c.signal.aborted) setLoading(false)
    }
  }, [fetchTimeline, toast, setIdx])

  useEffect(() => {
    if (urlErr) return
    if (cacheGet(body)) return
    run(body)
    return () => ctrl.current?.abort()
  }, [body, urlErr, run, cacheGet])

  const exportCsv = () => downloadText(`selenix_${fileStamp(data.request)}.csv`, seriesToCsv(data, name), 'text/csv')
  const exportJson = () => downloadText(`selenix_${fileStamp(data.request)}.json`, JSON.stringify({ request: data.request, response: data.raw }, null, 2), 'application/json')

  const darkHr = data?.summary.find((s) => s.key === 'max_continuous_dark_hr')?.value
  const shown = data && !loading

  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" exit="exit" className="relative min-h-screen px-4 pb-6 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto max-w-[1280px]">
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <button type="button" onClick={() => navigate('/')} className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent">
              <IconBack className="h-4 w-4" /> Back to Globe
            </button>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-5xl">{name}</h1>
            {preset?.description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">{preset.description}</p>}
            {!urlErr && (
              <div className="mt-4 flex flex-wrap gap-3">
                {[['lat_deg', `${lat.toFixed(2)}°`], ['lon_deg', `${lon.toFixed(2)}°`], ['height_m', `${height} m`]].map(([k, v]) => (
                  <div key={k} className="rounded-xl border hairline bg-void/50 px-4 py-2">
                    <div className="label-caps !text-[0.58rem]">{k}</div>
                    <div className="num text-lg font-semibold text-ink">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!urlErr && (
            <div className="glass grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:items-end">
              <label className="block">
                <span className="label-caps !text-[0.58rem]">Start (UTC)</span>
                <input type="date" className="field mt-1 !py-1.5 !text-xs" value={win.start_utc} onChange={(e) => e.target.value && setWin((w) => ({ ...w, start_utc: e.target.value }))} />
              </label>
              <label className="block">
                <span className="label-caps !text-[0.58rem]">Duration</span>
                <select className="field mt-1 !py-1.5 !text-xs" value={win.days} onChange={(e) => setWin((w) => ({ ...w, days: Number(e.target.value) }))}>
                  {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label-caps !text-[0.58rem]">Step (min)</span>
                <select className="field mt-1 !py-1.5 !text-xs" value={win.step_min} onChange={(e) => { const v = Number(e.target.value); if (!validateStepMin(v)) setWin((w) => ({ ...w, step_min: v })) }}>
                  {STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <button type="button" className="btn-primary !py-2 !text-xs" disabled={loading || backendOk === false || !!validateDays(win.days)} onClick={() => run(body)}>
                {loading ? 'Running…' : 'Re-run'}
              </button>
            </div>
          )}
        </header>

        {urlErr && (
          <div className="glass border-danger/40 p-6 text-sm text-danger">Invalid site in URL: {urlErr} <button type="button" className="btn-ghost ml-3" onClick={() => navigate('/')}>Back to Globe</button></div>
        )}
        {backendOk === false && <div className="glass mb-6 border-danger/40 p-4 text-sm text-danger">Backend offline. Start the Flask API on port 5000.</div>}

        <LoadingOverlay variant="inline" show={loading} title="Computing site timeline" message="Fetching ephemeris from JPL Horizons..." steps={['Sun & Earth vectors from Horizons', 'Local horizon transform', 'Solar-disk visibility & irradiance', 'Summary statistics & battery sizing']} />
        {error && !loading && (
          <div className="glass mb-6 flex items-center justify-between gap-3 border-danger/40 p-4 text-sm">
            <span className="text-danger">{error}</span>
            <button type="button" className="btn-ghost" onClick={() => run(body)}>Retry</button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {shown && (
            <motion.div key={`${data.request.start_utc}|${data.request.days}|${data.request.step_min}`} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }} initial="hidden" animate="show" className="space-y-14">
              <Section n={1} title="Live surface view" subtitle="The sky from the lander at the scrubber time. The Sun and Earth sit at their real azimuth and elevation from the series. Press ▶ in the time scrubber to play the lunar day.">
                <SurfaceViewport series={data.series} index={idx} />
              </Section>

              <Section n={2} title="Summary" subtitle={`/api/timeline summary · ${data.series.t_utc[0]} → ${data.series.t_utc[data.series.t_utc.length - 1]}`}>
                <SummaryGrid summary={data.summary} roomy />
              </Section>

              <Section n={3} title="Timeline" subtitle="Every API sample plotted. Hover any chart for exact values; the cyan line is the scrubber time.">
                <TimelineChart series={data.series} height={230} cursorIdx={idx} />
              </Section>

              <Section n={4} title="Operational status" subtitle="One cell per timestep. Click to move the scrubber.">
                <div className="glass p-5">
                  <StatusStrip series={data.series} stepMin={data.request.step_min} theme="dark" cursor={idx} onSelect={setIdx} height={36} />
                </div>
              </Section>

              <Section n={5} title="Battery sizing">
                <BatteryCard wh={data.battery_required_wh} darkHr={darkHr} />
              </Section>

              <Section n={6} title="Educator mode" right={<Toggle checked={educator} onChange={setEducator} label={<span className="flex items-center gap-1.5"><IconGradCap className="h-4 w-4 text-violet" />Show the physics</span>} />}>
                <AnimatePresence initial={false}>
                  {educator ? <EducatorPanel key="edu" notes={data.physics_notes} /> : <motion.p key="off" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-ink-muted">Turn on to read the backend's physics notes for this run.</motion.p>}
                </AnimatePresence>
              </Section>

              <motion.div variants={section} className="flex flex-wrap items-center gap-3 border-t hairline pt-6">
                <span className="label-caps">Raw data</span>
                <button type="button" className="btn-ghost" onClick={exportCsv}>Export CSV</button>
                <button type="button" className="btn-ghost" onClick={exportJson}>Export JSON</button>
                <span className="text-xs text-ink-muted">CSV: every sample at full precision. JSON: the request plus the untouched API response.</span>
              </motion.div>

              {/* Section 7: sticky so it controls the viewport + chart cursors from anywhere on the page */}
              <motion.div variants={section} className="sticky bottom-3 z-30">
                <TimeScrubber data={data} index={idx} onIndex={setIdx} fps={10} showSpeeds title="Section 7 · Time scrubber" className="shadow-[0_-10px_40px_rgba(4,6,13,0.8)]" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.main>
  )
}
