import * as THREE from 'three'

export const MOON_RADIUS_KM = 1737.4
export const EARTH_MOON_DISTANCE_KM = 384400
export const LIGHT_TIME_S = 1.282

const DEG = Math.PI / 180

/** Normalise an east longitude to the range [-180, 180). */
export function normalizeLon(lon) {
  let l = ((lon + 180) % 360 + 360) % 360 - 180
  if (l === -180) l = 180
  return l
}

/**
 * Lat/lon (degrees) -> point on a THREE.SphereGeometry of radius r.
 * This is the exact inverse of the UV mapping used by SphereGeometry, so a
 * texture centred on 0° longitude lines up with the computed coordinates.
 */
export function latLonToVector3(lat, lon, r = 1) {
  const theta = (90 - lat) * DEG
  const phi = (normalizeLon(lon) + 180) * DEG
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

/**
 * Point in the Moon mesh's LOCAL frame -> {lat, lon} in degrees.
 *
 *   lat = asin(y / r)          south is negative
 *   lon = atan2(-z, x)         west is negative, range (-180, 180]
 *
 * This is the exact inverse of latLonToVector3 (and of three.js
 * SphereGeometry's UV mapping, which places the texture's 0° meridian on +X
 * and +90° E on -Z). Note: the textbook form atan2(x, z) assumes 0° lies on
 * +Z; with this texture it would put every click 90° away from the terrain
 * under the cursor, so the -z/x form is the one that matches the surface.
 */
export function vector3ToLatLon(v) {
  const r = Math.hypot(v.x, v.y, v.z)
  const lat = Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) / DEG
  let lon = Math.atan2(-v.z, v.x) / DEG
  if (lon === -180) lon = 180
  return { lat, lon }
}

/** Fixed precision used for picked coordinates: 0.01° ≈ 300 m on the Moon (spec: 2 decimals). */
export const COORD_DECIMALS = 2
/** Round once at pick time so the displayed value IS the value sent to the API. */
export function roundCoord(v) {
  const p = 10 ** COORD_DECIMALS
  return Math.round(v * p) / p
}

/** Raw signed degrees, e.g. -89.90°. Never converts sign to N/S/E/W. */
export function fmtDeg(v, digits = 2) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${Number(v).toFixed(digits)}°`
}

/** Great-circle distance in km between two lunar coordinates. */
export function surfaceDistanceKm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG
  const dl = (lon2 - lon1) * DEG
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * MOON_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function fmtLat(lat, digits = 2) {
  return `${Math.abs(lat).toFixed(digits)}° ${lat < 0 ? 'S' : 'N'}`
}
export function fmtLon(lon, digits = 2) {
  const l = normalizeLon(lon)
  return `${Math.abs(l).toFixed(digits)}° ${l < 0 ? 'W' : 'E'}`
}
export function fmtCoord(lat, lon, digits = 2) {
  return `${fmtLat(lat, digits)}, ${fmtLon(lon, digits)}`
}

export function hemisphereLabel(lat, lon) {
  const ns = lat < 0 ? 'Southern' : 'Northern'
  const l = normalizeLon(lon)
  const side = Math.abs(l) <= 90 ? 'nearside' : 'farside'
  return `${ns} hemisphere · ${side}`
}

export function regionLabel(lat) {
  const a = Math.abs(lat)
  if (a >= 85) return 'Polar region'
  if (a >= 60) return 'High latitude'
  if (a >= 30) return 'Mid latitude'
  return 'Equatorial belt'
}

/**
 * Named lunar features. `tier` controls when the label appears on the globe:
 *   1 = always, 2 = when moderately zoomed, 3 = only when close (polar cluster).
 * `kind`: mare | crater | basin | site | artemis | mountain
 */
export const FEATURES = [
  // Artemis / south-pole candidates (match backend presets)
  { name: 'Shackleton', lat: -89.9, lon: 0.0, kind: 'artemis', tier: 1, note: 'South-pole crater; rim receives near-continuous sunlight, floor is permanently shadowed.' },
  { name: 'de Gerlache', lat: -88.5, lon: -86.5, kind: 'artemis', tier: 3, note: 'Crater west of Shackleton; rim is an Artemis III candidate region.' },
  { name: 'Connecting Ridge', lat: -89.4, lon: -138.0, kind: 'artemis', tier: 3, note: 'Ridge linking Shackleton and de Gerlache; extended illumination periods.' },
  { name: 'Malapert Massif', lat: -86.0, lon: 0.0, kind: 'mountain', tier: 2, note: 'High plateau with excellent direct Earth line-of-sight; proposed relay site.' },
  { name: 'Leibnitz Beta', lat: -85.3, lon: 31.0, kind: 'artemis', tier: 3, note: 'Elevated plateau south of Leibnitz crater; large flat landing area.' },
  { name: 'Nobile Rim', lat: -85.3, lon: 32.8, kind: 'artemis', tier: 3, note: 'Artemis III candidate region on the rim of Nobile crater.' },
  { name: 'Haworth', lat: -87.5, lon: -22.0, kind: 'artemis', tier: 3, note: 'Permanently shadowed interior may hold water ice.' },
  { name: 'Faustini', lat: -87.2, lon: 84.0, kind: 'artemis', tier: 3, note: 'Crater near the south pole with permanently shadowed regions.' },
  { name: 'Amundsen', lat: -84.3, lon: 85.6, kind: 'crater', tier: 3, note: 'Large south-polar crater with PSR-bearing floor.' },
  { name: 'Cabeus', lat: -84.9, lon: -35.5, kind: 'crater', tier: 3, note: 'LCROSS impact site (2009) that confirmed water ice.' },
  // Historic landing sites
  { name: 'Apollo 11 · Tranquility Base', lat: 0.674, lon: 23.473, kind: 'site', tier: 1, note: 'First crewed landing, 20 July 1969.' },
  { name: 'Apollo 17 · Taurus-Littrow', lat: 20.19, lon: 30.77, kind: 'site', tier: 2, note: 'Last Apollo landing, December 1972.' },
  { name: "Chang'e 4 · Von Kármán", lat: -45.45, lon: 177.6, kind: 'site', tier: 2, note: 'First farside soft landing (2019), relayed via Queqiao.' },
  { name: 'Chandrayaan-3', lat: -69.37, lon: 32.32, kind: 'site', tier: 2, note: 'Southern high-latitude landing, August 2023.' },
  // Maria
  { name: 'Mare Imbrium', lat: 32.8, lon: -15.6, kind: 'mare', tier: 1 },
  { name: 'Oceanus Procellarum', lat: 18.4, lon: -57.4, kind: 'mare', tier: 1 },
  { name: 'Mare Serenitatis', lat: 28.0, lon: 17.5, kind: 'mare', tier: 1 },
  { name: 'Mare Tranquillitatis', lat: 8.5, lon: 31.4, kind: 'mare', tier: 1 },
  { name: 'Mare Crisium', lat: 17.0, lon: 59.1, kind: 'mare', tier: 2 },
  { name: 'Mare Nubium', lat: -21.3, lon: -16.6, kind: 'mare', tier: 2 },
  { name: 'Mare Orientale', lat: -19.4, lon: -92.8, kind: 'basin', tier: 2 },
  { name: 'Mare Moscoviense', lat: 27.3, lon: 147.9, kind: 'mare', tier: 2 },
  { name: 'South Pole–Aitken Basin', lat: -53.0, lon: -169.0, kind: 'basin', tier: 1, note: 'Largest, oldest and deepest impact basin on the Moon.' },
  // Craters
  { name: 'Tycho', lat: -43.3, lon: -11.2, kind: 'crater', tier: 1 },
  { name: 'Copernicus', lat: 9.6, lon: -20.1, kind: 'crater', tier: 1 },
  { name: 'Aristarchus', lat: 23.7, lon: -47.4, kind: 'crater', tier: 2 },
  { name: 'Clavius', lat: -58.4, lon: -14.4, kind: 'crater', tier: 2 },
  { name: 'Plato', lat: 51.6, lon: -9.3, kind: 'crater', tier: 2 },
  { name: 'Aitken', lat: -16.8, lon: 173.4, kind: 'crater', tier: 2 },
  { name: 'Peary', lat: 88.6, lon: 33.0, kind: 'crater', tier: 2, note: 'North-polar crater with near-continuous rim illumination.' },
]

export const KIND_COLORS = {
  artemis: '#38d9f5',
  site: '#f2b134',
  mare: '#a7b4d3',
  basin: '#9085e9',
  crater: '#a7b4d3',
  mountain: '#22b58a',
}

export function nearestFeature(lat, lon) {
  let best = null
  for (const f of FEATURES) {
    const d = surfaceDistanceKm(lat, lon, f.lat, f.lon)
    if (!best || d < best.distanceKm) best = { feature: f, distanceKm: d }
  }
  return best
}

export function describeSite(lat, lon) {
  const near = nearestFeature(lat, lon)
  const parts = []
  if (near) {
    if (near.distanceKm < 25) parts.push(`At ${near.feature.name}`)
    else if (near.distanceKm < 400) parts.push(`${Math.round(near.distanceKm)} km from ${near.feature.name}`)
  }
  parts.push(regionLabel(lat))
  return { near, text: parts.join(' · ') }
}
