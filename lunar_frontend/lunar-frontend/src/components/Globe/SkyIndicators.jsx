import { useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { latLonToVector3 } from '../../lib/lunar.js'
import { SURFACE_R } from './SiteMarker.jsx'

const D2R = Math.PI / 180
const UP_Y = new THREE.Vector3(0, 1, 0)

/**
 * Local East-North-Up basis at a site on the globe.
 * up = surface normal; north = direction of increasing latitude; east = north × up.
 */
function enuBasis(lat, lon) {
  const up = latLonToVector3(lat, lon, 1).normalize()
  let north = UP_Y.clone().sub(up.clone().multiplyScalar(up.dot(UP_Y)))
  if (north.lengthSq() < 1e-10) north = new THREE.Vector3(1, 0, 0) // exactly at a pole
  north.normalize()
  const east = north.clone().cross(up).normalize()
  return { up, north, east }
}

/** Backend convention: az 0° = North, 90° = East; el above local horizon. */
function skyDir(basis, azDeg, elDeg) {
  const az = azDeg * D2R
  const el = elDeg * D2R
  return basis.east.clone().multiplyScalar(Math.cos(el) * Math.sin(az))
    .add(basis.north.clone().multiplyScalar(Math.cos(el) * Math.cos(az)))
    .add(basis.up.clone().multiplyScalar(Math.sin(el)))
}

function Body({ origin, basis, az, el, R, color, label, visible, kind }) {
  const above = el > 0
  const dir = skyDir(basis, az, el)
  const pos = origin.clone().add(dir.clone().multiplyScalar(R))
  // Below the horizon the body is inside the Moon; anchor its label on the horizon at that azimuth.
  const horizonPos = origin.clone().add(skyDir(basis, az, 0).multiplyScalar(R))
  const anchor = above ? pos : horizonPos
  const dim = !above || (kind === 'earth' && !visible)
  return (
    <group>
      <Line points={[origin, above ? pos : horizonPos]} color={color} lineWidth={1.5} transparent opacity={dim ? 0.35 : 0.9} dashed={!above} dashSize={0.01} gapSize={0.008} />
      {above && (
        <>
          <mesh position={pos}>
            <sphereGeometry args={[kind === 'sun' ? 0.022 : 0.018, 24, 24]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          <mesh position={pos}>
            <sphereGeometry args={[kind === 'sun' ? 0.045 : 0.03, 24, 24]} />
            <meshBasicMaterial color={color} transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
      <Html position={anchor} center zIndexRange={[70, 0]} style={{ pointerEvents: 'none' }}>
        <div className="glass-strong whitespace-nowrap !rounded-lg px-2 py-1 font-mono text-[10px] leading-tight" style={{ borderColor: `${color}88`, opacity: dim ? 0.75 : 1, transform: 'translateY(-130%)' }}>
          <div style={{ color }} className="font-semibold">{label}{!above ? ' · below horizon' : kind === 'earth' && !visible ? ' · not visible' : ''}</div>
          <div className="text-ink-dim">az {Number(az).toFixed(1)}° · el {Number(el).toFixed(1)}°</div>
        </div>
      </Html>
    </group>
  )
}

/**
 * Sun & Earth as seen from a landing site at one timestep, drawn on a small
 * sky dome above the site. Values come straight from the timeline arrays.
 */
export default function SkyIndicators({ lat, lon, sunAz, sunEl, earthAz, earthEl, earthVisible, radius = 0.26 }) {
  const basis = useMemo(() => enuBasis(lat, lon), [lat, lon])
  const origin = useMemo(() => latLonToVector3(lat, lon, SURFACE_R + 0.004), [lat, lon])
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP_Y, basis.up), [basis])
  const northTip = useMemo(() => origin.clone().add(basis.north.clone().multiplyScalar(radius * 1.12)), [origin, basis, radius])

  return (
    <group>
      {/* local horizon ring + compass */}
      <group position={origin} quaternion={quat}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 0.985, radius, 96]} />
          <meshBasicMaterial color="#38d9f5" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[radius, 96]} />
          <meshBasicMaterial color="#38d9f5" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      <Html position={northTip} center zIndexRange={[65, 0]} style={{ pointerEvents: 'none' }}>
        <span className="font-mono text-[10px] font-bold text-accent">N</span>
      </Html>
      <Body origin={origin} basis={basis} az={sunAz} el={sunEl} R={radius} color="#f2b134" label="Sun" kind="sun" visible />
      <Body origin={origin} basis={basis} az={earthAz} el={earthEl} R={radius * 0.82} color="#6da7ec" label="Earth" kind="earth" visible={earthVisible === true} />
    </group>
  )
}
