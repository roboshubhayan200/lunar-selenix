import { motion } from 'framer-motion'
import { fmtNumber } from '../../lib/format.js'
import { IconSun, IconMoon, IconEarth, IconSignal, IconBattery, IconTarget } from '../ui/index.jsx'

const META = {
  sunlit_pct: { tone: 'text-sun-bright', bar: 'from-sun-bright/70', icon: IconSun },
  max_continuous_dark_hr: { tone: 'text-violet', bar: 'from-violet/70', icon: IconMoon },
  earth_visible_pct: { tone: 'text-earth-bright', bar: 'from-earth-bright/70', icon: IconEarth },
  longest_comms_gap_hr: { tone: 'text-comms-bright', bar: 'from-comms-bright/70', icon: IconSignal },
  energy_vertical: { tone: 'text-sun-bright', bar: 'from-sun-bright/70', icon: IconSun },
  energy_horizontal: { tone: 'text-sun', bar: 'from-sun/70', icon: IconSun },
  max_sun_elevation_deg: { tone: 'text-sun-bright', bar: 'from-sun-bright/70', icon: IconTarget },
  battery_required_wh: { tone: 'text-violet', bar: 'from-violet/70', icon: IconBattery },
}

/** Display rules in lib/format.js; exact backend value printed under each tile. sunlit_pct is already 0–100. */
function display(value, unit) {
  return fmtNumber(value, unit, { withUnit: unit === '%' || unit === '°' })
}

const tile = { hidden: { opacity: 0, y: 10, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }

export default function SummaryGrid({ summary, roomy = false }) {
  return (
    <motion.div variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} initial="hidden" animate="show" className={roomy ? 'grid grid-cols-2 gap-4 lg:grid-cols-4' : 'grid grid-cols-2 gap-2 xl:grid-cols-4'}>
      {summary.map((s) => {
        const m = META[s.key] || META.sunlit_pct
        const Icon = m.icon
        const unitSuffix = s.unit === '%' || s.unit === '°' ? null : s.unit
        return (
          <motion.div key={s.key} variants={tile} className={`glass relative overflow-hidden ${roomy ? 'p-5' : 'p-3'}`}>
            <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${m.bar} via-transparent to-transparent`} />
            <div className="flex items-start justify-between gap-2">
              <div className={roomy ? 'font-display text-sm font-medium text-ink-dim' : 'label-caps !text-[0.58rem] leading-tight'}>{s.label}</div>
              <Icon className={`${roomy ? 'h-5 w-5' : 'h-3.5 w-3.5'} shrink-0 opacity-80 ${m.tone}`} />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <div className={`num font-semibold leading-none ${roomy ? 'text-3xl' : 'text-lg xl:text-xl'} ${m.tone}`}>{display(s.value, s.unit)}</div>
              {unitSuffix && <div className={`num text-ink-muted ${roomy ? 'text-sm' : 'text-[10px]'}`}>{unitSuffix}</div>}
            </div>
            <div className={`num text-ink-muted ${roomy ? 'mt-3 break-all text-[10px]' : 'mt-1.5 truncate text-[9px]'}`} title={`${s.sourceKey ?? s.key} = ${s.value}`}>
              {s.sourceKey ?? s.key}: {s.value == null ? 'not returned' : String(s.value)}
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
