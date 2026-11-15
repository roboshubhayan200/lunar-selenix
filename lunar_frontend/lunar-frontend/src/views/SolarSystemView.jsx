import { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import SolarSystemScene from '../components/SolarSystem/SolarSystemScene.jsx'
import { daysSinceJ2000, moonPhase, moonPosition, sunPosition } from '../components/SolarSystem/ephemeris.js'
import { pageVariants, fadeUp, stagger, Pill, IconArrow, IconPause, IconPlay } from '../components/ui/index.jsx'
import { useMediaQuery } from '../lib/hooks.js'

const SPEEDS = [
  { label: 'Real time', dps: 1 / 86400 },
  { label: '1 h/s', dps: 1 / 24 },
  { label: '1 d/s', dps: 1 },
  { label: '1 wk/s', dps: 7 },
]

/** Reference facts (static constants, shown as context). */
const FACTS = {
  sun: {
    title: 'The Sun',
    color: '#f2b134',
    rows: [['Radius', '696,000 km'], ['Mean distance to Earth', '1 AU ≈ 149.6 million km'], ['Light to the Moon', '≈ 8.3 min']],
    blurb: 'The power source for every lunar mission. At the poles it skims the horizon, so a crater rim a few hundred metres higher can mean weeks more sunlight.',
  },
  earth: {
    title: 'Earth',
    color: '#6da7ec',
    rows: [['Radius', '6,371 km'], ['Axial tilt', '23.44°'], ['Sidereal day', '23 h 56 m']],
    blurb: 'Mission control. A lander needs Earth above its local horizon for a direct link. The far side never sees Earth, and polar sites see it only part of the month.',
  },
  moon: {
    title: 'The Moon',
    color: '#38d9f5',
    rows: [['Radius', '1,737.4 km'], ['Mean distance', '384,400 km'], ['Synodic month', '29.53 d'], ['Orbital inclination', '5.14°'], ['Axial tilt', '1.54°']],
    blurb: 'Tidally locked: the same nearside always faces Earth (as in this simulation). Its small 1.54° tilt is why polar crater rims can stay sunlit while their floors stay permanently dark.',
  },
}

function fmtSimDate(ms) {
  const d = new Date(ms)
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`
}

export default function SolarSystemView({ onEnterMoon }) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [startMs] = useState(() => Date.now())
  const simRef = useRef({ ms: startMs, daysPerSecond: 1, paused: false })
  const [simMs, setSimMs] = useState(startMs)
  const [speed, setSpeed] = useState(2)
  const [paused, setPaused] = useState(false)
  const [ready, setReady] = useState(false)
  const [focus, setFocus] = useState(null)
  const [selected, setSelected] = useState(null)
  const [entering, setEntering] = useState(false)

  const live = useMemo(() => {
    const d = daysSinceJ2000(simMs)
    return { phase: moonPhase(d), moon: moonPosition(d), sun: sunPosition(d) }
  }, [simMs])

  const select = useCallback((key) => {
    if (entering) return
    setSelected(key)
    setFocus({ target: key, k: Math.random() })
  }, [entering])

  const enterMoon = useCallback(() => {
    setEntering(true)
    setSelected('moon')
    setFocus({ target: 'enter-moon', k: Math.random() })
  }, [])

  const onArrive = useCallback((key) => {
    if (key === 'enter-moon') setTimeout(() => onEnterMoon(), 250)
  }, [onEnterMoon])

  const setSpeedIdx = (i) => { setSpeed(i); simRef.current.daysPerSecond = SPEEDS[i].dps }
  const togglePause = () => { simRef.current.paused = !simRef.current.paused; setPaused(simRef.current.paused) }
  const resetNow = () => { simRef.current.ms = Date.now(); setSimMs(Date.now()) }

  const facts = selected ? FACTS[selected] : null

  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" exit={{ opacity: 0, scale: 1.08, filter: 'blur(14px)', transition: { duration: 0.6, ease: 'easeIn' } }} className="fixed inset-0 overflow-hidden">
      <div className="absolute inset-0">
        <SolarSystemScene simRef={simRef} focus={focus} onSelect={select} onArrive={onArrive} onTick={setSimMs} onReady={() => setReady(true)} highlightMoon={selected === 'moon'} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_50%,_rgba(4,6,13,0.7)_100%)]" />

      {/* Loader */}
      <AnimatePresence>
        {!ready && (
          <motion.div key="loader" exit={{ opacity: 0, transition: { duration: 0.8 } }} className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-void">
            <img src="/logo-emblem.png" alt="" className="h-24 w-24 animate-pulse rounded-full" />
            <div className="shimmer-text mt-6 font-display text-sm tracking-[0.2em]">ASSEMBLING THE EARTH–MOON SYSTEM</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Headline */}
      <AnimatePresence>
        {ready && !entering && (
          <motion.div key="hero" variants={stagger(0.08, 0.3)} initial="hidden" animate="show" exit={{ opacity: 0, x: -20, transition: { duration: 0.3 } }} className="pointer-events-none absolute left-4 top-20 z-20 max-w-[min(92vw,520px)] md:left-6 md:top-24">
            <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
              <Pill tone="accent">NASA Space Apps 2026</Pill>
              <Pill>Team Lunar Selenix</Pill>
            </motion.div>
            <motion.h1 variants={fadeUp} className="mt-3 font-display text-3xl font-semibold leading-[1.05] tracking-tight text-ink md:text-5xl">
              Plan the next landing<br />
              <span className="bg-gradient-to-r from-sun-bright via-accent-soft to-accent bg-clip-text text-transparent">from orbit to surface.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-3 hidden max-w-md text-sm leading-relaxed text-ink-dim md:block">
              Sunlight and Earth line-of-sight decide where a lunar mission can survive. Start with the Sun–Earth–Moon geometry, then go down to the surface and analyse real candidate sites.
            </motion.p>
            <motion.div variants={fadeUp} className="pointer-events-auto mt-5 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={enterMoon}>Explore the Moon <IconArrow /></button>
              <button type="button" className="btn-ghost" onClick={() => select('earth')}>Focus Earth</button>
              <button type="button" className="btn-ghost" onClick={() => { setSelected(null); setFocus({ target: 'system', k: Math.random() }) }}>Overview</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Time + live geometry */}
      <AnimatePresence>
        {ready && !entering && (
          <motion.div key="clock" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.8 } }} exit={{ opacity: 0, y: 20 }} className="glass-strong absolute bottom-4 left-4 z-20 w-[min(92vw,380px)] p-4 md:bottom-6 md:left-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="label-caps">Simulation time</div>
                <div className="num text-sm text-ink">{fmtSimDate(simMs)}</div>
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost !px-2.5 !py-1.5" onClick={togglePause} aria-label={paused ? 'Play' : 'Pause'}>{paused ? <IconPlay /> : <IconPause />}</button>
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 !text-[10px]" onClick={resetNow}>Now</button>
              </div>
            </div>
            <div className="mt-2 flex gap-1">
              {SPEEDS.map((s, i) => (
                <button key={s.label} type="button" className="chip flex-1 !px-1.5 !text-[10px]" data-active={speed === i} onClick={() => setSpeedIdx(i)}>{s.label}</button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-void/50 px-2 py-1.5"><div className="label-caps !text-[0.55rem]">Moon phase</div><div className="text-[11px] text-ink">{live.phase.name}</div></div>
              <div className="rounded-lg bg-void/50 px-2 py-1.5"><div className="label-caps !text-[0.55rem]">Illuminated</div><div className="num text-[11px] text-ink">{(live.phase.illum * 100).toFixed(1)}%</div></div>
              <div className="rounded-lg bg-void/50 px-2 py-1.5"><div className="label-caps !text-[0.55rem]">Earth–Moon</div><div className="num text-[11px] text-ink">{Math.round(live.moon.distKm).toLocaleString()} km</div></div>
            </div>
            <div className="mt-2 text-[10px] leading-snug text-ink-muted">Positions from low-precision ephemeris formulas (≈1°). Sizes and distances are not to scale. Site analysis uses JPL Horizons.</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body facts */}
      <AnimatePresence mode="wait">
        {ready && facts && !entering && (
          <motion.aside key={selected} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className={`glass-strong absolute z-20 w-[min(92vw,340px)] p-4 ${isMobile ? 'right-3 top-[4.5rem]' : 'bottom-6 right-6'}`}>
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, ${facts.color}, transparent)` }} />
            <div className="flex items-start justify-between gap-2">
              <div className="font-display text-lg font-semibold" style={{ color: facts.color }}>{facts.title}</div>
              <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setSelected(null)} aria-label="Close">✕</button>
            </div>
            <dl className="mt-2 space-y-1">
              {facts.rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-xs"><dt className="text-ink-muted">{k}</dt><dd className="num text-ink">{v}</dd></div>
              ))}
              {selected === 'moon' && <div className="flex justify-between gap-3 text-xs"><dt className="text-ink-muted">Distance now (sim)</dt><dd className="num text-ink">{Math.round(live.moon.distKm).toLocaleString()} km</dd></div>}
              {selected === 'earth' && <div className="flex justify-between gap-3 text-xs"><dt className="text-ink-muted">Sun distance now (sim)</dt><dd className="num text-ink">{live.sun.rAU.toFixed(4)} AU</dd></div>}
            </dl>
            <p className="mt-2 text-[11px] leading-snug text-ink-dim">{facts.blurb}</p>
            {selected === 'moon' && (
              <button type="button" className="btn-primary mt-3 w-full" onClick={enterMoon}>Land on the Moon · open site navigator <IconArrow /></button>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Entering overlay */}
      <AnimatePresence>
        {entering && (
          <motion.div key="enter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center">
            <div className="glass-strong px-5 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Descending to lunar orbit…</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  )
}
