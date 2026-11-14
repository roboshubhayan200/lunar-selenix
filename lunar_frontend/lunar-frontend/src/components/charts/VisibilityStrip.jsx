import { useCallback, useRef } from 'react'
import { fmtHours } from '../../lib/analysis.js'

const W = 1000
const ROW_H = 22
const GAP = 8
const PAD_TOP = 14
const AXIS_H = 18

/**
 * Two-lane illumination / comms strip with a draggable time cursor.
 *   lane 1: Sun  (lit runs in amber on a dark track)
 *   lane 2: Earth (direct-link windows in blue on a dark track)
 */
export default function VisibilityStrip({ stats, cursorDay, onScrub, spanDays }) {
  const svgRef = useRef()
  const dragging = useRef(false)

  const dayToX = (d) => (d / spanDays) * W
  const H = PAD_TOP + ROW_H * 2 + GAP + AXIS_H

  const handlePointer = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    onScrub?.(frac * spanDays)
  }, [onScrub, spanDays])

  const tickStep = spanDays > 60 ? 10 : spanDays > 30 ? 5 : spanDays > 10 ? 2 : 1
  const ticks = []
  for (let d = 0; d <= spanDays + 1e-6; d += tickStep) ticks.push(d)

  const both = stats.litRuns.flatMap((lr) =>
    stats.commWindows
      .map((cw) => ({ startDay: Math.max(lr.startDay, cw.startDay), endDay: Math.min(lr.endDay, cw.endDay) }))
      .filter((r) => r.endDay > r.startDay),
  )

  return (
    <div className="select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[92px] w-full cursor-ew-resize touch-none"
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e) }}
        onPointerMove={(e) => { if (dragging.current) handlePointer(e) }}
        onPointerUp={(e) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId) }}
      >
        <defs>
          <linearGradient id="litGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f2b134" />
            <stop offset="1" stopColor="#c98500" />
          </linearGradient>
          <linearGradient id="earthGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#6da7ec" />
            <stop offset="1" stopColor="#3987e5" />
          </linearGradient>
        </defs>

        {/* tracks */}
        <rect x={0} y={PAD_TOP} width={W} height={ROW_H} rx={4} fill="rgba(6,10,20,0.9)" stroke="rgba(167,180,211,0.12)" />
        <rect x={0} y={PAD_TOP + ROW_H + GAP} width={W} height={ROW_H} rx={4} fill="rgba(6,10,20,0.9)" stroke="rgba(167,180,211,0.12)" />

        {/* lit runs */}
        {stats.litRuns.map((r, i) => (
          <rect key={`l${i}`} x={dayToX(r.startDay)} y={PAD_TOP + 2} width={Math.max(1.2, dayToX(r.endDay) - dayToX(r.startDay))} height={ROW_H - 4} rx={3} fill="url(#litGrad)" />
        ))}
        {/* comm windows */}
        {stats.commWindows.map((r, i) => (
          <rect key={`e${i}`} x={dayToX(r.startDay)} y={PAD_TOP + ROW_H + GAP + 2} width={Math.max(1.2, dayToX(r.endDay) - dayToX(r.startDay))} height={ROW_H - 4} rx={3} fill="url(#earthGrad)" />
        ))}
        {/* both available — thin aqua ticks between lanes */}
        {both.slice(0, 400).map((r, i) => (
          <rect key={`b${i}`} x={dayToX(r.startDay)} y={PAD_TOP + ROW_H + 2} width={Math.max(1, dayToX(r.endDay) - dayToX(r.startDay))} height={GAP - 4} fill="#22b58a" opacity={0.9} />
        ))}

        {/* axis */}
        {ticks.map((d) => (
          <g key={d} transform={`translate(${dayToX(d)}, ${PAD_TOP + ROW_H * 2 + GAP})`}>
            <line y1={0} y2={5} stroke="rgba(167,180,211,0.3)" />
            <text y={15} textAnchor={d === 0 ? 'start' : d >= spanDays - tickStep / 2 ? 'end' : 'middle'} fontSize={11} fontFamily="JetBrains Mono" fill="#6b7a9c" style={{ fontSize: 11 }}>D+{d}</text>
          </g>
        ))}

        {/* cursor */}
        {cursorDay != null && (
          <g transform={`translate(${dayToX(cursorDay)}, 0)`}>
            <line y1={4} y2={H - AXIS_H + 4} stroke="#38d9f5" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <polygon points="-5,0 5,0 0,7" fill="#38d9f5" />
          </g>
        )}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-sun-bright" />Sun above horizon · {fmtHours(stats.sunlitHours)}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-earth-bright" />Earth in view · {fmtHours(stats.earthHours)}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-comms-bright" />Both · {fmtHours(stats.bothHours)}</span>
        <span className="ml-auto hidden sm:inline">drag to scrub</span>
      </div>
    </div>
  )
}
