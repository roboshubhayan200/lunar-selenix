import { IconBattery } from '../ui/index.jsx'
import { fmtNumber } from '../../lib/format.js'

/** Battery sizing straight from battery_required_wh (backend: load × longest night ÷ depth of discharge). */
export default function BatteryCard({ wh, darkHr }) {
  const ok = wh != null && Number.isFinite(Number(wh))
  return (
    <div className="glass relative overflow-hidden p-6">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
        <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet/15 text-violet"><IconBattery className="h-7 w-7" /></span>
        <div className="flex-1">
          <div className="label-caps">Battery sizing</div>
          <p className="mt-1 text-base leading-relaxed text-ink-dim">
            A site at this location needs <span className="num text-2xl font-semibold text-violet">{ok ? fmtNumber(wh, 'Wh') : '—'}</span> of battery storage to survive the longest night.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            The backend sizes the pack as <span className="font-mono text-ink-dim">continuous load × longest night ÷ depth of discharge</span>.
            {darkHr != null && <> The longest night here is <span className="num text-ink-dim">{fmtNumber(darkHr, 'hr')}</span>, so every hour of darkness adds directly to the battery mass the lander must carry.</>}
          </p>
          <div className="num mt-2 break-all text-[10px] text-ink-muted">battery_required_wh = {ok ? String(wh) : 'not returned'}</div>
        </div>
      </div>
    </div>
  )
}
