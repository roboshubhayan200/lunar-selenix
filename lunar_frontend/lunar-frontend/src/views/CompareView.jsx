import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import MoonGlobe from '../components/three/MoonGlobe.jsx'
import { pageVariants, fadeUp, stagger, GlassCard, Pill, LoadingOverlay, ErrorBanner, IconBack, IconArrow, IconCompare, Spinner } from '../components/ui/index.jsx'
import { api } from '../lib/api.js'
import { useWeightProfiles, useCriteria, useMediaQuery } from '../lib/hooks.js'
import { fmtLat, fmtLon, latLonToVector3, normalizeLon } from '../lib/lunar.js'
import { fmtHours } from '../lib/analysis.js'

// Validated dark-surface categorical order (see dataviz palette): amber, blue, aqua, violet, then neutrals.
const SITE_COLORS = ['#c98500', '#3987e5', '#199e70', '#9085e9', '#d55181', '#e66767', '#6da7ec', '#a7b4d3', '#22b58a', '#f2b134']

const PROFILE_LABELS = {
  default: { label: 'Balanced (default)', blurb: 'Even emphasis on power, night length and comms.' },
  solar_rover: { label: 'Solar rover', blurb: 'Maximise sunlight and energy; nights are the enemy.' },
  relay_station: { label: 'Relay station', blurb: 'Earth line-of-sight and short comms gaps dominate.' },
  crewed_habitat: { label: 'Crewed habitat', blurb: 'Balanced, with extra weight on comms reliability.' },
}

const DURATIONS = [
  { label: '14 days', value: 14 },
  { label: '1 lunar day (29.53 d)', value: 29.53 },
  { label: '2 lunar days (59.06 d)', value: 59.06 },
]

function fmtRaw(key, v) {
  if (v == null) return '—'
  if (key.endsWith('_pct')) return `${v.toFixed(1)}%`
  if (key.endsWith('_h')) return fmtHours(v, { compact: true })
  if (key === 'max_sun_el' || key.startsWith('terrain')) return `${v.toFixed(2)}°`
  if (key.startsWith('energy')) return `${v.toFixed(0)} kWh/m²`
  return v.toFixed(2)
}

function scoreColor(s) {
  // single-hue sequential (blue ramp) for 0–100 scores
  const steps = ['#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4']
  const i = Math.min(9, Math.max(0, Math.floor(s / 10.0001)))
  return steps[i]
}

export default function CompareView({ presets, currentSite, autoRun = false, onBack, onAnalyze }) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const { profiles, defaults, loading: profilesLoading } = useWeightProfiles()
  const { criteria } = useCriteria()

  const candidates = useMemo(() => {
    const list = presets.sites.map((p) => ({ id: p.name, name: p.name, lat: p.lat_deg, lon: normalizeLon(p.lon_deg), description: p.description }))
    if (currentSite) {
      const dup = list.find((s) => Math.abs(s.lat - currentSite.lat) < 0.05 && Math.abs(normalizeLon(s.lon - currentSite.lon)) < 0.05)
      if (!dup) list.unshift({ id: '__current', name: currentSite.name || 'Selected site', lat: currentSite.lat, lon: normalizeLon(currentSite.lon), description: 'Your marker from the globe.', custom: true })
    }
    return list
  }, [presets.sites, currentSite])

  const [selectedState, setSelected] = useState(null)
  const defaultSelection = useMemo(() => {
    const init = []
    if (candidates[0]?.custom) init.push(candidates[0].id)
    for (const c of candidates) { if (!c.custom && init.length < 4) init.push(c.id) }
    return init
  }, [candidates])
  const selected = selectedState ?? defaultSelection
  const [profile, setProfile] = useState('default')
  const [days, setDays] = useState(29.53)
  const [stepMin, setStepMin] = useState(60)
  const [startUtc, setStartUtc] = useState('2027-06-01')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [focusSite, setFocusSite] = useState(null)
  const abortRef = useRef()

  const toggle = (id) => setSelected((prev) => {
    const s = prev ?? defaultSelection
    return s.includes(id) ? s.filter((x) => x !== id) : s.length >= 10 ? s : [...s, id]
  })

  const chosen = useMemo(() => selected.map((id) => candidates.find((c) => c.id === id)).filter(Boolean), [selected, candidates])
  const colorOf = useMemo(() => Object.fromEntries(chosen.map((c, i) => [c.name, SITE_COLORS[i % SITE_COLORS.length]])), [chosen])

  const run = useCallback(async () => {
    if (chosen.length < 2) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setError(null)
    try {
      const body = {
        sites: chosen.map((c) => ({ name: c.name, lat_deg: c.lat, lon_deg: c.lon, height_m: 2.0 })),
        start_utc: startUtc, days, step_min: stepMin,
        ...(profile !== 'default' ? { weight_profile: profile } : {}),
      }
      const r = await api.compare(body, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      setResult(r)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(e.message)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [chosen, startUtc, days, stepMin, profile])

  // Abort in-flight work on a real unmount only (StrictMode re-mounts synchronously, so defer the check).
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      setTimeout(() => { if (!mounted.current) abortRef.current?.abort() }, 0)
    }
  }, [])

  // Deep link support: #/compare?run=1 ranks the default selection on load.
  const runRef = useRef(run)
  useEffect(() => { runRef.current = run }, [run])
  const autoRan = useRef(false)
  const ready = chosen.length >= 2
  useEffect(() => {
    if (!autoRun || !ready || autoRan.current) return
    autoRan.current = true
    runRef.current()
  }, [autoRun, ready])

  const ranking = useMemo(() => result?.ranking || [], [result])
  const weights = result?.metadata?.weights || (profile === 'default' ? defaults : profiles[profile]) || {}
  const critKeys = useMemo(() => {
    const fromResult = ranking[0] ? Object.keys(ranking[0]).filter((k) => k.startsWith('score_')).map((k) => k.slice(6)) : []
    return fromResult.length ? fromResult : criteria.map((c) => c.key)
  }, [ranking, criteria])
  const critLabel = (k) => criteria.find((c) => c.key === k)?.label || k
  const critDir = (k) => criteria.find((c) => c.key === k)?.higher_is_better

  const radarData = useMemo(() => critKeys.map((k) => {
    const row = { criterion: critLabel(k).replace('Energy (vertical panel)', 'Energy').replace('Terrain horizon', 'Terrain') }
    ranking.slice(0, 4).forEach((r) => { row[r.name] = r[`score_${k}`] ?? 0 })
    return row
  }), [critKeys, ranking]) // eslint-disable-line react-hooks/exhaustive-deps

  const winner = ranking[0]
  const markers = chosen.map((c) => ({ lat: c.lat, lon: c.lon, name: c.name, color: colorOf[c.name] }))

  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" exit="exit" className="relative min-h-screen px-4 pb-16 pt-20 md:px-6 md:pt-24">
      <div className="mx-auto max-w-[1440px]">
        <motion.div variants={stagger(0.05, 0)} initial="hidden" animate="show" className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <motion.div variants={fadeUp}>
            <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent">
              <IconBack className="h-3.5 w-3.5" /> Back to globe
            </button>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-4xl">Compare candidate sites</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-dim">Score up to ten sites on sunlight, night length, Earth visibility, comms gaps, energy yield and terrain horizon — weighted for the mission you have in mind.</p>
          </motion.div>
        </motion.div>

        {error && <div className="mb-4"><ErrorBanner error={error} onRetry={run} /></div>}

        <motion.div variants={stagger(0.06, 0.1)} initial="hidden" animate="show" className="grid gap-4">
          {/* Setup row */}
          <div className="grid gap-4 lg:grid-cols-12">
            <GlassCard className="p-5 lg:col-span-7">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="label-caps">Step 1</div>
                  <div className="font-display text-base font-semibold text-ink">Pick sites to compare <span className="num text-xs text-ink-muted">({chosen.length}/10)</span></div>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="chip" onClick={() => setSelected(candidates.filter((c) => Math.abs(c.lat) >= 84).map((c) => c.id).slice(0, 10))}>South-pole set</button>
                  <button type="button" className="chip" onClick={() => setSelected([])}>Clear</button>
                </div>
              </div>
              {presets.loading && <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted"><Spinner className="h-4 w-4" /> Loading presets…</div>}
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {candidates.map((c) => {
                  const on = selected.includes(c.id)
                  const color = on ? colorOf[c.name] : undefined
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => toggle(c.id)} onMouseEnter={() => setFocusSite(c)} className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition ${on ? 'border-transparent bg-white/6 ring-1' : 'border-transparent hover:bg-white/5'}`} style={on ? { '--tw-ring-color': `${color}88` } : undefined}>
                        <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-transparent' : 'border-ink-muted/50'}`} style={on ? { background: color } : undefined}>
                          {on && <svg viewBox="0 0 12 12" className="h-3 w-3 text-void"><path d="M2 6l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className={`truncate font-display text-sm font-medium ${on ? 'text-ink' : 'text-ink-dim'}`}>{c.name}</span>
                            {c.custom && <Pill tone="accent">yours</Pill>}
                          </span>
                          <span className="num block text-[10px] text-ink-muted">{fmtLat(c.lat, 2)} · {fmtLon(c.lon, 2)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </GlassCard>

            <div className="grid gap-4 lg:col-span-5">
              <GlassCard className="p-5">
                <div className="label-caps">Step 2</div>
                <div className="font-display text-base font-semibold text-ink">Mission profile & window</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {Object.keys(PROFILE_LABELS).map((k) => {
                    const available = k === 'default' || profiles[k]
                    return (
                      <button key={k} type="button" disabled={!available && !profilesLoading} onClick={() => setProfile(k)} className={`rounded-xl border p-3 text-left transition ${profile === k ? 'border-accent/60 bg-accent/10' : 'border-ink-muted/20 hover:border-ink-muted/40'} disabled:opacity-40`}>
                        <div className={`font-display text-sm font-semibold ${profile === k ? 'text-accent' : 'text-ink'}`}>{PROFILE_LABELS[k].label}</div>
                        <div className="mt-0.5 text-[11px] leading-snug text-ink-muted">{PROFILE_LABELS[k].blurb}</div>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="label-caps">Start</span>
                    <input type="date" className="field mt-1" value={startUtc} onChange={(e) => e.target.value && setStartUtc(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="label-caps">Duration</span>
                    <select className="field mt-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                      {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label-caps">Step</span>
                    <select className="field mt-1" value={stepMin} onChange={(e) => setStepMin(Number(e.target.value))}>
                      {[30, 60, 120].map((s) => <option key={s} value={s}>{s} min</option>)}
                    </select>
                  </label>
                </div>
                {Object.keys(weights).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([k, w]) => (
                      <span key={k} className="rounded-full border hairline px-2 py-0.5 font-mono text-[10px] text-ink-muted">{critLabel(k)} <span className="text-ink-dim">{Math.round(w * 100)}%</span></span>
                    ))}
                  </div>
                )}
                <button type="button" className="btn-primary mt-4 w-full" onClick={run} disabled={chosen.length < 2 || loading}>
                  {loading ? <Spinner className="h-4 w-4 !text-void" /> : <IconCompare />} {loading ? 'Running ephemerides…' : `Rank ${chosen.length} site${chosen.length === 1 ? '' : 's'}`}
                </button>
                {chosen.length < 2 && <div className="mt-2 text-center text-[11px] text-ink-muted">Select at least two sites.</div>}
                <div className="mt-2 text-center font-mono text-[10px] text-ink-muted">≈ {Math.max(3, Math.round(chosen.length * 2.5))} s · one Horizons query per site</div>
              </GlassCard>
            </div>
          </div>

          {/* Globe with markers */}
          <GlassCard className="relative overflow-hidden">
            <div className="h-[300px] md:h-[360px]">
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
              <div className="text-xs text-ink-dim">Hover a site to fly there · colours match the ranking</div>
            </div>
          </GlassCard>

          {/* Results */}
          <AnimatePresence>
            {result && ranking.length > 0 && (
              <motion.div key={JSON.stringify(result.metadata)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-4">
                {/* Winner + bar chart */}
                <div className="grid gap-4 lg:grid-cols-12">
                  <GlassCard strong className="relative overflow-hidden p-5 lg:col-span-4">
                    <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl" style={{ background: `${colorOf[winner.name] || '#38d9f5'}33` }} />
                    <Pill tone="accent">Rank #1 · {PROFILE_LABELS[profile]?.label}</Pill>
                    <div className="mt-3 font-display text-2xl font-semibold text-ink md:text-3xl">{winner.name}</div>
                    <div className="num text-xs text-ink-muted">{fmtLat(winner.lat_deg, 2)} · {fmtLon(winner.lon_deg, 2)}</div>
                    <div className="mt-4 flex items-end gap-2">
                      <div className="num text-5xl font-semibold" style={{ color: colorOf[winner.name] }}>{winner.total_score.toFixed(1)}</div>
                      <div className="mb-2 font-mono text-xs text-ink-muted">/ 100 weighted</div>
                    </div>
                    <ul className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      {['sunlit_pct', 'longest_dark_h', 'earth_pct', 'longest_comms_gap_h'].map((k) => (
                        <li key={k} className="rounded-lg bg-void/50 px-3 py-2">
                          <div className="label-caps">{critLabel(k)}</div>
                          <div className="num text-ink">{fmtRaw(k, winner[`raw_${k}`])}</div>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="btn-ghost mt-4 w-full" onClick={() => onAnalyze({ lat: winner.lat_deg, lon: normalizeLon(winner.lon_deg), name: winner.name })}>
                      Open full timeline <IconArrow />
                    </button>
                  </GlassCard>

                  <GlassCard className="p-5 lg:col-span-8">
                    <div className="label-caps">Weighted total score</div>
                    <div className="font-display text-base font-semibold text-ink">Ranking</div>
                    <div className="mt-2">
                      <ResponsiveContainer width="100%" height={Math.max(180, ranking.length * 44)}>
                        <BarChart data={ranking} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }} barCategoryGap={8}>
                          <CartesianGrid horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} stroke="rgba(167,180,211,0.18)" />
                          <YAxis type="category" dataKey="name" width={isMobile ? 110 : 170} tickLine={false} axisLine={false} tick={{ fill: '#a7b4d3', fontSize: 11, fontFamily: 'Inter' }} />
                          <Tooltip cursor={{ fill: 'rgba(56,217,245,0.06)' }} content={({ active, payload }) => active && payload?.length ? (
                            <div className="glass-strong px-3 py-2 text-xs">
                              <div className="font-display font-semibold text-ink">{payload[0].payload.name}</div>
                              <div className="num text-ink-dim">total {payload[0].value.toFixed(1)} / 100</div>
                            </div>
                          ) : null} />
                          <Bar dataKey="total_score" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive>
                            {ranking.map((r) => <Cell key={r.name} fill={colorOf[r.name] || '#38d9f5'} />)}
                            <LabelList dataKey="total_score" position="right" formatter={(v) => v.toFixed(1)} style={{ fill: '#eef3ff', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </GlassCard>
                </div>

                {/* Table */}
                <GlassCard className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline px-5 py-4">
                    <div>
                      <div className="label-caps">Scorecard</div>
                      <div className="font-display text-base font-semibold text-ink">Per-criterion scores (0–100, best among candidates = 100)</div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px] text-ink-muted">
                      <span className="inline-block h-2 w-10 rounded-sm bg-gradient-to-r from-[#104281] to-[#9ec5f4]" /> 0 → 100 · raw value beneath
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                          <th className="px-5 py-3 font-medium">#</th>
                          <th className="px-3 py-3 font-medium">Site</th>
                          <th className="px-3 py-3 font-medium">Total</th>
                          {critKeys.map((k) => (
                            <th key={k} className="px-3 py-3 font-medium">
                              {critLabel(k)} <span className="text-ink-muted/70">{critDir(k) === false ? '↓' : '↑'}</span>
                              <div className="font-mono text-[9px] normal-case tracking-normal text-ink-muted/70">w {Math.round((weights[k] ?? 0) * 100)}%</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ranking.map((r, i) => (
                          <motion.tr key={r.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="border-t hairline hover:bg-white/3">
                            <td className="px-5 py-3 font-mono text-ink-muted">{r.rank}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf[r.name] }} />
                                <div>
                                  <div className="font-display text-sm font-medium text-ink">{r.name}</div>
                                  <div className="num text-[10px] text-ink-muted">{fmtLat(r.lat_deg, 1)} · {fmtLon(r.lon_deg, 1)}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="num text-base font-semibold text-ink">{r.total_score.toFixed(1)}</div>
                              <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-void/70"><div className="h-full rounded-full" style={{ width: `${r.total_score}%`, background: colorOf[r.name] }} /></div>
                            </td>
                            {critKeys.map((k) => {
                              const s = r[`score_${k}`] ?? 0
                              return (
                                <td key={k} className="px-3 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block h-6 w-1.5 rounded-sm" style={{ background: scoreColor(s), opacity: 0.9 }} />
                                    <div>
                                      <div className="num text-ink">{s.toFixed(0)}</div>
                                      <div className="num text-[10px] text-ink-muted">{fmtRaw(k, r[`raw_${k}`])}</div>
                                    </div>
                                  </div>
                                </td>
                              )
                            })}
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>

                {/* Radar */}
                <GlassCard className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="label-caps">Profile shape</div>
                      <div className="font-display text-base font-semibold text-ink">Top {Math.min(4, ranking.length)} sites across all criteria</div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {ranking.slice(0, 4).map((r) => (
                        <span key={r.name} className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim"><span className="h-2 w-3 rounded-sm" style={{ background: colorOf[r.name] }} />{r.name}</span>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={isMobile ? 300 : 380}>
                    <RadarChart data={radarData} outerRadius={isMobile ? '65%' : '75%'}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="criterion" />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      {ranking.slice(0, 4).map((r) => (
                        <Radar key={r.name} name={r.name} dataKey={r.name} stroke={colorOf[r.name]} fill={colorOf[r.name]} fillOpacity={0.12} strokeWidth={2} dot={{ r: 3, fill: colorOf[r.name], strokeWidth: 0 }} isAnimationActive />
                      ))}
                      <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                        <div className="glass-strong px-3 py-2 text-xs">
                          <div className="mb-1 text-ink-muted">{label}</div>
                          {payload.map((p) => <div key={p.name} className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5 text-ink-dim"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span><span className="num text-ink">{Number(p.value).toFixed(0)}</span></div>)}
                        </div>
                      ) : null} />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="mt-1 font-mono text-[10px] text-ink-muted">
                    Window {result.metadata.start_utc?.slice(0, 10)} · {result.metadata.days} days @ {result.metadata.step_min} min · scores are relative to this candidate set.
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <LoadingOverlay
        show={loading}
        title={`Ranking ${chosen.length} sites`}
        note="One Horizons ephemeris run per site — hold on."
        steps={['Fetching Sun & Earth vectors for each site', 'Deriving terrain horizons', 'Scoring criteria 0–100', 'Applying mission weights']}
      />
    </motion.main>
  )
}
