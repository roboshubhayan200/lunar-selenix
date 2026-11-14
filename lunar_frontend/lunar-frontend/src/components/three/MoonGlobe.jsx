import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import StarField from './StarField.jsx'
import ErrorBoundary from '../ui/ErrorBoundary.jsx'
import { FEATURES, KIND_COLORS, latLonToVector3, vector3ToLatLon, fmtLat, fmtLon } from '../../lib/lunar.js'

const UP = new THREE.Vector3(0, 1, 0)
const SURFACE_R = 1.0

/* ------------------------------------------------------------------ */
/*  Moon surface                                                       */
/* ------------------------------------------------------------------ */

function MoonMesh({ onPick, onHoverPoint, onReady, interactive, quality }) {
  const gl = useThree((s) => s.gl)
  const texFile = quality === 'low' ? '/moon_texture_2k.jpg' : '/moon_texture.jpg'
  const maxAniso = gl.capabilities.getMaxAnisotropy()
  const [map, bump] = useTexture([texFile, '/moon_displacement.jpg'], (textures) => {
    const [m, b] = Array.isArray(textures) ? textures : [textures]
    m.colorSpace = THREE.SRGBColorSpace
    m.anisotropy = maxAniso
    m.needsUpdate = true
    if (b) { b.anisotropy = 4; b.needsUpdate = true }
  })

  useEffect(() => { onReady?.() }, [onReady])

  const segments = quality === 'low' ? 96 : 192

  return (
    <mesh
      onClick={(e) => {
        if (!interactive) return
        if (e.delta > 5) return // drag, not a click
        e.stopPropagation()
        const { lat, lon } = vector3ToLatLon(e.point)
        onPick?.({ lat, lon })
      }}
      onPointerMove={(e) => {
        if (!interactive) return
        onHoverPoint?.(e.point)
      }}
      onPointerOut={() => onHoverPoint?.(null)}
    >
      <sphereGeometry args={[SURFACE_R, segments, segments]} />
      <meshStandardMaterial
        map={map}
        bumpMap={bump}
        bumpScale={quality === 'low' ? 0.35 : 0.6}
        displacementMap={bump}
        displacementScale={0.012}
        displacementBias={-0.006}
        roughness={1}
        metalness={0}
      />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/*  Limb glow (subtle fresnel rim)                                     */
/* ------------------------------------------------------------------ */

const glowVert = /* glsl */ `
  varying float vF;
  void main() {
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 v = normalize(-mv.xyz);
    vF = pow(1.0 - abs(dot(n, v)), 3.2);
    gl_Position = projectionMatrix * mv;
  }
`
const glowFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vF;
  void main() {
    gl_FragColor = vec4(uColor, vF * uIntensity);
  }
`

function LimbGlow() {
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color('#7ee8fa') }, uIntensity: { value: 0.42 } }), [])
  return (
    <mesh scale={1.035}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial vertexShader={glowVert} fragmentShader={glowFrag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/*  Lat/lon graticule                                                  */
/* ------------------------------------------------------------------ */

function Graticule({ step = 15, r = 1.006 }) {
  const geom = useMemo(() => {
    const pts = []
    const push = (a, b) => { pts.push(a.x, a.y, a.z, b.x, b.y, b.z) }
    // parallels
    for (let lat = -90 + step; lat < 90; lat += step) {
      for (let lon = -180; lon < 180; lon += 3) {
        push(latLonToVector3(lat, lon, r), latLonToVector3(lat, lon + 3, r))
      }
    }
    // meridians
    for (let lon = -180; lon < 180; lon += step) {
      for (let lat = -90; lat < 90; lat += 3) {
        push(latLonToVector3(lat, lon, r), latLonToVector3(lat + 3, lon, r))
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [step, r])

  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color="#38d9f5" transparent opacity={0.13} depthWrite={false} />
    </lineSegments>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers for labels: fade when facing away or too far                */
/* ------------------------------------------------------------------ */

function useFacing(positionRef, onUpdate) {
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    const p = positionRef.current
    if (!p) return
    tmp.copy(camera.position).normalize()
    const facing = p.clone().normalize().dot(tmp)
    const dist = camera.position.length()
    onUpdate(facing, dist)
  })
}

/* ------------------------------------------------------------------ */
/*  Feature label                                                      */
/* ------------------------------------------------------------------ */

const TIER_MAX_DIST = { 1: Infinity, 2: 3.1, 3: 2.05 }

function FeatureLabel({ feature, onSelect, highlight }) {
  const pos = useMemo(() => latLonToVector3(feature.lat, feature.lon, SURFACE_R + 0.004), [feature])
  const posRef = useRef(pos)
  const dotRef = useRef()
  const elRef = useRef()
  const color = KIND_COLORS[feature.kind] || '#a7b4d3'

  useFacing(posRef, (facing, dist) => {
    const near = dist < TIER_MAX_DIST[feature.tier]
    const alpha = near ? THREE.MathUtils.clamp((facing - 0.12) / 0.25, 0, 1) : 0
    if (elRef.current) {
      elRef.current.style.opacity = alpha.toFixed(2)
      elRef.current.style.pointerEvents = alpha > 0.3 ? 'auto' : 'none'
    }
    if (dotRef.current) dotRef.current.visible = facing > -0.02 && near
  })

  const isArtemis = feature.kind === 'artemis'

  return (
    <group position={pos}>
      <mesh ref={dotRef}>
        <sphereGeometry args={[isArtemis ? 0.0055 : 0.004, 10, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
        <div
          ref={elRef}
          className="globe-label"
          style={{ opacity: 0, transform: 'translate(10px, -10px)', color: highlight ? '#38d9f5' : undefined }}
          onClick={(e) => { e.stopPropagation(); onSelect?.(feature) }}
          title={feature.note || feature.name}
        >
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: color, marginRight: 6, verticalAlign: 'middle', boxShadow: `0 0 6px ${color}` }} />
          {feature.name}
        </div>
      </Html>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  Site pin (selected or marker)                                      */
/* ------------------------------------------------------------------ */

export function SitePin({ lat, lon, label, color = '#38d9f5', primary = false, showCoords = true }) {
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

  const scale = primary ? 1 : 0.7
  const poleH = 0.07 * scale

  return (
    <group ref={groupRef} position={pos} quaternion={quat}>
      {/* surface rings */}
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
      {/* pole + head */}
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
            className="glass-strong"
            style={{
              padding: primary ? '6px 10px' : '4px 8px',
              borderRadius: 10,
              borderColor: `${color}66`,
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono)',
              fontSize: primary ? 11 : 10,
              color: 'var(--color-ink)',
              lineHeight: 1.35,
            }}
          >
            {label && <div style={{ color, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</div>}
            {showCoords && <div style={{ color: 'var(--color-ink-dim)' }}>{fmtLat(lat)} · {fmtLon(lon)}</div>}
          </div>
        </div>
      </Html>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  Hover reticle                                                      */
/* ------------------------------------------------------------------ */

function HoverReticle({ pointRef }) {
  const ref = useRef()
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const p = pointRef.current
    if (!p) { g.visible = false; return }
    g.visible = true
    const n = p.clone().normalize()
    g.position.copy(n.multiplyScalar(SURFACE_R + 0.004))
    g.quaternion.setFromUnitVectors(UP, g.position.clone().normalize())
  })
  return (
    <group ref={ref} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.010, 0.0115, 40]} />
        <meshBasicMaterial color="#eef3ff" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.0, 0.002, 12]} />
        <meshBasicMaterial color="#eef3ff" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  Camera: orbit controls, auto-rotate, fly-to                        */
/* ------------------------------------------------------------------ */

function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }

function CameraRig({ interactive, autoRotate, focus, hasSelection, onInteract }) {
  const controls = useRef()
  const rotating = useRef(true) // user-idle flag; combined with the autoRotate prop each frame
  const idleTimer = useRef()
  const flight = useRef(null)
  const { camera } = useThree()

  // Start a flight whenever `focus` changes.
  useEffect(() => {
    if (!focus) return
    const dist = focus.distance ?? THREE.MathUtils.clamp(camera.position.length(), 1.7, 2.6)
    const to = latLonToVector3(focus.lat, focus.lon, dist)
    flight.current = { from: camera.position.clone(), to, t: 0, duration: focus.duration ?? 1.5 }
    rotating.current = false
    clearTimeout(idleTimer.current)
  }, [focus, camera])

  useFrame((_, delta) => {
    if (controls.current) {
      controls.current.autoRotate = !!autoRotate && interactive !== false && rotating.current && !flight.current
    }
    const f = flight.current
    if (!f) return
    f.t = Math.min(1, f.t + delta / f.duration)
    const s = easeInOutCubic(f.t)
    const a = f.from.clone().normalize()
    const b = f.to.clone().normalize()
    if (a.dot(b) < -0.995) a.x += 0.01 // avoid degenerate lerp on antipodal targets
    const dir = a.lerp(b, s).normalize()
    const len = THREE.MathUtils.lerp(f.from.length(), f.to.length(), s)
    camera.position.copy(dir.multiplyScalar(len))
    camera.lookAt(0, 0, 0)
    if (f.t >= 1) flight.current = null
  })

  const handleStart = () => {
    flight.current = null
    rotating.current = false
    clearTimeout(idleTimer.current)
    onInteract?.()
  }
  const handleEnd = () => {
    clearTimeout(idleTimer.current)
    if (autoRotate && !hasSelection) {
      idleTimer.current = setTimeout(() => { rotating.current = true }, 14000)
    }
  }

  useEffect(() => () => clearTimeout(idleTimer.current), [])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={interactive}
      enablePan={false}
      minDistance={1.25}
      maxDistance={7}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      enableDamping
      dampingFactor={0.07}
      autoRotateSpeed={0.35}
      onStart={handleStart}
      onEnd={handleEnd}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Scene assembly                                                     */
/* ------------------------------------------------------------------ */

function Scene({ selected, onSelect, markers, focus, interactive, showLabels, showGrid, autoRotate, onReady, onInteract, onHover, quality, highlightFeature, stars }) {
  const hoverRef = useRef(null)
  const lastHover = useRef(0)

  return (
    <>
      <ambientLight intensity={0.16} color="#8fa6d8" />
      <directionalLight position={latLonToVector3(-22, 48, 10).toArray()} intensity={3.1} color="#fff6e8" />
      <directionalLight position={latLonToVector3(20, -140, 10).toArray()} intensity={0.1} color="#5f7fc0" />

      {stars && <StarField />}

      <MoonMesh
        onPick={onSelect}
        onHoverPoint={(p) => {
          hoverRef.current = p
          if (!onHover) return
          const now = performance.now()
          if (!p) { onHover(null); return }
          if (now - lastHover.current < 70) return
          lastHover.current = now
          onHover(vector3ToLatLon(p))
        }}
        onReady={onReady}
        interactive={interactive}
        quality={quality}
      />
      <LimbGlow />
      {showGrid && <Graticule />}

      {showLabels && FEATURES.map((f) => (
        <FeatureLabel key={f.name} feature={f} onSelect={(ft) => onSelect?.({ lat: ft.lat, lon: ft.lon, name: ft.name, fromFeature: true })} highlight={highlightFeature === f.name} />
      ))}

      {markers?.map((m, i) => (
        <SitePin key={`${m.name}-${i}`} lat={m.lat} lon={m.lon} label={m.name} color={m.color || '#9085e9'} showCoords={false} />
      ))}

      {selected && (
        <SitePin lat={selected.lat} lon={selected.lon} label={selected.name || 'Candidate site'} primary />
      )}

      {interactive && <HoverReticle pointRef={hoverRef} />}

      <CameraRig interactive={interactive} autoRotate={autoRotate} focus={focus} hasSelection={!!selected} onInteract={onInteract} />
    </>
  )
}

/**
 * Interactive 3D Moon.
 *
 * Props:
 *  - selected: {lat, lon, name?} | null — primary pin
 *  - onSelect({lat, lon, name?}) — called when the surface or a feature label is clicked
 *  - markers: [{lat, lon, name, color?}] — secondary pins (e.g. compare sites)
 *  - focus: {lat, lon, distance?, duration?, key} — fly the camera to look at this point when it changes
 *  - interactive, showLabels, showGrid, autoRotate, stars
 *  - quality: 'high' | 'low'
 */
export default function MoonGlobe({
  selected = null,
  onSelect,
  markers = [],
  focus = null,
  interactive = true,
  showLabels = true,
  showGrid = false,
  autoRotate = true,
  stars = true,
  quality = 'high',
  highlightFeature = null,
  onReady,
  onInteract,
  onHover,
  className = '',
  cameraPosition = [0, 0.7, 3.4],
}) {
  return (
    <div className={`relative h-full w-full ${interactive ? 'cursor-crosshair' : ''} ${className}`}>
      <ErrorBoundary label="Moon globe">
      <Canvas
        camera={{ position: cameraPosition, fov: 38, near: 0.05, far: 300 }}
        dpr={[1, quality === 'low' ? 1.25 : 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <Scene
            selected={selected}
            onSelect={onSelect}
            markers={markers}
            focus={focus}
            interactive={interactive}
            showLabels={showLabels}
            showGrid={showGrid}
            autoRotate={autoRotate}
            onReady={onReady}
            onInteract={onInteract}
            onHover={onHover}
            quality={quality}
            highlightFeature={highlightFeature}
            stars={stars}
          />
        </Suspense>
      </Canvas>
      </ErrorBoundary>
    </div>
  )
}
