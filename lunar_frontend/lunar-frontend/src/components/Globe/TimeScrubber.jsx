import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import StatusStrip from '../Common/StatusStrip.jsx'
import { IconPause, IconPlay, IconSun, IconEarth } from '../ui/index.jsx'

const SPEEDS = [1, 2, 5, 10]

/**
 * Time slider over an analysed timeline. Every number shown is series[key][index] from /api/timeline.
 *  - fps: playback frame rate. When set, playback advances one timestep per frame × speed
 *         (analysis page: ~10 fps). When omitted, it skims the whole run in ~40 s (globe preview).
 *  - showSpeeds: show 1× / 2× / 5× / 10× chips.
 */
export default function TimeScrubber({ data, index, onIndex, className = '', fps = null, showSpeeds = false, title = 'Time scrubber' }) {
  const s = data.series
  const n = s.t_utc.length
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const i = Math.min(Math.max(0, index), n - 1)

  useEffect(() => {
    if (!playing) return
    const interval = fps ? 1000 / fps : 60
    const step = fps ? speed : Math.max(1, Math.round(n / 600))
    const id = setInterval(() => onIndex((k) => (k + step >= n ? 0 : k + step)), interval)
    return () => clearInterval(id)
  }, [playing, n, onIndex, fps, speed])

  const sunUp = s.sun_el[i] > 0
  const earthOk = s.earth_visible[i] === true

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className={`glass-strong p-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <button type="button" className="btn-primary !px-3 !py-1.5" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        {showSpeeds && (
          <div className="flex gap-1">
            {SPEEDS.map((v) => <button key={v} type="button" className="chip !px-2 !py-0.5 !text-[10px]" data-active={speed === v} onClick={() => setSpeed(v)}>{v}×</button>)}
          </div>
        )}
        <div className="min-w-0">
          <div className="label-caps !text-[0.55rem]">{title} · sample {i + 1}/{n}{fps ? ` · ${fps * speed} steps/s` : ''}</div>
          <div className="num truncate text-xs text-accent">{s.t_utc[i]}</div>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <IconSun className={`h-3.5 w-3.5 ${sunUp ? 'text-sun-bright' : 'text-ink-muted'}`} />
          <span className="text-ink-dim">az {String(s.sun_az[i])}° · el <span className={sunUp ? 'text-sun-bright' : 'text-ink-muted'}>{String(s.sun_el[i])}°</span></span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <IconEarth className={`h-3.5 w-3.5 ${earthOk ? 'text-earth-bright' : 'text-danger'}`} />
          <span className="text-ink-dim">az {String(s.earth_az[i])}° · el <span className={earthOk ? 'text-earth-bright' : 'text-danger'}>{String(s.earth_el[i])}°</span> · {earthOk ? 'visible' : 'not visible'}</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={n - 1}
        step={1}
        value={i}
        onChange={(e) => { setPlaying(false); onIndex(Number(e.target.value)) }}
        className="range mt-2.5"
        style={{ '--fill': `${(i / Math.max(1, n - 1)) * 100}%` }}
        aria-label="Timestep"
      />
      <div className="mt-2">
        <StatusStrip series={s} stepMin={data.request.step_min} theme="dark" cursor={i} onSelect={(k) => { setPlaying(false); onIndex(k) }} height={14} showLegend={false} />
      </div>
    </motion.div>
  )
}
