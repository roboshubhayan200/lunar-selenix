import { useEffect, useRef } from 'react'

/**
 * Fixed full-page 2D starfield with gentle twinkle and a slow parallax drift.
 * Sits behind every view so page transitions feel continuous.
 */
export default function SpaceBackground({ density = 0.00022, dim = false }) {
  const ref = useRef()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let raf, w, h, stars = []
    const DPR = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * DPR
      canvas.height = h * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      const n = Math.floor(w * h * density)
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() < 0.08 ? 1.2 + Math.random() * 0.8 : 0.3 + Math.random() * 0.7,
        p: Math.random() * Math.PI * 2,
        s: 0.3 + Math.random() * 1.2,
        hue: Math.random() < 0.15 ? '#b9d2ff' : Math.random() < 0.08 ? '#ffe3b5' : '#eef3ff',
      }))
    }

    let t = 0
    const draw = () => {
      t += 0.016
      ctx.clearRect(0, 0, w, h)
      for (const st of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * st.s + st.p)
        ctx.globalAlpha = (dim ? 0.45 : 0.8) * tw
        ctx.fillStyle = st.hue
        ctx.beginPath()
        ctx.arc(st.x, (st.y + t * 1.5) % h, st.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }

    resize()
    draw()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [density, dim])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(22,32,56,0.9)_0%,_rgba(4,6,13,1)_60%)]" />
      <div className="absolute -left-1/4 top-1/3 h-[60vh] w-[60vw] rounded-full bg-accent/5 blur-[120px]" />
      <div className="absolute -right-1/4 bottom-0 h-[50vh] w-[50vw] rounded-full bg-violet/5 blur-[120px]" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
