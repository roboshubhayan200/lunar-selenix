/* eslint-disable react-refresh/only-export-components */
import { validateDays, validateHeight, validateStepMin } from '../../api/client.js'

export const STEP_OPTIONS = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440]
export const DEFAULT_START = '2027-06-01' // backend default start

export function emptyConfig(overrides = {}) {
  return { name: '', lat: '', lon: '', height: '2', start: DEFAULT_START, days: '29.53', step: 60, ...overrides }
}

/** 2-decimal string for a coordinate field (or the original text if not numeric). */
export function fix2(v) {
  const n = Number(v)
  return v === '' || !Number.isFinite(n) ? v : n.toFixed(2)
}

/** Returns an error string or null. */
export function validateConfig(c) {
  const lat = Number(c.lat)
  const lon = Number(c.lon)
  if (c.lat === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) return 'lat_deg must be a number between -90 and 90.'
  if (c.lon === '' || !Number.isFinite(lon) || lon < -360 || lon > 360) return 'lon_deg must be a number between -360 and 360.'
  return validateHeight(c.height) || validateDays(c.days) || validateStepMin(c.step) || (!/^\d{4}-\d{2}-\d{2}$/.test(c.start) ? 'Start date is required.' : null)
}

/** Exact request body. lat/lon use the same 2-decimal value that the inputs display. */
export function configToRequest(c) {
  return {
    lat_deg: Number(Number(c.lat).toFixed(2)),
    lon_deg: Number(Number(c.lon).toFixed(2)),
    height_m: Number(c.height),
    start_utc: c.start,
    days: Number(c.days),
    step_min: Number(c.step),
  }
}

const field = 'w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[13px] text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
const lbl = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500'

export default function ConfigPanel({ id, config, onChange, presets, onRun, loading, error, result, disabled }) {
  const err = validateConfig(config)
  const set = (k, v) => onChange({ ...config, [k]: v })
  const accent = id === 'A' ? 'border-t-blue-700' : 'border-t-amber-600'

  const quickLoad = (name) => {
    const p = presets.find((x) => x.name === name)
    if (!p) return
    onChange({ ...config, name: p.name, lat: fix2(p.lat_deg), lon: fix2(p.lon_deg), height: String(p.height_m ?? 2.0) })
  }

  return (
    <section className={`rounded border border-slate-300 border-t-4 bg-white p-3 ${accent}`} aria-label={`Configuration ${id}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">Config {id}{config.name ? <span className="font-normal text-slate-500"> · {config.name}</span> : null}</h2>
        <select className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700" value="" onChange={(e) => quickLoad(e.target.value)} aria-label={`Quick load preset into config ${id}`}>
          <option value="">Quick Load…</option>
          {presets.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.lat_deg}, {p.lon_deg})</option>)}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label><span className={lbl}>lat_deg</span><input className={field} inputMode="decimal" value={config.lat} onChange={(e) => onChange({ ...config, lat: e.target.value, name: '' })} onBlur={() => set('lat', fix2(config.lat))} placeholder="-89.90" /></label>
        <label><span className={lbl}>lon_deg (E+)</span><input className={field} inputMode="decimal" value={config.lon} onChange={(e) => onChange({ ...config, lon: e.target.value, name: '' })} onBlur={() => set('lon', fix2(config.lon))} placeholder="0.00" /></label>
        <label><span className={lbl}>height_m</span><input className={field} type="number" min={0} step={0.5} value={config.height} onChange={(e) => set('height', e.target.value)} /></label>
        <label><span className={lbl}>start (UTC)</span><input className={field} type="date" value={config.start} onChange={(e) => set('start', e.target.value)} /></label>
        <label><span className={lbl}>days</span><input className={field} type="number" min={0.1} max={365.25} step={0.01} value={config.days} onChange={(e) => set('days', e.target.value)} /></label>
        <label><span className={lbl}>step_min</span>
          <select className={field} value={config.step} onChange={(e) => set('step', Number(e.target.value))}>
            {STEP_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-h-[1rem] text-[11px]">
          {err ? <span className="text-red-700">{err}</span>
            : error ? <span className="text-red-700">{error}</span>
            : loading ? <span className="text-slate-600">Fetching ephemeris from JPL Horizons…</span>
            : result ? <span className="font-mono text-slate-500">✓ {result.series.t_utc.length} samples · {result.series.t_utc[0]} → {result.series.t_utc[result.series.t_utc.length - 1]}</span>
            : <span className="text-slate-400">Not run</span>}
        </div>
        <button type="button" onClick={onRun} disabled={!!err || loading || disabled} className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {loading ? 'Running…' : 'Run Analysis'}
        </button>
      </div>
    </section>
  )
}
