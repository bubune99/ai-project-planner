"use client"

/*
 * One row that scrolls sideways when it does not fit, with an arrow at the edge
 * where there is more to see (owner, 2026-11-14: "These chips can be in a row
 * and I can scroll to see the options. Be sure to show an arrow for me to
 * continue scrolling"). Where everything fits, no arrow is drawn. Which arrows
 * show is worked out by scrollEdges in lib/ui/scroll-edges.ts.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { scrollEdges, type ScrollEdges } from "@/lib/ui/scroll-edges"

interface ScrollRowProps {
  children: ReactNode
  /** Classes for the scrolling row itself (its look stays with the caller). */
  className?: string
  /** Rendered as a nav when the row is a set of sections. */
  as?: "div" | "nav"
  /** Accessible name for the row. */
  label?: string
}

const NONE: ScrollEdges = { before: false, after: false }

export function ScrollRow({ children, className = "", as = "div", label }: ScrollRowProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [edges, setEdges] = useState<ScrollEdges>(NONE)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const next = scrollEdges(el.scrollLeft, el.clientWidth, el.scrollWidth)
    setEdges((prev) => (prev.before === next.before && prev.after === next.after ? prev : next))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    el.addEventListener("scroll", measure, { passive: true })
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => { el.removeEventListener("scroll", measure); ro?.disconnect() }
  }, [measure, children])

  const move = (dir: 1 | -1) => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: "smooth" })
  }

  const Tag = as
  return (
    <div className={`opx-srow${edges.before ? " more-before" : ""}${edges.after ? " more-after" : ""}`}>
      <Tag ref={ref as never} className={`opx-srow-track ${className}`.trim()} aria-label={label}>{children}</Tag>
      {edges.before && (
        <button type="button" className="opx-srow-arrow before" aria-label="Show earlier" onClick={() => move(-1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
      {edges.after && (
        <button type="button" className="opx-srow-arrow after" aria-label="Show more" onClick={() => move(1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
