"use client"

/*
 * The animated dither grid behind the dashboard banner. The picture is
 * lib/ui/dither-grid.ts; this only runs the clock and paints it, one canvas
 * pixel per cell, scaled up crisp. It stays still for people who ask for
 * reduced motion, and the browser pauses the loop while the tab is hidden.
 */

import { useEffect, useRef } from "react"
import { buildRamp, gridFor, paint } from "@/lib/ui/dither-grid"

export function DitherBanner() {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = wrap.current, cv = canvas.current
    const ctx = cv?.getContext("2d")
    if (!el || !cv || !ctx) return
    const ramp = buildRamp()
    let image: ImageData | null = null
    let rows = 0, cols = 0
    const start = performance.now()
    const seconds = () => (performance.now() - start) / 1000
    const draw = (t: number) => { if (image) { paint(image.data, rows, cols, ramp, t); ctx.putImageData(image, 0, 0) } }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const size = () => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      const g = gridFor(r.width, r.height)
      if (g.rows === rows && g.cols === cols) return
      rows = g.rows; cols = g.cols
      cv.width = cols; cv.height = rows
      image = ctx.createImageData(cols, rows)
      draw(still ? 0 : seconds())
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(el)

    let frame = 0
    const tick = () => { draw(seconds()); frame = requestAnimationFrame(tick) }
    if (!still) frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); ro.disconnect() }
  }, [])

  return (
    <div ref={wrap} className="opx-shader" aria-hidden>
      <canvas ref={canvas} />
      <div className="opx-shader-vignette" />
      <div className="opx-shader-grain" />
    </div>
  )
}
