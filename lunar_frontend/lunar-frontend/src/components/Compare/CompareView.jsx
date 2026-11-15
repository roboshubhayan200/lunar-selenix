import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import MoonGlobe from '../Globe/MoonGlobe.jsx'
import ResultCards, { rankColor } from './ResultCards.jsx'
import { fmtValue } from './BreakdownChart.jsx'
import LoadingOverlay, { useElapsed } from '../Common/LoadingOverlay.jsx'
import { useToast } from '../Common/Toast.jsx'
import { pageVariants, fadeUp, stagger, GlassCard, Pill, IconBack, IconCompare, Spinner } from '../ui/index.jsx'
import { api, CRITERIA, validateStepMin } from '../../api/client.js'
import { useWeightProfiles, useMediaQuery } from '../../lib/hooks.js'
import { fmtDeg, latLonToVector3 } from '../../lib/lunar.js'

const SECONDS_PER_SITE = 10 // rough backend cost per site, used only for the progress estimate
const NEUTRAL = '#9085e9'
const PROFILE_LABELS = { solar_rover: 'Solar rover', relay_station: 'Relay station', crewed_habitat: 'Crewed habitat' }
const DURATIONS = [
  { label: '14 days', value: 14 },
  { label: '1 lunar day (29.53 d)', value: 29.53 },
  { label: '2 lunar days (59.06 d)', value: 59.06 },
]

function sumOf(w) { return Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0) }
/** fraction weights (API) -> percentages for the UI, every criterion present */
function toPct(w) { return Object.fromEntries(CRITERIA.map((c) => [c.key, Math.round((Number(w[c.key]) || 0) * 1000) / 10])) }
/** Scale percentages so they total exactly 100 (1-decimal steps, remainder on the largest). */
function rebalance(p) {
  const s = sumOf(p)
  if (!(s > 0)) return p
  const out = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round(((Number(v) || 0) / s) * 1000) / 10]))
  const diff = Math.round((100 - sumOf(out)) * 10) / 10
  if (diff) { const top = Object.keys(out).reduce((a, b) => (out[a] >= out[b] ? a : b)); out[top] = Math.round((out[top] + diff) * 10) / 10 }
  return out
}

function ComparisonTable({ ranked, weights }) {
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank)
  const keys = CRITERIA.filter((c) => sorted.some((r) => r.breakdown[c.key]))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">
            <th className="sticky left-0 z-10 bg-space-900/95 px-4 py-3 font-medium">Criterion</th>
            {sorted.map((r) => (
              <th key={r.name} className="px-3 py-3 font-medium">
                <span className="flex items-center gap-2 normal-case tracking-normal">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-void" style={{ background: rankColor(r.rank, sorted.length) }}>{r.rank}</span>
                  <span className="font-display text-xs font-semibold text-ink">{r.name}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t hairline bg-white/[0.02]">
            <td className="sticky left-0 z-10 bg-space-900/95 px-4 py-2.5 font-display font-semibold text-ink">Total score</td>
            {sorted.map((r) => <td key={r.name} className="num px-3 py-2.5 text-sm font-semibold text-ink" title={String(r.total_score)}>{Number(r.total_score).toFixed(2)}</td>)}
          </tr>
          {keys.map((c) => (
            <tr key={c.key} className="border-t hairline hover:bg-white/[0.03]">
              <td className="sticky left-0 z-10 bg-space-900/95 px-4 py-2.5">
                <div className="font-display text-xs font-medium text-ink">{c.label} <span className="text-ink-muted">{c.higherIsBetter ? '↑' : '↓'}</span></div>
                <div className="num text-[9px] text-ink-muted">weight {((weights[c.key] ?? sorted[0].breakdown[c.key]?.weight ?? 0) * 100).toFixed(1)}%</div>
              </td>
              {sorted.map((r) => {
                const b = r.breakdown[c.key]
                if (!b) return <td key={r.name} className="px-3 py-2.5 text-ink-muted">—</td>
                return (
                  <td key={r.name} className="px-3 py-2.5" title={`value ${b.value} · score ${b.score} · weight ${b.weight}`}>
                    <div className="num text-ink">{fmtValue(c.key, b.value)}</div>
                    <div className="num text-[10px] text-ink-muted">score {Number(b.score).toFixed(1)} · +{b.contribution.toFixed(2)}</div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CompareView({ presets, currentSite, backendOk, onBack, onAnalyze }) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const toast = useToast()
  const { profiles, defaults, loading: profilesLoading, error: profilesError } = useWeightProfiles(backendOk)

  const candidates = useMemo(() => {
    const list = presets.sites.map((p) => ({ id: p.name, name: p.name, lat: p.lat_deg, lon: p.lon_deg, height_m: p.height_m ?? 2.0 }))
    if (currentSite && !(currentSite.source === 'preset' && list.some((c) => c.name === currentSite.name))) {
      list.unshift({ id: '__current', name: currentSite.name || 'Selected site', lat: currentSite.lat, lon: currentSite.lon, height_m: currentSite.height_m ?? 2.0, custom: true })
    }
    return list
  }, [presets.sites, currentSite])

  const [selectedState, setSelected] = useState(null)
  const defaultSelection = useMemo(() => {
    const init = candidates[0]?.custom ? [candidates[0].id] : []
    for (const c of candidates) if (!c.custom && init.length < 4) init.push(c.id)
    return init
  }, [candidates])
  const selected = selectedState ?? defaultSelection
  const chosen = useMemo(() => selected.map((id) => candidates.find((c) => c.id === id)).filter(Boolean), [selected, candidates])

  const [pctState, setPct] = useState(null)
  const pct = pctState ?? toPct(defaults)
  const [profile, setProfile] = useState('default')
  const [days, setDays] = useState(29.53)
  const [stepMin, setStepMin] = useState('60')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [focusSite, setFocusSite] = useState(null)
  const [runCount, setRunCount] = useState(0)
  const ctrlRef = useRef()
  const elapsed = useElapsed(loading)

  const stepErr = validateStepMin(stepMin)
  const pSum = Math.round(sumOf(pct) * 10) / 10
  const weightsLoaded = Object.keys(defaults).length > 0 || pctState != null
  const weightErr = !weightsLoaded ? 'Weights not loaded yet.' : Math.abs(pSum - 100) > 0.05 ? `Weights must sum to 100% (currently ${pSum.toFixed(1)}%).` : null

  const toggle = (id) => setSelected((prev) => {
    const s = prev ?? defaultSelection
    return s.includes(id) ? s.filter((x) => x !== id) : s.length >= 20 ? s : [...s, id]
  })

  const applyProfile = (key) => {
    setProfile(key)
    setPct(toPct(key === 'default' ? defaults : profiles[key]))
  }

  const run = useCallback(async () => {
    if (chosen.length < 2 || stepErr || weightErr) return
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setLoading(true); setError(null); setResult(null)
    setRunCount((n) => n + 1)
    try {
      const r = await api.compare({
        sites: chosen.map((c) => ({ name: c.name, lat_deg: c.lat, lon_deg: c.lon, height_m: c.height_m })),
        days,
        step_min: Number(stepMin),
        // percentages -> fractions summing to 1.0 (UI enforces Σ = 100%)
        weights: Object.fromEntries(Object.entries(pct).map(([k, v]) => [k, Number(v) / 100])),
      }, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      setResult(r)
    } catch (e) {
      if (e.cancelled || ctrl.signal.aborted) return
      setError(e.message)
      toast.error(e, 'Comparison failed')
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [chosen, days, stepMin, pct, stepErr, weightErr, toast])

  useEffect(() => () => ctrlRef.current?.abort(), [])

  const total = chosen.length
  const progress = loading ? {
    current: Math.min(total, Math.floor(elapsed / SECONDS_PER_SITE) + 1),
    total,
    fraction: Math.min(0.95, elapsed / (SECONDS_PER_SITE * total)),
    estimated: true,
  } : null

  const ranked = result?.ranked || []
  const rankByName = Object.fromEntries(ranked.map((r) => [r.name, r.rank]))
  const markers = chosen.map((c) => {
    const rank = rankByName[c.name]
    return { lat: c.lat, lon: c.lon, name: c.name, rank: rank ?? null, color: rank ? rankColor(rank, ranked.length) : NEUTRAL }
  })

  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" exit="exit" className="relative min-h-screen px-4 pb-16 pt-20 md:px-6 md:pt-24">
      <div className="mx-auto max-w-[1440px]">
        <motion.div variants={stagger(0.05, 0)} initial="hidden" animate="show" className="mb-5">
          <motion.button variants={fadeUp} type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent">
            <IconBack className="h-3.5 w-3.5" /> Back to Moon
          </motion.button>
          <motion.h1 variants={fadeUp} className="font-display text-2xl font-semibold tracking-tight text-ink md:text-4xl">Compare candidate sites</motion.h1>
          <motion.p variants={fadeUp} className="mt-1 max-w-2xl text-sm text-ink-dim">Rank sites on sunlight, night length, Earth visibility, comms gaps, energy and terrain horizon, weighted for your mission. Scores are relative to the sites you pick: the best scores 100 and the worst 0.</motion.p>
        </motion.div>

        <motion.div variants={stagger(0.06, 0.1)} initial="hidden" animate="show" className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Sites */}
            <GlassCard className="p-5 lg:col-span-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="label-caps">Step 1</div>
                  <div className="font-display text-base font-semibold text-ink">Pick sites <span className="num text-xs text-ink-muted">({chosen.length} selected)</span></div>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="chip" onClick={() => setSelected(candidates.filter((c) => Math.abs(c.lat) >= 84).map((c) => c.id))}>South-pole set</button>
                  <button type="button" className="chip" onClick={() => setSelected([])}>Clear</button>
                </div>
              </div>
              {presets.loading && <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted"><Spinner className="h-4 w-4" /> Loading presets…</div>}
              {presets.error && <div className="mt-3 text-xs text-danger">Could not load presets: {presets.error}</div>}
              <ul className="mt-3 grid max-h-[420px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {candidates.map((c) => {
                  const on = selected.includes(c.id)
                  const m = markers.find((x) => x.name === c.name)
                  const color = on ? m?.color ?? NEUTRAL : undefined
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => toggle(c.id)} onMouseEnter={() => setFocusSite(c)} className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition ${on ? 'bg-white/[0.06] ring-1' : 'hover:bg-white/5'}`} style={on ? { '--tw-ring-color': `${color}88` } : undefined}>
                        <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-transparent' : 'border-ink-muted/50'}`} style={on ? { background: color } : undefined}>
                          {on && <svg viewBox="0 0 12 12" className="h-3 w-3 text-void"><path d="M2 6l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className={`truncate font-display text-sm font-medium ${on ? 'text-ink' : 'text-ink-dim'}`}>{c.name}</span>
                            {c.custom && <Pill tone="accent">yours</Pill>}
                          </span>
                          <span className="num block text-[10px] text-ink-muted">lat {fmtDeg(c.lat)} · lon {fmtDeg(c.lon)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </GlassCard>

            {/* Weights */}
            <GlassCard className="p-5 lg:col-span-7">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="label-caps">Step 2</div>
                  <div className="font-display text-base font-semibold text-ink">Mission weights</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="chip" data-active={profile === 'default'} onClick={() => applyProfile('default')} disabled={profilesLoading}>Balanced</button>
                  {Object.keys(profiles).map((k) => (
                    <button key={k} type="button" className="chip" data-active={profile === k} onClick={() => applyProfile(k)}>{PROFILE_LABELS[k] || k}</button>
                  ))}
                </div>
              </div>
              {profilesLoading && <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted"><Spinner className="h-4 w-4" /> Loading default weights from /api/weight-profiles…</div>}
              {profilesError && <div className="mt-3 text-xs text-danger">Could not load weight profiles: {profilesError}</div>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {CRITERIA.map((c) => (
                  <span key={c.key} className="rounded-full border hairline px-2.5 py-0.5 font-mono text-[10px] text-ink-dim" title={`weights.${c.key}: ${(Number(pct[c.key]) || 0) / 100}`}>
                    {c.label} <span className="text-accent">{(Number(pct[c.key]) || 0).toFixed(1).replace(/.0$/, '')}%</span>
                  </span>
                ))}
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {CRITERIA.map((c) => {
                  const v = Number(pct[c.key] ?? 0)
                  return (
                    <div key={c.key}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <label htmlFor={`w-${c.key}`} className="text-ink-dim">{c.label} <span className="text-ink-muted">{c.higherIsBetter ? '↑' : '↓'}</span></label>
                        <span className="flex items-center gap-1">
                          <input id={`w-${c.key}`} type="number" min={0} max={100} step={0.5} value={pct[c.key] ?? 0} onChange={(e) => { setProfile('custom'); setPct({ ...pct, [c.key]: e.target.value === '' ? 0 : Math.max(0, Math.min(100, Number(e.target.value))) }) }} className="field !w-[4.5rem] !px-2 !py-0.5 text-right font-mono !text-xs" />
                          <span className="font-mono text-[11px] text-ink-muted">%</span>
                        </span>
                      </div>
                      <input type="range" min={0} max={100} step={0.5} value={v} className="range mt-1" style={{ '--fill': `${v}%` }} onChange={(e) => { setProfile('custom'); setPct({ ...pct, [c.key]: Number(e.target.value) }) }} aria-label={`${c.label} weight percent`} />
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-void/50 px-3 py-2 text-xs">
                <span className={`num ${Math.abs(pSum - 100) <= 0.05 ? 'text-comms-bright' : 'text-danger'}`}>Σ = {pSum.toFixed(1)}%{Math.abs(pSum - 100) <= 0.05 ? ' ✓' : ' · must equal 100%'}</span>
                <button type="button" className="chip" onClick={() => setPct(rebalance(pct))} disabled={!(pSum > 0)}>Rebalance to 100%</button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="label-caps">Duration</span>
                  <select className="field mt-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="label-caps">Step (whole minutes)</span>
                  <input type="number" min={1} max={1440} step={1} inputMode="numeric" className={`field mt-1 ${stepErr ? '!border-danger' : ''}`} value={stepMin} onChange={(e) => setStepMin(e.target.value)} aria-invalid={!!stepErr} />
                </label>
              </div>
              {(stepErr || weightErr) && <div className="mt-2 text-[11px] text-danger">{stepErr || weightErr}</div>}

              <button type="button" className="btn-primary mt-4 w-full" onClick={run} disabled={chosen.length < 2 || loading || !!stepErr || !!weightErr || backendOk === false}>
                {loading ? <Spinner className="h-4 w-4 !text-void" /> : <IconCompare />} {loading ? 'Running ephemerides…' : `Rank ${chosen.length} site${chosen.length === 1 ? '' : 's'}`}
              </button>
              {chosen.length < 2 && <div className="mt-2 text-center text-[11px] text-ink-muted">Select at least two sites.</div>}
              {backendOk === false && <div className="mt-2 text-center text-[11px] text-danger">Backend offline. Start the Flask API on port 5000.</div>}
            </GlassCard>
          </div>

          {/* Candidate map */}
          <GlassCard className="relative overflow-hidden">
            <div className="h-[300px] md:h-[380px]">
              <MoonGlobe
                markers={markers}
                interactive
                autoRotate={false}
                showLabels={!isMobile}
                stars={false}
                quality="low"
                cameraPosition={latLonToVector3(-70, -20, 2.6).toArray()}
                focus={focusSite ? { lat: focusSite.lat, lon: focusSite.lon, distance: Math.abs(focusSite.lat) > 80 ? 1.9 : 2.4, key: focusSite.id } : null}
              />
            </div>
            <div className="pointer-events-none absolute left-4 top-4">
              <div className="label-caps">Candidate map</div>
              <div className="text-xs text-ink-dim">{ranked.length ? 'Pins coloured by rank' : 'Hover a site to fly there'}</div>
            </div>
            {ranked.length > 0 && (
              <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-void/60 px-3 py-1.5 font-mono text-[10px] text-ink-dim backdrop-blur">
                <span>#1</span><span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg,#22b58a,#f2b134,#e66767)' }} /><span>#{ranked.length}</span>
              </div>
            )}
          </GlassCard>

          <LoadingOverlay variant="inline" show={loading} title={`Ranking ${total} sites`} message="Fetching ephemeris from JPL Horizons..." progress={progress} elapsed={elapsed} />

          {error && !loading && (
            <div className="glass flex items-center justify-between gap-3 border-danger/40 p-4 text-sm">
              <span className="text-danger">{error}</span>
              <button type="button" className="btn-ghost" onClick={run}>Retry</button>
            </div>
          )}

          <AnimatePresence>
            {result && ranked.length > 0 && !loading && (
              <motion.section key={runCount} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="label-caps">Results · /api/compare</div>
                    <div className="font-display text-lg font-semibold text-ink">Ranking</div>
                  </div>
                  {result.metadata?.start_utc && <div className="num text-[10px] text-ink-muted">window {String(result.metadata.start_utc).slice(0, 10)} · {result.metadata.days} d @ {result.metadata.step_min} min</div>}
                </div>
                <ResultCards ranked={ranked} onAnalyze={(r) => onAnalyze({ lat: r.lat_deg, lon: r.lon_deg, height_m: chosen.find((c) => c.name === r.name)?.height_m ?? 2.0, name: r.name, source: presets.sites.some((p) => p.name === r.name) ? 'preset' : 'click' })} />
                <GlassCard className="overflow-hidden">
                  <div className="border-b hairline px-5 py-4">
                    <div className="label-caps">Detailed comparison</div>
                    <div className="font-display text-base font-semibold text-ink">All criteria side by side: raw value, normalised score and weighted points</div>
                  </div>
                  <ComparisonTable ranked={ranked} weights={result.weights || {}} />
                </GlassCard>
              </motion.section>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.main>
  )
}
