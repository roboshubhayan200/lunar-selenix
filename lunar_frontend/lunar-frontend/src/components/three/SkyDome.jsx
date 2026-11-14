import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import StarField from './StarField.jsx'
import ErrorBoundary from '../ui/ErrorBoundary.jsx'

const DEG = Math.PI / 180
const SKY_R = 46
const GROUND_R = 40

/** Azimuth from North, clockwise (East = 90°). North = -Z, East = +X. */
function dirFromAzEl(az, el) {
  const a = az * DEG, e = el * DEG
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a))
}

function makeGlowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.2, 'rgba(255,240,200,0.8)')
  g.addColorStop(0.5, 'rgba(255,200,100,0.25)')
  g.addColorStop(1, 'rgba(255,180,60,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  return t
}

/* ------------------------------------------------------------------ */

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[GROUND_R, 96]} />
        <meshStandardMaterial color="#5b5853" roughness={1} metalness={0} />
      </mesh>
      {/* subtle concentric distance rings */}
      {[5, 10, 20].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[r - 0.02, r + 0.02, 96]} />
          <meshBasicMaterial color="#38d9f5" transparent opacity={0.08} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* horizon ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[GROUND_R - 0.25, GROUND_R, 128]} />
        <meshBasicMaterial color="#38d9f5" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* compass */}
      {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([l, az]) => {
        const p = dirFromAzEl(az, 0).multiplyScalar(GROUND_R - 3)
        return (
          <Html key={l} position={[p.x, 0.6, p.z]} center style={{ pointerEvents: 'none' }}>
            <div className="font-mono text-[11px] tracking-[0.2em] text-accent/80">{l}</div>
          </Html>
        )
      })}
    </group>
  )
}

function Lander({ earthDir, sunDir }) {
  const dish = useRef()
  const panel = useRef()
  useFrame(() => {
    if (dish.current && earthDir) dish.current.lookAt(earthDir.clone().multiplyScalar(100))
    if (panel.current && sunDir) {
      // vertical Sun-tracking panel: rotate about Y only
      const a = Math.atan2(sunDir.x, -sunDir.z)
      panel.current.rotation.y = a
    }
  })
  return (
    <group>
      {/* body */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[1.1, 0.6, 1.1]} />
        <meshStandardMaterial color="#c9c3b6" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.98, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.45, 0.2, 8]} />
        <meshStandardMaterial color="#d8b25c" roughness={0.3} metalness={0.8} />
      </mesh>
      {/* legs */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4
        return (
          <mesh key={i} position={[Math.cos(a) * 0.85, 0.3, Math.sin(a) * 0.85]} rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.8, 6]} />
            <meshStandardMaterial color="#9a9a9a" metalness={0.6} roughness={0.4} />
          </mesh>
        )
      })}
      {/* mast */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 1.2, 8]} />
        <meshStandardMaterial color="#e8e8e8" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* high-gain dish */}
      <group ref={dish} position={[0, 2.2, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <coneGeometry args={[0.32, 0.14, 24, 1, true]} />
          <meshStandardMaterial color="#f0f0f0" side={THREE.DoubleSide} metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.18]}>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshBasicMaterial color="#38d9f5" />
        </mesh>
      </group>
      {/* vertical solar panel on a boom */}
      <group ref={panel} position={[0, 1.05, 0]}>
        <mesh position={[0.9, 0.55, 0]} castShadow>
          <boxGeometry args={[0.04, 1.1, 1.6]} />
          <meshStandardMaterial color="#1a2a5c" metalness={0.8} roughness={0.25} emissive="#0b1b45" emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0.45, 0.55, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.9, 6]} />
          <meshStandardMaterial color="#9a9a9a" />
        </mesh>
      </group>
    </group>
  )
}

function SunBody({ dir, frac, el }) {
  const glow = useMemo(() => makeGlowTexture(), [])
  const pos = dir.clone().multiplyScalar(SKY_R)
  const visible = el > -1.2
  const alpha = THREE.MathUtils.clamp(frac, 0, 1)
  return (
    <group position={pos} visible={visible}>
      <mesh>
        <sphereGeometry args={[0.55, 24, 24]} />
        <meshBasicMaterial color="#fff6dc" transparent opacity={0.3 + 0.7 * alpha} />
      </mesh>
      <sprite scale={[7 + 6 * alpha, 7 + 6 * alpha, 1]}>
        <spriteMaterial map={glow} transparent opacity={0.35 + 0.65 * alpha} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      <Html position={[0, 1.8, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="glass-strong whitespace-nowrap px-2 py-1 font-mono text-[10px] text-sun-bright">
          Sun · el {el.toFixed(2)}° · {Math.round(frac * 100)}% disk
        </div>
      </Html>
    </group>
  )
}

function EarthBody({ dir, el, visible }) {
  const pos = dir.clone().multiplyScalar(SKY_R)
  const show = el > -1.5
  return (
    <group position={pos} visible={show}>
      <mesh>
        <sphereGeometry args={[1.1, 32, 32]} />
        <meshStandardMaterial color="#3b84e8" emissive="#1e5fd0" emissiveIntensity={0.9} roughness={0.6} />
      </mesh>
      <mesh scale={1.14}>
        <sphereGeometry args={[1.1, 32, 32]} />
        <meshBasicMaterial color="#7ab8ff" transparent opacity={0.16} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <Html position={[0, 2.4, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`glass-strong whitespace-nowrap px-2 py-1 font-mono text-[10px] ${visible ? 'text-earth-bright' : 'text-danger'}`}>
          Earth · el {el.toFixed(2)}° · {visible ? 'direct link' : 'below horizon'}
        </div>
      </Html>
    </group>
  )
}

/** Animated packets travelling from the mast to Earth when a link exists. */
function SignalBeam({ earthPos, active }) {
  const n = 7
  const refs = useRef([])
  const start = useMemo(() => new THREE.Vector3(0, 2.2, 0), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.22
    refs.current.forEach((m, i) => {
      if (!m) return
      const s = (t + i / n) % 1
      m.position.lerpVectors(start, earthPos, s)
      m.material.opacity = active ? 0.9 * (1 - Math.abs(s - 0.5) * 0.6) : 0
    })
  })
  if (!earthPos) return null
  return (
    <group>
      <Line points={[start, earthPos]} color="#38d9f5" lineWidth={1} transparent opacity={active ? 0.25 : 0.0} dashed dashSize={0.6} gapSize={0.4} />
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshBasicMaterial color="#7ee8fa" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Lights({ sunDir, sunFrac, earthVisible }) {
  const light = useRef()
  useFrame(() => {
    if (!light.current) return
    light.current.position.copy(sunDir.clone().multiplyScalar(30))
    light.current.intensity = 0.15 + 3.2 * sunFrac
  })
  return (
    <>
      <ambientLight intensity={earthVisible ? 0.5 : 0.22} color="#8fb0ff" />
      <hemisphereLight intensity={0.25} color="#9fb6ff" groundColor="#2a2621" />
      <pointLight position={[1.4, 2.6, 1.2]} intensity={6} distance={9} decay={2} color="#cfe6ff" />
      <directionalLight ref={light} castShadow color="#fff4e0" intensity={1}
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-near={1} shadow-camera-far={80}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14}
        shadow-bias={-0.0005}
      />
    </>
  )
}

function CameraSetter({ lookAt }) {
  const { camera } = useThree()
  const target = useRef(null)
  useEffect(() => {
    if (!lookAt) return
    const horiz = dirFromAzEl(lookAt.az, 0)
    const to = horiz.clone().multiplyScalar(-8).add(new THREE.Vector3(0, 2.6, 0))
    target.current = { to, t: 0 }
  }, [lookAt])
  useFrame((_, delta) => {
    const f = target.current
    if (!f) return
    f.t = Math.min(1, f.t + delta / 1.1)
    const s = f.t < 0.5 ? 4 * f.t ** 3 : 1 - Math.pow(-2 * f.t + 2, 3) / 2
    camera.position.lerp(f.to, s * 0.35 + 0.05)
    if (f.t >= 1) target.current = null
  })
  return null
}

/**
 * Local-sky 3D view from the landing site at one instant.
 */
export default function SkyDome({ sunAz = 0, sunEl = 0, sunFrac = 0, earthAz = 0, earthEl = 0, earthVisible = false, lookAt, className = '' }) {
  const sunDir = useMemo(() => dirFromAzEl(sunAz, sunEl), [sunAz, sunEl])
  const earthDir = useMemo(() => dirFromAzEl(earthAz, earthEl), [earthAz, earthEl])
  const earthPos = useMemo(() => earthDir.clone().multiplyScalar(SKY_R), [earthDir])
  const initialCam = useMemo(() => {
    const horiz = dirFromAzEl(earthAz, 0)
    const p = horiz.multiplyScalar(-8).add(new THREE.Vector3(0, 2.6, 0))
    return [p.x, p.y, p.z]
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative h-full w-full ${className}`}>
      <ErrorBoundary label="Local sky">
      <Canvas shadows camera={{ position: initialCam, fov: 50, near: 0.1, far: 400 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} style={{ background: 'transparent' }}>
        <Suspense fallback={null}>
          <StarField count={1800} radius={140} />
          <Lights sunDir={sunDir} sunFrac={sunFrac} earthVisible={earthVisible} />
          <Ground />
          <Lander earthDir={earthDir} sunDir={sunDir} />
          <SunBody dir={sunDir} frac={sunFrac} el={sunEl} />
          <EarthBody dir={earthDir} el={earthEl} visible={earthVisible} />
          <SignalBeam earthPos={earthPos} active={earthVisible} />
          <CameraSetter lookAt={lookAt} />
          <OrbitControls target={[0, 1.2, 0]} enablePan={false} minDistance={3} maxDistance={30} maxPolarAngle={Math.PI / 2 - 0.02} enableDamping dampingFactor={0.08} makeDefault />
        </Suspense>
      </Canvas>
      </ErrorBoundary>
    </div>
  )
}
