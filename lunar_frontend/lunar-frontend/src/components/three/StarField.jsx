import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Two layers of point stars on a distant shell. The outer layer is dim and
 * dense; the inner layer is sparse and bright with a slow twinkle.
 */
export default function StarField({ count = 3200, radius = 60 }) {
  const dim = useRef()
  const bright = useRef()

  const { dimPos, brightPos, brightSize } = useMemo(() => {
    const rnd = mulberry32(1337)
    const mk = (n, rMin, rMax) => {
      const arr = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const u = rnd(), v = rnd()
        const theta = 2 * Math.PI * u
        const phi = Math.acos(2 * v - 1)
        const r = rMin + (rMax - rMin) * rnd()
        arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
        arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
        arr[i * 3 + 2] = r * Math.cos(phi)
      }
      return arr
    }
    const nb = Math.floor(count * 0.12)
    const sizes = new Float32Array(nb)
    for (let i = 0; i < nb; i++) sizes[i] = 0.6 + rnd() * 1.6
    return { dimPos: mk(count, radius * 0.8, radius * 1.3), brightPos: mk(nb, radius * 0.7, radius), brightSize: sizes }
  }, [count, radius])

  useFrame(({ clock }, delta) => {
    if (dim.current) dim.current.rotation.y += delta * 0.004
    if (bright.current) {
      bright.current.rotation.y += delta * 0.006
      const m = bright.current.material
      m.opacity = 0.75 + Math.sin(clock.elapsedTime * 1.7) * 0.15
    }
  })

  return (
    <group>
      <points ref={dim}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dimPos, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.16} sizeAttenuation color="#9fb0d8" transparent opacity={0.55} depthWrite={false} />
      </points>
      <points ref={bright}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[brightPos, 3]} />
          <bufferAttribute attach="attributes-size" args={[brightSize, 1]} />
        </bufferGeometry>
        <pointsMaterial size={0.34} sizeAttenuation color="#eef3ff" transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  )
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
