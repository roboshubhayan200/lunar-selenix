import { useMemo } from 'react'

/*
 * Equal-angle sky panorama seen from the lander.
 *   x: azimuth, 360° across the full width (centred on the Earth's mean azimuth)
 *   y: elevation, with the SAME pixels-per-degree as x
 * So elevation is strictly proportional: sun_el = 3° puts the Sun's centre 3° (≈8 px)
 * above the horizon line. Positions use the exact series values for index i.
 * Icon sizes are symbolic (the real Sun is 0.5° wide).
 */
const W = 1000
const H = 440
const HZ = 300 // horizon y
const PX = W / 360 // px per degree (both axes)
const CX = W / 2
const MAX_BELOW = (H - HZ - 14) / PX // deepest elevation drawn inside the ground (deg)

const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180

/** Circular mean of azimuths (deg) — used only to choose where the panorama is centred. */
function circularMean(azs) {
  let sx = 0, sy = 0
  for (const a of azs) { sx += Math.cos((a * Math.PI) / 180); sy += Math.sin((a * Math.PI) / 180) }
  return ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360
}

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const CARDINALS = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']]

function Label({ tone, children }) {
  const tones = {
    sun: 'border-sun-bright/50 bg-sun/15 text-sun-bright shadow-[0_0_18px_rgba(242,177,52,0.45)]',
    night: 'border-violet/40 bg-violet/10 text-violet',
    comms: 'border-comms-bright/50 bg-comms/15 text-comms-bright shadow-[0_0_18px_rgba(34,181,138,0.4)]',
    relay: 'border-danger/50 bg-danger/10 text-danger',
    gold: 'border-[#f6d878]/60 bg-[#f2c94c]/15 text-[#f6d878] shadow-[0_0_22px_rgba(242,201,76,0.5)]',
    dark: 'border-ink-muted/40 bg-void/70 text-ink-dim',
  }
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[11px] font-semibold backdrop-blur ${tones[tone]}`}>{children}</span>
}

export default function SurfaceViewport({ series, index }) {
  const i = Math.min(Math.max(0, index), series.t_utc.length - 1)
  const sunAz = series.sun_az[i]
  const sunEl = series.sun_el[i]
  const earthAz = series.earth_az[i]
  const earthEl = series.earth_el[i]
  const sunUp = sunEl > 0
  const dte = series.earth_visible[i] === true
  const frac = series.sun_frac?.[i]

  const centerAz = useMemo(() => {
    const vis = series.earth_az.filter((_, k) => series.earth_visible[k] === true)
    return circularMean(vis.length ? vis : series.earth_az)
  }, [series])

  const stars = useMemo(() => {
    const r = mulberry(7)
    return Array.from({ length: 110 }, () => ({ x: r() * W, y: r() * (HZ - 8), s: r() < 0.1 ? 1.4 : 0.5 + r() * 0.7, o: 0.3 + r() * 0.6 }))
  }, [])
  const craters = useMemo(() => {
    const r = mulberry(19)
    return Array.from({ length: 26 }, () => {
      const y = HZ + 10 + r() * (H - HZ - 14)
      const depth = (y - HZ) / (H - HZ)
      return { x: r() * W, y, rx: (6 + r() * 26) * (0.5 + depth), ry: (2 + r() * 6) * (0.5 + depth) }
    })
  }, [])

  const ax = (az) => CX + wrap180(az - centerAz) * PX
  const ay = (el) => HZ - Math.max(el, -MAX_BELOW) * PX
  const sun = { x: ax(sunAz), y: ay(sunEl), clamped: sunEl < -MAX_BELOW }
  const earth = { x: ax(earthAz), y: ay(earthEl), clamped: earthEl < -MAX_BELOW }

  const state = sunUp && dte ? 'both' : sunUp ? 'power' : dte ? 'comms' : 'blackout'
  // Surface brightness: lit by the Sun (scaled by the visible disk fraction when reported).
  const lit = sunUp ? 0.45 + 0.55 * (Number.isFinite(frac) ? Math.min(1, Math.max(0, frac)) : 1) : 0
  const g1 = `rgb(${Math.round(38 + 92 * lit)},${Math.round(40 + 90 * lit)},${Math.round(48 + 84 * lit)})`
  const g2 = `rgb(${Math.round(14 + 40 * lit)},${Math.round(16 + 40 * lit)},${Math.round(22 + 38 * lit)})`

  const panel = { x1: CX - 58, y1: HZ - 46, x2: CX - 18, y2: HZ - 30 }
  const antenna = { x: CX + 22, y: HZ - 58 }

  return (
    <div className="relative overflow-hidden rounded-2xl border hairline bg-void">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Sky from the site at ${series.t_utc[i]}: Sun elevation ${sunEl}°, Earth elevation ${earthEl}°`}>
        <defs>
          <linearGradient id="sv-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#02040a" />
            <stop offset="1" stopColor={sunUp ? '#0c1430' : '#050812'} />
          </linearGradient>
          <linearGradient id="sv-ground" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={g1} />
            <stop offset="1" stopColor={g2} />
          </linearGradient>
          <radialGradient id="sv-sun">
            <stop offset="0" stopColor="#fffbe6" />
            <stop offset="0.35" stopColor="#ffd75e" />
            <stop offset="1" stopColor="#f29b1a" />
          </radialGradient>
          <radialGradient id="sv-sunglow">
            <stop offset="0" stopColor="rgba(255,214,110,0.55)" />
            <stop offset="1" stopColor="rgba(255,170,40,0)" />
          </radialGradient>
          <radialGradient id="sv-earth" cx="35%" cy="35%">
            <stop offset="0" stopColor="#9be7c4" />
            <stop offset="0.45" stopColor="#2f86d8" />
            <stop offset="1" stopColor="#0b2a66" />
          </radialGradient>
          <filter id="sv-gold" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feFlood floodColor="#f2c94c" floodOpacity="0.85" />
            <feComposite in2="b" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <clipPath id="sv-skyclip"><rect x="0" y="0" width={W} height={HZ} /></clipPath>
        </defs>

        {/* sky */}
        <rect x="0" y="0" width={W} height={HZ} fill="url(#sv-sky)" />
        {stars.map((s, k) => <circle key={k} cx={s.x} cy={s.y} r={s.s} fill="#eef3ff" opacity={s.o * (sunUp ? 0.6 : 1)} />)}

        {/* elevation grid (proportional scale) */}
        {[10, 30, 60, 90].map((e) => (
          <g key={e}>
            <line x1="0" x2={W} y1={HZ - e * PX} y2={HZ - e * PX} stroke="#a7b4d3" strokeOpacity="0.12" strokeDasharray="3 6" />
            <text x="8" y={HZ - e * PX - 4} fill="#6b7a9c" fontSize="11" fontFamily="JetBrains Mono">{e}°</text>
          </g>
        ))}

        {/* Sun above horizon (drawn before the ground so the ground hides a rising disc) */}
        {sunUp && (
          <g clipPath="url(#sv-skyclip)">
            <circle cx={sun.x} cy={sun.y} r="58" fill="url(#sv-sunglow)" />
            <circle cx={sun.x} cy={sun.y} r="16" fill="url(#sv-sun)" />
          </g>
        )}
        {earthEl > 0 && (
          <g clipPath="url(#sv-skyclip)">
            <circle cx={earth.x} cy={earth.y} r="22" fill="#3987e5" opacity="0.18" />
            <circle cx={earth.x} cy={earth.y} r="11" fill="url(#sv-earth)" />
          </g>
        )}

        {/* power rays */}
        {sunUp && [0, 1, 2].map((k) => (
          <line key={k} x1={sun.x} y1={sun.y} x2={panel.x1 + (k + 0.5) * ((panel.x2 - panel.x1) / 3)} y2={panel.y1 + (k + 0.5) * ((panel.y2 - panel.y1) / 3)} stroke="#f7d36b" strokeWidth="1.6" strokeOpacity="0.75" strokeDasharray="10 8" className="svg-flow" />
        ))}

        {/* comms link */}
        {dte && (
          <>
            <line x1={antenna.x} y1={antenna.y} x2={earth.x} y2={earth.y} stroke="#22b58a" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" className="svg-flow-fast" />
            {[0, 1, 2].map((k) => (
              <circle key={k} cx={antenna.x} cy={antenna.y} r="8" fill="none" stroke="#22b58a" strokeWidth="1.4" className="svg-ping" style={{ animationDelay: `${k * 0.5}s` }} />
            ))}
          </>
        )}

        {/* ground */}
        <rect x="0" y={HZ} width={W} height={H - HZ} fill="url(#sv-ground)" />
        {craters.map((c, k) => (
          <g key={k} opacity={0.35 + lit * 0.4}>
            <ellipse cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} fill="rgba(0,0,0,0.28)" />
            <ellipse cx={c.x + c.rx * 0.08} cy={c.y - c.ry * 0.18} rx={c.rx * 0.85} ry={c.ry * 0.7} fill="none" stroke={`rgba(255,255,255,${0.05 + lit * 0.12})`} strokeWidth="1" />
          </g>
        ))}

        {/* horizon + compass */}
        <line x1="0" x2={W} y1={HZ} y2={HZ} stroke="#eef3ff" strokeWidth="1.6" strokeOpacity="0.85" />
        {CARDINALS.map(([az, l]) => {
          const x = ax(az)
          return (
            <g key={l}>
              <line x1={x} x2={x} y1={HZ} y2={HZ + (l.length === 1 ? 10 : 6)} stroke="#a7b4d3" strokeOpacity="0.7" />
              <text x={x} y={HZ + 24} textAnchor="middle" fill={l.length === 1 ? '#a7b4d3' : '#6b7a9c'} fontSize={l.length === 1 ? 12 : 10} fontFamily="JetBrains Mono" fontWeight={l.length === 1 ? 700 : 400}>{l}</text>
            </g>
          )
        })}
        <text x={W - 8} y={HZ - 6} textAnchor="end" fill="#a7b4d3" fontSize="11" fontFamily="JetBrains Mono" opacity="0.8">horizon 0°</text>

        {/* below-horizon ghosts (inside the ground, same proportional scale, clamped at the bottom edge) */}
        {!sunUp && (
          <g opacity="0.65">
            <circle cx={sun.x} cy={sun.y} r="14" fill="none" stroke="#f2b134" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x={sun.x} y={sun.y + 4} textAnchor="middle" fill="#f2b134" fontSize="12">☀</text>
            <text x={sun.x + 20} y={sun.y + 4} fill="#f2b134" fontSize="11" fontFamily="JetBrains Mono">Sun {Number(sunEl).toFixed(1)}°{sun.clamped ? ' ↓' : ''}</text>
          </g>
        )}
        {earthEl <= 0 && (
          <g opacity="0.65">
            <circle cx={earth.x} cy={earth.y} r="10" fill="none" stroke="#6da7ec" strokeWidth="1.5" strokeDasharray="3 3" />
            <text x={earth.x + 16} y={earth.y + 4} fill="#6da7ec" fontSize="11" fontFamily="JetBrains Mono">Earth {Number(earthEl).toFixed(1)}°{earth.clamped ? ' ↓' : ''}</text>
          </g>
        )}
        {sunUp && <text x={sun.x} y={sun.y - 26} textAnchor="middle" fill="#f2b134" fontSize="11" fontFamily="JetBrains Mono">Sun {Number(sunEl).toFixed(1)}°</text>}
        {earthEl > 0 && <text x={earth.x} y={earth.y - 18} textAnchor="middle" fill="#6da7ec" fontSize="11" fontFamily="JetBrains Mono">Earth {Number(earthEl).toFixed(1)}°</text>}

        {/* lander */}
        <g opacity={state === 'blackout' ? 0.45 : 1} filter={state === 'both' ? 'url(#sv-gold)' : undefined}>
          <ellipse cx={CX} cy={HZ + 3} rx="44" ry="5" fill="rgba(0,0,0,0.45)" />
          <line x1={CX - 22} y1={HZ - 18} x2={CX - 34} y2={HZ + 1} stroke="#a7b4d3" strokeWidth="2.5" />
          <line x1={CX + 22} y1={HZ - 18} x2={CX + 34} y2={HZ + 1} stroke="#a7b4d3" strokeWidth="2.5" />
          <rect x={CX - 24} y={HZ - 40} width="48" height="26" rx="4" fill={state === 'blackout' ? '#4b5567' : '#c9d3e6'} stroke="#eef3ff" strokeOpacity="0.5" />
          <rect x={CX - 16} y={HZ - 34} width="14" height="10" rx="2" fill="#16203a" />
          {/* solar panel */}
          <line x1={CX - 24} y1={HZ - 34} x2={panel.x2} y2={panel.y2} stroke="#a7b4d3" strokeWidth="2" />
          <polygon points={`${panel.x1},${panel.y1} ${panel.x2},${panel.y2 - 4} ${panel.x2 + 2},${panel.y2 + 4} ${panel.x1 + 2},${panel.y1 + 8}`} fill={sunUp ? '#2b5fb8' : '#1a2440'} stroke={sunUp ? '#f7d36b' : '#3a4560'} strokeWidth="1.2" />
          {/* antenna */}
          <line x1={CX + 12} y1={HZ - 40} x2={antenna.x} y2={antenna.y + 6} stroke="#a7b4d3" strokeWidth="2" />
          <path d={`M ${antenna.x - 9} ${antenna.y + 2} Q ${antenna.x} ${antenna.y + 12} ${antenna.x + 9} ${antenna.y + 2}`} fill="none" stroke={dte ? '#22b58a' : '#6b7a9c'} strokeWidth="2.2" />
          <circle cx={antenna.x} cy={antenna.y} r="2.4" fill={dte ? '#22b58a' : '#6b7a9c'} />
        </g>
      </svg>

      {/* status labels */}
      <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1.5">
        {state === 'both' && <Label tone="gold">★ Optimal operations: power + comms</Label>}
        {state === 'blackout' && <Label tone="dark">■ Full blackout</Label>}
        {sunUp ? <Label tone="sun">☀ Solar Power Active</Label> : <Label tone="night">🌑 Night · Battery Mode</Label>}
        {dte ? <Label tone="comms">📡 DTE Link Active</Label> : <Label tone="relay">📡 No DTE · Relay Required</Label>}
      </div>

      {/* exact readout */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-void/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-dim backdrop-blur">
        <div className="text-accent">{series.t_utc[i]}</div>
        <div><span className="text-sun-bright">sun</span> az {String(sunAz)}° · el {String(sunEl)}°</div>
        <div><span className="text-earth-bright">earth</span> az {String(earthAz)}° · el {String(earthEl)}° · visible {String(series.earth_visible[i])}</div>
      </div>
      <div className="pointer-events-none absolute bottom-2 right-3 max-w-[60%] text-right font-mono text-[9px] leading-snug text-ink-muted">
        360° panorama centred on az {centerAz.toFixed(0)}°. 1° is the same distance across and up, so elevations are to scale. Icon sizes are symbolic.
      </div>
    </div>
  )
}
