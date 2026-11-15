import { useEffect, useRef } from 'react'

/**
 * Fixed full-page 2D starfield with twinkle, slow drift and mouse parallax.
 * Each star has a depth; nearer (larger) stars shift further with the pointer.
 * Sits behind every view so page transitions feel continuous.
 */
export default function SpaceBackground({ density = 0.00022, dim = false, parallax = 28 }) {
  const ref = useRef()
  const nebulaRef = useRef()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let raf, w, h, stars = []
    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    const target = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * DPR
      canvas.height = h * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      const n = Math.floor(w * h * density)
      stars = Array.from({ length: n }, () => {
        const depth = Math.random() // 0 = far, 1 = near
        return {
          x: Math.random() * (w + 2 * parallax) - parallax,
          y: Math.random() * h,
          depth,
          r: depth > 0.92 ? 1.2 + Math.random() * 0.8 : 0.3 + depth * 0.8,
          p: Math.random() * Math.PI * 2,
          s: 0.3 + Math.random() * 1.2,
          hue: Math.random() < 0.15 ? '#b9d2ff' : Math.random() < 0.08 ? '#ffe3b5' : '#eef3ff',
        }
      })
    }

    const onMove = (e) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1
      target.y = (e.clientY / window.innerHeight) * 2 - 1
    }

    let t = 0
    const draw = () => {
      t += 0.016
      cur.x += (target.x - cur.x) * 0.05
      cur.y += (target.y - cur.y) * 0.05
      ctx.clearRect(0, 0, w, h)
      for (const st of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * st.s + st.p)
        const k = reduce ? 0 : parallax * (0.15 + st.depth * 0.85)
        ctx.globalAlpha = (dim ? 0.45 : 0.8) * tw
        ctx.fillStyle = st.hue
        ctx.beginPath()
        const y = (((st.y + t * 1.5 * (0.4 + st.depth) - cur.y * k) % h) + h) % h
        ctx.arc(st.x - cur.x * k, y, st.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      if (nebulaRef.current) nebulaRef.current.style.transform = `translate3d(${-cur.x * parallax * 0.5}px, ${-cur.y * parallax * 0.5}px, 0)`
      raf = requestAnimationFrame(draw)
    }

    resize()
    draw()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('pointermove', onMove) }
  }, [density, dim, parallax])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(22,32,56,0.9)_0%,_rgba(4,6,13,1)_60%)]" />
      <div ref={nebulaRef} className="absolute inset-0 will-change-transform">
        <div className="absolute -left-1/4 top-1/3 h-[60vh] w-[60vw] rounded-full bg-accent/5 blur-[120px]" />
        <div className="absolute -right-1/4 bottom-0 h-[50vh] w-[50vw] rounded-full bg-violet/5 blur-[120px]" />
      </div>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
