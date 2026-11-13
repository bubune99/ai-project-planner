"use client"

/*
 * The animated mesh gradient behind the dashboard banner. The picture is
 * lib/ui/mesh-gradient.ts; this only runs the clock and paints it. It stays
 * still for people who ask for reduced motion, and the browser pauses the
 * loop by itself while the tab is hidden.
 */

import { useEffect, useRef } from "react"
import { BACKDROP, SPEED, meshBackground } from "@/lib/ui/mesh-gradient"

export function MeshBanner() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      el.style.backgroundImage = meshBackground(((now - start) / 1000) * SPEED)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div className="opx-mesh" aria-hidden>
      <div ref={ref} className="opx-mesh-paint" style={{ backgroundColor: BACKDROP, backgroundImage: meshBackground(0) }} />
      <div className="opx-mesh-grain" />
    </div>
  )
}
