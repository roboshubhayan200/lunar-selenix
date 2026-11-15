/**
 * Low-precision Sun / Moon positions for the solar-system scene.
 * Formulas: Astronomical Almanac "low precision" series (Sun ≈0.01°, Moon ≈0.3–1°).
 * Good enough to get Moon phase, eclipse seasons and Earth's season right on screen;
 * NOT used for any site analysis — that comes from JPL Horizons via the backend.
 */
const D2R = Math.PI / 180
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0)

export const daysSinceJ2000 = (ms) => (ms - J2000_MS) / 86_400_000
const wrap = (deg) => ((deg % 360) + 360) % 360

/** Geocentric Sun: ecliptic longitude (deg) and distance (AU). */
export function sunPosition(d) {
  const L = wrap(280.460 + 0.9856474 * d)
  const g = wrap(357.528 + 0.9856003 * d) * D2R
  const lambda = wrap(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g))
  const rAU = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)
  return { lambda, rAU }
}

/** Geocentric Moon: ecliptic longitude/latitude (deg) and distance (km). */
export function moonPosition(d) {
  const Lp = wrap(218.316 + 13.176396 * d)
  const Mp = wrap(134.963 + 13.064993 * d) * D2R
  const F = wrap(93.272 + 13.229350 * d) * D2R
  const lambda = wrap(Lp + 6.289 * Math.sin(Mp))
  const beta = 5.128 * Math.sin(F)
  const distKm = 385001 - 20905 * Math.cos(Mp)
  return { lambda, beta, distKm }
}

/** Longitude of the Moon's ascending node (deg) — orbit ring orientation. */
export const moonNode = (d) => wrap(125.045 - 0.0529538 * d)

/** Greenwich mean sidereal time (deg). */
export const gmst = (d) => wrap(280.46061837 + 360.98564736629 * d)

/** Phase from Sun–Moon elongation. */
export function moonPhase(d) {
  const s = sunPosition(d)
  const m = moonPosition(d)
  const elong = wrap(m.lambda - s.lambda) // 0 = new, 180 = full
  const illum = (1 - Math.cos(elong * D2R)) / 2
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent']
  const name = names[Math.round(elong / 45) % 8]
  return { elong, illum, name, ageDays: (elong / 360) * 29.530589 }
}

/** Ecliptic (lambda, beta) -> scene direction. Ecliptic plane = XZ, north = +Y. */
export function eclipticToXYZ(lambdaDeg, betaDeg = 0, r = 1) {
  const l = lambdaDeg * D2R
  const b = betaDeg * D2R
  return [r * Math.cos(b) * Math.cos(l), r * Math.sin(b), -r * Math.cos(b) * Math.sin(l)]
}
