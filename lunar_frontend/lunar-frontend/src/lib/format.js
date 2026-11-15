/**
 * Display formatting rules (display only — the exact value is always kept
 * alongside, e.g. in a title attribute or "exact values" view):
 *   %, hr, °  → 1 decimal
 *   Wh        → 0 decimals
 *   kWh/m²    → 2 decimals (backend unit; 0 decimals would erase sub-kWh values)
 */
export const DECIMALS = { '%': 1, hr: 1, '°': 1, Wh: 0, 'Wh/m²': 0, 'kWh/m²': 2 }

export function fmtNumber(v, unit, { withUnit = true, signed = false } = {}) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const d = DECIMALS[unit] ?? 2
  const n = Number(v)
  const txt = n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  const sign = signed && n > 0 ? '+' : ''
  if (!withUnit || !unit) return `${sign}${txt}`
  return unit === '%' || unit === '°' ? `${sign}${txt}${unit}` : `${sign}${txt} ${unit}`
}
