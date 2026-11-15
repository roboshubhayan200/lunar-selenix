import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfigPanel, { configToRequest, emptyConfig, fix2, validateConfig } from './ConfigPanel.jsx'
import SummaryTable, { summaryRows, summaryTsv } from './SummaryTable.jsx'
import PlannerCharts from './PlannerCharts.jsx'
import StatusStrip from '../Common/StatusStrip.jsx'
import { useToast } from '../Common/Toast.jsx'
import { api } from '../../api/client.js'
import { copyText, downloadText, fileStamp, seriesToCsv } from '../../lib/ops.js'

const btn = 'rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'

function Section({ n, title, right, children }) {
  return (
    <section className="rounded border border-slate-300 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700"><span className="text-slate-400">{n} ·</span> {title}</h3>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

/**
 * Planner Mode — light, dense, no animation. Two independent timeline
 * configurations, compared side by side. Every number from /api/timeline.
 */
export default function PlannerView({ presets, backendOk, initialSite }) {
  const toast = useToast()
  const [cfg, setCfg] = useState(() => ({
    A: emptyConfig(initialSite ? { name: initialSite.name || '', lat: fix2(initialSite.lat), lon: fix2(initialSite.lon), height: String(initialSite.height_m ?? 2) } : {}),
    B: emptyConfig(),
  }))
  const [res, setRes] = useState({ A: null, B: null })
  const [loading, setLoading] = useState({ A: false, B: false })
  const [err, setErr] = useState({ A: null, B: null })
  const [exact, setExact] = useState(false)
  const ctrls = useRef({})

  // Prefill empty configs with the first two presets once they load.
  const pre = presets.sites
  useEffect(() => {
    if (pre.length < 2) return
    setCfg((c) => {
      const fill = (conf, p) => (conf.lat === '' && conf.lon === '' ? { ...conf, name: p.name, lat: fix2(p.lat_deg), lon: fix2(p.lon_deg), height: String(p.height_m ?? 2) } : conf)
      return { A: fill(c.A, pre[0]), B: fill(c.B, pre[c.A.lat === '' ? 1 : 0]) }
    })
  }, [pre])

  const run = useCallback(async (id, conf) => {
    if (validateConfig(conf)) return
    // Normalise the visible fields to exactly what is sent.
    setCfg((c) => ({ ...c, [id]: { ...c[id], lat: fix2(conf.lat), lon: fix2(conf.lon) } }))
    ctrls.current[id]?.abort()
    const ctrl = new AbortController()
    ctrls.current[id] = ctrl
    setLoading((l) => ({ ...l, [id]: true }))
    setErr((e) => ({ ...e, [id]: null }))
    try {
      const r = await api.timeline(configToRequest(conf), { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      setRes((x) => ({ ...x, [id]: r }))
    } catch (e) {
      if (e.cancelled || ctrl.signal.aborted) return
      setErr((x) => ({ ...x, [id]: e.message }))
      toast.error(e, `Config ${id} failed`)
    } finally {
      if (!ctrl.signal.aborted) setLoading((l) => ({ ...l, [id]: false }))
    }
  }, [toast])

  useEffect(() => () => Object.values(ctrls.current).forEach((c) => c?.abort()), [])

  const rows = useMemo(() => summaryRows(res.A, res.B), [res])
  const anyResult = res.A || res.B
  const bothValid = !validateConfig(cfg.A) && !validateConfig(cfg.B)

  const exportCsv = (id) => { const r = res[id]; downloadText(`selenix_${id}_${fileStamp(r.request)}.csv`, seriesToCsv(r, `Config ${id}`), 'text/csv') }
  const exportJson = (id) => { const r = res[id]; downloadText(`selenix_${id}_${fileStamp(r.request)}.json`, JSON.stringify({ request: r.request, response: r.raw }, null, 2), 'application/json') }
  const copySummary = async () => {
    const ok = await copyText(summaryTsv(rows, res.A?.request, res.B?.request))
    toast.push(ok ? { tone: 'info', title: 'Summary copied', message: 'Tab-separated, paste straight into Excel or Sheets.', duration: 3000 } : { title: 'Copy failed', message: 'The browser blocked clipboard access.' })
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 pb-10 pt-[4.25rem] text-slate-900 md:px-5" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="mx-auto max-w-[1600px] space-y-3">
        {/* Configurations */}
        <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <ConfigPanel id="A" config={cfg.A} onChange={(c) => setCfg((x) => ({ ...x, A: c }))} presets={pre} onRun={() => run('A', cfg.A)} loading={loading.A} error={err.A} result={res.A} disabled={backendOk === false} />
          <div className="flex items-center justify-center lg:flex-col">
            <button type="button" onClick={() => { run('A', cfg.A); run('B', cfg.B) }} disabled={!bothValid || loading.A || loading.B || backendOk === false} className="rounded bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              Compare<br className="hidden lg:block" /> A vs B
            </button>
          </div>
          <ConfigPanel id="B" config={cfg.B} onChange={(c) => setCfg((x) => ({ ...x, B: c }))} presets={pre} onRun={() => run('B', cfg.B)} loading={loading.B} error={err.B} result={res.B} disabled={backendOk === false} />
        </div>
        {backendOk === false && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">Backend offline. Start the Flask API on port 5000.</div>}
        {presets.error && <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">Could not load presets: {presets.error}</div>}

        {!anyResult && !(loading.A || loading.B) && (
          <div className="rounded border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Set up the configurations and press <b>Run Analysis</b> or <b>Compare A vs B</b>. Each run makes one /api/timeline call (≈5–15 s).</div>
        )}

        {anyResult && (
          <>
            <Section n="1" title="Summary comparison" right={
              <span className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] text-slate-600"><input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> Exact API values</label>
                <button type="button" className={btn} onClick={copySummary}>Copy Summary</button>
              </span>
            }>
              <div className="overflow-x-auto"><SummaryTable rows={rows} reqA={res.A?.request} reqB={res.B?.request} exact={exact} /></div>
              <p className="mt-1.5 text-[11px] text-slate-500">Difference = A − B. Green = A better, red = A worse (↑ higher is better, ↓ lower is better). Display: 1 decimal for % / hr / °, 0 for Wh. Hover a cell or tick "Exact API values" for the unrounded number. Energy is in kWh/m², the unit the backend returns.</p>
            </Section>

            <Section n="2" title="Timeline (shared crosshair)">
              <PlannerCharts resA={res.A} resB={res.B} />
            </Section>

            <Section n="3" title="Operational status strip">
              <div className="space-y-4">
                {['A', 'B'].map((id) => res[id] && (
                  <StatusStrip key={id} series={res[id].series} stepMin={res[id].request.step_min} theme="light" height={30} label={`Config ${id} · lat ${res[id].request.lat_deg.toFixed(2)}, lon ${res[id].request.lon_deg.toFixed(2)} · ${res[id].request.start_utc} · ${res[id].request.days} d`} />
                ))}
              </div>
            </Section>

            <Section n="4" title="Raw data export">
              <div className="flex flex-wrap items-center gap-4">
                {['A', 'B'].map((id) => (
                  <div key={id} className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-700">Config {id}:</span>
                    <button type="button" className={btn} disabled={!res[id]} onClick={() => exportCsv(id)}>Export CSV</button>
                    <button type="button" className={btn} disabled={!res[id]} onClick={() => exportJson(id)}>Export JSON</button>
                  </div>
                ))}
                <button type="button" className={btn} onClick={copySummary}>Copy Summary (TSV)</button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">CSV: every sample of the series (t_utc, sun_az, sun_el, sun_frac, earth_az, earth_el, earth_visible, irradiance_w_m2) at full precision. JSON: the request and the untouched API response.</p>
            </Section>
          </>
        )}
      </div>
    </main>
  )
}
