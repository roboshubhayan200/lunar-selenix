import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { fadeUp, stagger, Pill, IconBook, IconSignal, IconSun, IconEarth } from '../ui/index.jsx'
import { EARTH_MOON_DISTANCE_KM, LIGHT_TIME_S } from '../../lib/lunar.js'

/* ------------------------------------------------------------------ */
/*  Word-by-word reveal                                                */
/* ------------------------------------------------------------------ */

export function RevealText({ text, className = '', delay = 0.1, speed = 0.022 }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])
  return (
    <motion.p variants={stagger(speed, delay)} initial="hidden" animate="show" className={className}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          variants={{ hidden: { opacity: 0, y: 6, filter: 'blur(4px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35 } } }}
          className="inline-block"
        >
          {w}&nbsp;
        </motion.span>
      ))}
    </motion.p>
  )
}

/* ------------------------------------------------------------------ */
/*  Direct-to-Earth comms explainer (SVG + native animateMotion)       */
/* ------------------------------------------------------------------ */

export function CommsExplainer({ earthVisible, earthEl, siteName }) {
  const relay = !earthVisible
  return (
    <div className="relative">
      <svg viewBox="0 0 640 300" className="h-auto w-full">
        <defs>
          <radialGradient id="earthG" cx="35%" cy="35%" r="70%">
            <stop offset="0" stopColor="#8ec5ff" />
            <stop offset="0.45" stopColor="#2f73d8" />
            <stop offset="1" stopColor="#0b2a66" />
          </radialGradient>
          <radialGradient id="moonG" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#d9d5cc" />
            <stop offset="0.6" stopColor="#8f8b83" />
            <stop offset="1" stopColor="#3a3835" />
          </radialGradient>
          <radialGradient id="glowC" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#7ee8fa" stopOpacity="1" />
            <stop offset="1" stopColor="#7ee8fa" stopOpacity="0" />
          </radialGradient>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5 0 10z" fill="#6b7a9c" />
          </marker>
        </defs>

        {/* background grid */}
        <rect width="640" height="300" fill="transparent" />

        {/* Earth */}
        <g transform="translate(90,150)">
          <circle r="56" fill="url(#earthG)" />
          <circle r="60" fill="none" stroke="#7ab8ff" strokeOpacity="0.35" strokeWidth="4" />
          <path d="M-20,-30 q15,-10 30,0 q10,12 -5,22 q-20,5 -25,-22z" fill="#2f9a5a" opacity="0.8" />
          <path d="M5,10 q18,-6 26,10 q-6,16 -22,12 q-10,-8 -4,-22z" fill="#2f9a5a" opacity="0.7" />
          <text y="82" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fill="#a7b4d3" letterSpacing="2">EARTH</text>
          <text y="96" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="#6b7a9c">DSN ground stations</text>
        </g>

        {/* Moon */}
        <g transform="translate(520,130)">
          <circle r="62" fill="url(#moonG)" />
          <circle cx="-14" cy="-10" r="9" fill="#6f6b64" opacity="0.6" />
          <circle cx="18" cy="12" r="6" fill="#6f6b64" opacity="0.5" />
          <circle cx="-26" cy="22" r="5" fill="#6f6b64" opacity="0.5" />
          {/* south pole site */}
          <g transform="translate(0,62)">
            <circle r="4" fill="#38d9f5" />
            <circle r="9" fill="none" stroke="#38d9f5" strokeOpacity="0.6">
              <animate attributeName="r" values="4;14" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.8;0" dur="1.8s" repeatCount="indefinite" />
            </circle>
          </g>
          <text y="-74" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fill="#a7b4d3" letterSpacing="2">MOON</text>
          <text x="0" y="92" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="#38d9f5">{siteName || 'landing site'} · south pole</text>
          {/* Earth-facing horizon line at the pole */}
          <line x1="-40" y1="62" x2="-120" y2="40" stroke="#6b7a9c" strokeDasharray="3 3" />
          <text x="-124" y="36" textAnchor="end" fontFamily="JetBrains Mono" fontSize="9" fill="#6b7a9c">local horizon</text>
        </g>

        {/* Relay satellite (shown when Earth is below the horizon) */}
        <g opacity={relay ? 1 : 0.18} style={{ transition: 'opacity 400ms' }}>
          <ellipse cx="520" cy="130" rx="118" ry="40" fill="none" stroke="#9085e9" strokeOpacity="0.35" strokeDasharray="2 4" />
          <g>
            <rect x="-9" y="-3" width="18" height="6" rx="1" fill="#c9c3b6" />
            <rect x="-22" y="-2" width="11" height="4" fill="#1a2a5c" />
            <rect x="11" y="-2" width="11" height="4" fill="#1a2a5c" />
            <animateMotion dur="9s" repeatCount="indefinite" path="M402,130 a118,40 0 1,0 236,0 a118,40 0 1,0 -236,0" />
          </g>
          <text x="520" y="214" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="#9085e9">relay orbiter (e.g. Gateway / Queqiao-class)</text>
        </g>

        {/* Direct link */}
        <path id="dte" d="M150,138 Q335,60 520,192" fill="none" stroke={earthVisible ? '#38d9f5' : '#6b7a9c'} strokeOpacity={earthVisible ? 0.55 : 0.2} strokeDasharray="4 5" style={{ transition: 'stroke 400ms' }} />
        {earthVisible && [0, 1, 2, 3].map((i) => (
          <circle key={i} r="3.5" fill="url(#glowC)">
            <animateMotion dur="2.6s" begin={`${i * 0.65}s`} repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear">
              <mpath href="#dte" />
            </animateMotion>
          </circle>
        ))}
        {earthVisible && [0, 1, 2].map((i) => (
          <circle key={`u${i}`} r="2.5" fill="#f2b134" opacity="0.9">
            <animateMotion dur="2.6s" begin={`${0.3 + i * 0.85}s`} repeatCount="indefinite">
              <mpath href="#dte" />
            </animateMotion>
          </circle>
        ))}

        {/* Relay hop when blocked */}
        {relay && (
          <>
            <path id="hop1" d="M520,192 Q540,120 560,96" fill="none" stroke="#9085e9" strokeOpacity="0.5" strokeDasharray="3 4" />
            <path id="hop2" d="M560,96 Q340,40 150,138" fill="none" stroke="#9085e9" strokeOpacity="0.5" strokeDasharray="3 4" />
            {[0, 1].map((i) => (
              <circle key={i} r="3" fill="#9085e9">
                <animateMotion dur="1.3s" begin={`${i * 0.6}s`} repeatCount="indefinite"><mpath href="#hop1" /></animateMotion>
              </circle>
            ))}
            {[0, 1, 2].map((i) => (
              <circle key={`h${i}`} r="3" fill="#9085e9">
                <animateMotion dur="2.4s" begin={`${0.6 + i * 0.7}s`} repeatCount="indefinite"><mpath href="#hop2" /></animateMotion>
              </circle>
            ))}
          </>
        )}

        {/* labels */}
        <text x="335" y="52" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill={earthVisible ? '#38d9f5' : '#6b7a9c'}>
          {earthVisible ? `direct-to-Earth link · Earth ${earthEl.toFixed(1)}° above horizon` : `Earth ${Math.abs(earthEl).toFixed(1)}° below horizon · direct link blocked`}
        </text>
        <line x1="150" y1="262" x2="458" y2="262" stroke="#6b7a9c" strokeOpacity="0.5" markerStart="url(#arr)" markerEnd="url(#arr)" />
        <text x="304" y="278" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#6b7a9c">
          ≈ {EARTH_MOON_DISTANCE_KM.toLocaleString()} km · one-way light time {LIGHT_TIME_S} s (not to scale)
        </text>
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Vertical vs flat panel energy                                      */
/* ------------------------------------------------------------------ */

function PanelEnergy({ vert, flat }) {
  const max = Math.max(vert, flat, 1e-9)
  const rows = [
    { label: 'Vertical, Sun-tracking', value: vert, color: '#f2b134', note: 'power ∝ cos(elevation)' },
    { label: 'Flat, horizontal', value: flat, color: '#6b7a9c', note: 'power ∝ sin(elevation)' },
  ]
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ink-dim">{r.label} <span className="font-mono text-[10px] text-ink-muted">· {r.note}</span></span>
            <span className="num text-ink">{r.value.toFixed(1)} <span className="text-ink-muted">kWh/m²</span></span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-void/70">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(100 * r.value) / max}%` }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full" style={{ background: r.color }} />
          </div>
        </div>
      ))}
      <div className="text-[11px] leading-snug text-ink-muted">
        {vert > 0 && flat > 0
          ? `A vertical panel collects ${(vert / flat).toFixed(1)}× the energy of a flat one here. At 1° elevation sin(1°) ≈ 0.017, so a flat panel sees under 2% of the available light.`
          : vert === 0
            ? 'No direct sunlight reached the site in this window, so neither orientation collects energy. Shift the start date toward southern summer (Dec–Jan) to see the difference.'
            : 'Flat panels collect almost nothing here because the Sun never climbs more than a degree or two above the horizon.'}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const CONCEPTS = [
  {
    icon: <IconSun className="h-4 w-4" />,
    tone: 'sun',
    title: 'Why the Sun only grazes the polar horizon',
    body: "The Moon's spin axis is tilted just 1.54° to the ecliptic, so from the poles the Sun never climbs more than about 1.5° above a flat horizon. It circles the sky once per synodic month (29.53 days) instead of rising and setting. Rims and massifs that stand a little higher stay lit for most of that circle — which is why Shackleton's rim and Malapert Massif are prized.",
  },
  {
    icon: <IconEarth className="h-4 w-4" />,
    tone: 'earth',
    title: 'Why Earth wobbles in and out of view',
    body: 'Earth is tidally locked near the lunar zenith only from the centre of the nearside. From the south pole it sits on the horizon toward longitude 0°, and libration (±6.9° in longitude, ±6.7° in latitude) swings it above and below that horizon over the ~27.3-day cycle. That wobble is the comms gap you see in the Earth-elevation curve.',
  },
  {
    icon: <IconSignal className="h-4 w-4" />,
    tone: 'comms',
    title: 'Direct-to-Earth versus relay',
    body: 'A direct-to-Earth (DTE) link needs Earth above the local horizon and a clear line of sight to a Deep Space Network station. When Earth dips below the rim, a relay (an orbiter such as Gateway, or a surface relay on a high point like Malapert Massif) carries the traffic. Each hop adds latency on top of the 1.28 s one-way light time.',
  },
]

export default function EducatorPanel({ data, stats, cursor, siteName }) {
  const notes = data?.physics_notes || ''
  const summary = data?.summary || {}
  return (
    <motion.section variants={stagger(0.08, 0.05)} initial="hidden" animate="show" exit={{ opacity: 0, y: 10 }} className="space-y-4">
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
        <Pill tone="accent"><IconBook className="h-3 w-3" /> Educator mode</Pill>
        <span className="text-xs text-ink-muted">Physics behind the numbers, written for students and mission newcomers.</span>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-5">
        <motion.div variants={fadeUp} className="glass p-5 lg:col-span-3">
          <div className="label-caps mb-2">Model notes for this run</div>
          <RevealText text={notes} className="text-sm leading-relaxed text-ink" />
          <div className="mt-5 border-t hairline pt-4">
            <div className="label-caps mb-3">Vertical vs flat solar panels</div>
            <PanelEnergy vert={summary.energy_vert_kwh_m2 ?? 0} flat={summary.energy_flat_kwh_m2 ?? 0} />
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="glass p-5 lg:col-span-2">
          <div className="label-caps mb-1">How the signal gets home</div>
          <div className="mb-2 text-xs text-ink-muted">Live with the time cursor — the diagram switches to a relay path whenever Earth drops below the horizon.</div>
          <CommsExplainer earthVisible={!!cursor?.earthVisible} earthEl={cursor?.earthEl ?? 0} siteName={siteName} />
        </motion.div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CONCEPTS.map((c) => (
          <motion.div key={c.title} variants={fadeUp} className="glass p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${c.tone === 'sun' ? 'bg-sun/15 text-sun-bright' : c.tone === 'earth' ? 'bg-earth/15 text-earth-bright' : 'bg-comms/15 text-comms-bright'}`}>{c.icon}</span>
              <div className="font-display text-sm font-semibold text-ink">{c.title}</div>
            </div>
            <p className="text-xs leading-relaxed text-ink-dim">{c.body}</p>
          </motion.div>
        ))}
      </div>

      {stats && (
        <motion.div variants={fadeUp} className="glass p-5">
          <div className="label-caps mb-3">Reading this site</div>
          <ul className="grid gap-2 text-xs text-ink-dim md:grid-cols-2">
            <li>• The Sun was above the horizon for <b className="num text-ink">{stats.sunlitPct.toFixed(1)}%</b> of the window; its highest point was <b className="num text-ink">{stats.maxSunEl.toFixed(2)}°</b>.</li>
            <li>• The longest uninterrupted night lasted <b className="num text-ink">{(stats.longestDarkH / 24).toFixed(1)} days</b> — that is what the battery must bridge.</li>
            <li>• Earth was visible <b className="num text-ink">{stats.earthPct.toFixed(1)}%</b> of the time across <b className="num text-ink">{stats.commWindows.length}</b> contact window{stats.commWindows.length === 1 ? '' : 's'}.</li>
            <li>• Both power and comms were available simultaneously <b className="num text-ink">{stats.bothPct.toFixed(1)}%</b> of the time — the operational sweet spot.</li>
          </ul>
        </motion.div>
      )}
    </motion.section>
  )
}
