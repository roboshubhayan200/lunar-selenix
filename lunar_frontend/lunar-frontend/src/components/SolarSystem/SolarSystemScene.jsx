/* eslint-disable react-refresh/only-export-components */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import StarField from '../Globe/StarField.jsx'
import ErrorBoundary from '../Common/ErrorBoundary.jsx'
import { daysSinceJ2000, sunPosition, moonPosition, moonNode, gmst, eclipticToXYZ } from './ephemeris.js'

/* Scene scale — deliberately NOT to scale (true scale would make Earth a pixel). */
export const SCALE = {
  sunR: 4.2,
  earthOrbit: 30,
  earthR: 1.25,
  moonOrbit: 4.6, // real: 60 Earth radii
  moonR: 0.34,    // ratio to Earth kept at the real 0.273
}
const EARTH_TILT = 23.44 * (Math.PI / 180)
const D2R = Math.PI / 180

/* ------------------------------------------------------------------ */
/*  Shared body-state ref (positions written each frame)               */
/* ------------------------------------------------------------------ */

function useBodies() {
  return useMemo(() => ({
    earth: new THREE.Vector3(),
    moon: new THREE.Vector3(),
    sun: new THREE.Vector3(0, 0, 0),
  }), [])
}

/* ------------------------------------------------------------------ */
/*  Sun                                                                */
/* ------------------------------------------------------------------ */

const sunVert = /* glsl */`
  varying vec3 vPos; varying vec3 vN; varying vec3 vV;
  void main(){
    vPos = position;
    vec4 wp = modelMatrix * vec4(position,1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`
const sunFrag = /* glsl */`
  uniform float uTime;
  varying vec3 vPos; varying vec3 vN; varying vec3 vV;
  float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
  void main(){
    vec3 p = normalize(vPos)*3.0;
    float n = fbm(p + vec3(uTime*0.05, uTime*0.03, -uTime*0.04));
    float g = fbm(p*4.0 - uTime*0.12);
    float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    vec3 hot = vec3(1.0, 0.93, 0.62);
    vec3 warm = vec3(1.0, 0.55, 0.12);
    vec3 col = mix(warm, hot, smoothstep(0.35, 0.75, n*0.7 + g*0.4));
    col *= 0.55 + 0.45*pow(mu, 0.45);         // limb darkening
    col += vec3(1.0,0.6,0.2) * pow(1.0-mu, 3.0) * 0.6;
    gl_FragColor = vec4(col*1.6, 1.0);
  }`

function glowTexture(inner = 'rgba(255,214,140,1)', mid = 'rgba(255,150,40,0.35)') {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grd.addColorStop(0, inner)
  grd.addColorStop(0.18, inner)
  grd.addColorStop(0.35, mid)
  grd.addColorStop(1, 'rgba(255,120,20,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Sun({ onSelect }) {
  const mat = useRef()
  const glowA = useMemo(() => glowTexture(), [])
  const glowB = useMemo(() => glowTexture('rgba(255,190,110,0.55)', 'rgba(255,120,40,0.12)'), [])
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  useFrame((_, dt) => { if (mat.current) mat.current.uniforms.uTime.value += dt })
  return (
    <group>
      <mesh onClick={(e) => { if (e.delta > 4) return; e.stopPropagation(); onSelect('sun') }} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <sphereGeometry args={[SCALE.sunR, 64, 64]} />
        <shaderMaterial ref={mat} vertexShader={sunVert} fragmentShader={sunFrag} uniforms={uniforms} toneMapped={false} />
      </mesh>
      <sprite scale={[SCALE.sunR * 5, SCALE.sunR * 5, 1]}>
        <spriteMaterial map={glowA} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
      </sprite>
      <sprite scale={[SCALE.sunR * 13, SCALE.sunR * 13, 1]}>
        <spriteMaterial map={glowB} blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={0.6} toneMapped={false} />
      </sprite>
      <pointLight intensity={3.2} decay={0} distance={0} color="#fff3e0" />
      <BodyLabel position={[0, SCALE.sunR + 1.6, 0]} name="Sun" color="#f2b134" onClick={() => onSelect('sun')} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  Earth (day/night shader + clouds + atmosphere)                     */
/* ------------------------------------------------------------------ */

const earthVert = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position,1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`
const earthFrag = /* glsl */`
  uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D specMap;
  uniform vec3 sunPos;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 N = normalize(vN);
    vec3 L = normalize(sunPos - vW);
    vec3 V = normalize(cameraPosition - vW);
    float ndl = dot(N, L);
    float dayF = smoothstep(-0.12, 0.18, ndl);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    vec3 col = day * max(ndl, 0.0) * 1.35 + day * 0.025;
    col += night * vec3(1.0, 0.82, 0.55) * (1.0 - dayF) * 1.6;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0) * texture2D(specMap, vUv).r * dayF;
    col += vec3(1.0, 0.95, 0.85) * spec * 0.55;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    col += vec3(0.30, 0.58, 1.0) * fres * (0.15 + 0.85 * dayF) * 0.55;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

const atmoFrag = /* glsl */`
  uniform vec3 sunPos;
  varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    vec3 L = normalize(sunPos - vW);
    float rim = pow(1.0 - abs(dot(N, V)), 3.0);
    float lit = smoothstep(-0.35, 0.4, dot(N, L));
    gl_FragColor = vec4(vec3(0.35, 0.65, 1.0) * rim * (0.25 + lit), rim * (0.25 + lit));
  }`
const atmoVert = /* glsl */`
  varying vec3 vN; varying vec3 vW;
  void main(){
    vec4 wp = modelMatrix * vec4(position,1.0);
    vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`

function Earth({ bodies, simRef, onSelect }) {
  const [day, night, spec, clouds] = useTexture(
    ['/textures/earth_atmos_2048.jpg', '/textures/earth_lights_2048.png', '/textures/earth_specular_2048.jpg', '/textures/earth_clouds_1024.png'],
    (t) => { [t[0], t[1], t[3]].forEach((x) => { x.colorSpace = THREE.SRGBColorSpace; x.needsUpdate = true }) },
  )
  const group = useRef()
  const spin = useRef()
  const cloudRef = useRef()
  const uniforms = useMemo(() => ({ dayMap: { value: day }, nightMap: { value: night }, specMap: { value: spec }, sunPos: { value: new THREE.Vector3() } }), [day, night, spec])
  const atmoUniforms = useMemo(() => ({ sunPos: { value: new THREE.Vector3() } }), [])

  useFrame((_, dt) => {
    const d = daysSinceJ2000(simRef.current.ms)
    // Earth heliocentric longitude = Sun geocentric longitude + 180°
    const s = sunPosition(d)
    const [x, y, z] = eclipticToXYZ(s.lambda + 180, 0, SCALE.earthOrbit)
    bodies.earth.set(x, y, z)
    if (group.current) group.current.position.copy(bodies.earth)
    // Sidereal rotation: Greenwich meridian (texture centre, local +X) at GMST from the equinox.
    if (spin.current) spin.current.rotation.y = gmst(d) * D2R
    if (cloudRef.current) cloudRef.current.rotation.y += dt * 0.01
  })

  return (
    <group ref={group}>
      {/* axial tilt: north pole leans toward ecliptic longitude 90° (−Z) */}
      <group rotation={[-EARTH_TILT, 0, 0]}>
        <group ref={spin}>
          <mesh onClick={(e) => { if (e.delta > 4) return; e.stopPropagation(); onSelect('earth') }} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
            <sphereGeometry args={[SCALE.earthR, 96, 96]} />
            <shaderMaterial vertexShader={earthVert} fragmentShader={earthFrag} uniforms={uniforms} />
          </mesh>
          <mesh ref={cloudRef} scale={1.012}>
            <sphereGeometry args={[SCALE.earthR, 64, 64]} />
            <meshStandardMaterial map={clouds} alphaMap={clouds} transparent opacity={0.85} depthWrite={false} roughness={1} />
          </mesh>
        </group>
      </group>
      <mesh scale={1.09}>
        <sphereGeometry args={[SCALE.earthR, 64, 64]} />
        <shaderMaterial vertexShader={atmoVert} fragmentShader={atmoFrag} uniforms={atmoUniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
      </mesh>
      <BodyLabel position={[0, SCALE.earthR + 0.9, 0]} name="Earth" color="#6da7ec" onClick={() => onSelect('earth')} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  Moon (same LROC texture as the globe; tidally locked)              */
/* ------------------------------------------------------------------ */

function Moon({ bodies, simRef, onSelect, highlight }) {
  const [map, bump] = useTexture(['/moon_texture_2k.jpg', '/moon_displacement.jpg'], (t) => { t[0].colorSpace = THREE.SRGBColorSpace; t[0].needsUpdate = true })
  const ref = useRef()
  const mesh = useRef()
  const ring = useRef()
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    const d = daysSinceJ2000(simRef.current.ms)
    const m = moonPosition(d)
    const [x, y, z] = eclipticToXYZ(m.lambda, m.beta, SCALE.moonOrbit)
    bodies.moon.set(bodies.earth.x + x, bodies.earth.y + y, bodies.earth.z + z)
    if (ref.current) ref.current.position.copy(bodies.moon)
    // Tidal lock: nearside (lon 0° → local +X) always faces Earth.
    if (mesh.current) {
      tmp.copy(bodies.earth).sub(bodies.moon)
      mesh.current.rotation.y = Math.atan2(-tmp.z, tmp.x)
    }
    if (ring.current) {
      const s = 1 + 0.15 * Math.sin(clock.elapsedTime * 3)
      ring.current.scale.setScalar(s)
      ring.current.lookAt(0, 1e6, 0)
    }
  })

  return (
    <group ref={ref}>
      <mesh ref={mesh} onClick={(e) => { if (e.delta > 4) return; e.stopPropagation(); onSelect('moon') }} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <sphereGeometry args={[SCALE.moonR, 64, 64]} />
        <meshStandardMaterial map={map} bumpMap={bump} bumpScale={0.4} roughness={1} metalness={0} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[SCALE.moonR * 1.7, SCALE.moonR * 1.82, 64]} />
        <meshBasicMaterial color="#38d9f5" transparent opacity={highlight ? 0.85 : 0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <BodyLabel position={[0, SCALE.moonR + 0.55, 0]} name="Moon" color="#38d9f5" cta onClick={() => onSelect('moon')} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  Orbits                                                             */
/* ------------------------------------------------------------------ */

function EarthOrbit() {
  const geom = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 360; i++) pts.push(new THREE.Vector3(...eclipticToXYZ(i, 0, SCALE.earthOrbit)))
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [])
  return (
    <line geometry={geom}>
      <lineBasicMaterial color="#6da7ec" transparent opacity={0.22} />
    </line>
  )
}

function MoonOrbit({ bodies, simRef }) {
  const ref = useRef()
  const lineRef = useRef()
  const initial = useMemo(() => new Float32Array(181 * 3), [])
  const last = useRef(-1)
  useFrame(() => {
    if (ref.current) ref.current.position.copy(bodies.earth)
    const d = daysSinceJ2000(simRef.current.ms)
    if (Math.abs(d - last.current) < 2) return // node regresses slowly; refresh every ~2 sim days
    const attr = lineRef.current?.geometry.attributes.position
    if (!attr) return
    last.current = d
    const node = moonNode(d)
    const positions = attr.array
    for (let i = 0; i <= 180; i++) {
      const lam = i * 2
      const beta = 5.145 * Math.sin((lam - node) * D2R)
      const [x, y, z] = eclipticToXYZ(lam, beta, SCALE.moonOrbit)
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z
    }
    attr.needsUpdate = true
    lineRef.current.geometry.computeBoundingSphere()
  })
  return (
    <group ref={ref}>
      <line ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[initial, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#38d9f5" transparent opacity={0.35} />
      </line>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  Labels                                                             */
/* ------------------------------------------------------------------ */

function BodyLabel({ position, name, color, onClick, cta = false }) {
  return (
    <Html position={position} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <button
        type="button"
        onClick={onClick}
        className="glass-strong pointer-events-auto flex items-center gap-1.5 whitespace-nowrap !rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink transition hover:scale-105"
        style={{ borderColor: `${color}66` }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        {name}
        {cta && <span className="text-accent">→</span>}
      </button>
    </Html>
  )
}

/* ------------------------------------------------------------------ */
/*  Simulation clock + camera rig                                      */
/* ------------------------------------------------------------------ */

function SimClock({ simRef, onTick }) {
  const acc = useRef(0)
  useFrame((_, dt) => {
    const sim = simRef.current
    if (!sim.paused) sim.ms += dt * sim.daysPerSecond * 86_400_000
    acc.current += dt
    if (acc.current > 0.2) { acc.current = 0; onTick?.(sim.ms) }
  })
  return null
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * focus: 'system' | 'sun' | 'earth' | 'moon' | 'enter-moon'.
 * Flies camera + controls target to the body, then keeps tracking it as it moves.
 */
function CameraRig({ bodies, focus, onArrive, onUserInteract }) {
  const controls = useRef()
  const { camera } = useThree()
  const flight = useRef(null)
  const tracking = useRef(null)
  const prevTarget = useMemo(() => new THREE.Vector3(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])

  const bodyPos = (key) => (key === 'earth' ? bodies.earth : key === 'moon' || key === 'enter-moon' ? bodies.moon : bodies.sun)

  useEffect(() => {
    if (!focus || !controls.current) return
    const key = focus.target
    const dist = key === 'system' ? null : key === 'sun' ? 22 : key === 'earth' ? 7 : key === 'enter-moon' ? 0.9 : 2.6
    flight.current = {
      key,
      t: 0,
      duration: key === 'enter-moon' ? 2.2 : 1.8,
      fromPos: camera.position.clone(),
      fromTarget: controls.current.target.clone(),
      dist,
    }
    tracking.current = null
  }, [focus, camera])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const f = flight.current
    if (f) {
      f.t = Math.min(1, f.t + dt / f.duration)
      const s = easeInOut(f.t)
      let target, camPos
      if (f.key === 'system') {
        target = new THREE.Vector3(0, 0, 0)
        camPos = new THREE.Vector3(18, 34, 58)
      } else {
        target = bodyPos(f.key).clone()
        // approach from the Sun-lit side, slightly above the ecliptic
        const lit = tmp.copy(target).normalize().negate()
        if (f.key === 'sun') lit.set(0.4, 0.5, 1).normalize()
        const side = new THREE.Vector3(lit.z, 0, -lit.x).multiplyScalar(0.55)
        camPos = target.clone().add(lit.clone().add(side).add(new THREE.Vector3(0, 0.35, 0)).normalize().multiplyScalar(f.dist))
      }
      c.target.lerpVectors(f.fromTarget, target, s)
      camera.position.lerpVectors(f.fromPos, camPos, s)
      if (f.t >= 1) {
        flight.current = null
        if (f.key !== 'system') { tracking.current = f.key; prevTarget.copy(target) }
        onArrive?.(f.key)
      }
    } else if (tracking.current) {
      const p = bodyPos(tracking.current)
      tmp.copy(p).sub(prevTarget)
      camera.position.add(tmp)
      c.target.copy(p)
      prevTarget.copy(p)
    }
    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.6}
      maxDistance={160}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      onStart={() => { flight.current = null; onUserInteract?.() }}
    />
  )
}

/* ------------------------------------------------------------------ */

export default function SolarSystemScene({ simRef, focus, onSelect, onArrive, onTick, onReady, onUserInteract, highlightMoon }) {
  const bodies = useBodies()
  return (
    <ErrorBoundary label="Solar system">
      <Canvas camera={{ position: [18, 34, 58], fov: 45, near: 0.05, far: 2000 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} style={{ background: 'transparent' }}>
        <ambientLight intensity={0.05} color="#8fa6d8" />
        <StarField radius={500} count={4200} sizeScale={7} parallax={0.04} />
        <Suspense fallback={null}>
          <Sun onSelect={onSelect} />
          <Earth bodies={bodies} simRef={simRef} onSelect={onSelect} />
          <Moon bodies={bodies} simRef={simRef} onSelect={onSelect} highlight={highlightMoon} />
          <Ready onReady={onReady} />
        </Suspense>
        <EarthOrbit />
        <MoonOrbit bodies={bodies} simRef={simRef} />
        <SimClock simRef={simRef} onTick={onTick} />
        <CameraRig bodies={bodies} focus={focus} onArrive={onArrive} onUserInteract={onUserInteract} />
      </Canvas>
    </ErrorBoundary>
  )
}

function Ready({ onReady }) {
  useEffect(() => { onReady?.() }, [onReady])
  return null
}
