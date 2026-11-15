/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { latLonToVector3, fmtDeg } from '../../lib/lunar.js'

const UP = new THREE.Vector3(0, 1, 0)
export const SURFACE_R = 1.0

/** Calls onUpdate(facing, cameraDistance) every frame for a surface point. */
export function useFacing(positionRef, onUpdate) {
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    const p = positionRef.current
    if (!p) return
    tmp.copy(camera.position).normalize()
    onUpdate(p.clone().normalize().dot(tmp), camera.position.length())
  })
}

/**
 * Pin on the Moon surface.
 *  - lat/lon: the raw values (any east-longitude convention; geometry handles wrap)
 *  - rank: optional, shows a numbered badge (compare view)
 *  - primary: pulsing rings for the selected site
 */
export default function SiteMarker({ lat, lon, label, color = '#38d9f5', primary = false, showCoords = true, rank = null }) {
  const pos = useMemo(() => latLonToVector3(lat, lon, SURFACE_R), [lat, lon])
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, pos.clone().normalize()), [pos])
  const posRef = useRef(pos)
  const ringRef = useRef()
  const ring2Ref = useRef()
  const groupRef = useRef()
  const elRef = useRef()

  useEffect(() => { posRef.current = pos }, [pos])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ringRef.current) {
      const phase = (t % 1.8) / 1.8
      ringRef.current.scale.setScalar(1 + phase * 1.6)
      ringRef.current.material.opacity = (1 - phase) * 0.8
    }
    if (ring2Ref.current) {
      const phase = ((t + 0.9) % 1.8) / 1.8
      ring2Ref.current.scale.setScalar(1 + phase * 1.6)
      ring2Ref.current.material.opacity = (1 - phase) * 0.5
    }
  })

  useFacing(posRef, (facing) => {
    const alpha = THREE.MathUtils.clamp((facing - 0.05) / 0.2, 0, 1)
    if (elRef.current) elRef.current.style.opacity = alpha.toFixed(2)
    if (groupRef.current) groupRef.current.visible = facing > -0.08
  })

  const scale = primary ? 1 : 0.75
  const poleH = 0.07 * scale

  return (
    <group ref={groupRef} position={pos} quaternion={quat}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0015, 0]}>
        <ringGeometry args={[0.014 * scale, 0.017 * scale, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {primary && (
        <>
          <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <ringGeometry args={[0.016, 0.0175, 48]} />
            <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <ringGeometry args={[0.016, 0.0175, 48]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </>
      )}
      <mesh position={[0, poleH / 2, 0]}>
        <cylinderGeometry args={[0.0018, 0.0018, poleH, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, poleH + 0.006 * scale, 0]}>
        <sphereGeometry args={[0.007 * scale, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, poleH + 0.006 * scale, 0]}>
        <sphereGeometry args={[0.013 * scale, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <Html position={[0, poleH + 0.03, 0]} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={elRef} style={{ opacity: 0, transition: 'opacity 200ms ease', transform: 'translateY(-50%)' }}>
          <div
            className="glass-strong flex items-center gap-2"
            style={{
              padding: primary ? '6px 10px' : '4px 8px',
              borderRadius: 10,
              borderColor: `${color}88`,
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono)',
              fontSize: primary ? 11 : 10,
              color: 'var(--color-ink)',
              lineHeight: 1.35,
            }}
          >
            {rank != null && (
              <span style={{ background: color, color: '#04060d', borderRadius: 99, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{rank}</span>
            )}
            <span>
              {label && <span style={{ color, fontWeight: 600, letterSpacing: '0.04em', display: 'block' }}>{label}</span>}
              {showCoords && <span style={{ color: 'var(--color-ink-dim)', display: 'block' }}>lat {fmtDeg(lat, 2)} · lon {fmtDeg(lon, 2)}</span>}
            </span>
          </div>
        </div>
      </Html>
    </group>
  )
}
