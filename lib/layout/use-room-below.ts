"use client"

import { useEffect, useRef, useState } from "react"
import { boardHeight } from "./fill-room"

/** The page's own scroller: the nearest ancestor that scrolls vertically, or the document. */
function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if (oy === "auto" || oy === "scroll") return p
  }
  return document.scrollingElement as HTMLElement
}

/** The board's height: what the page's scroller shows (lib/layout/fill-room.ts). */
export function useRoomBelow<T extends HTMLElement>(min = 360) {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const scroller = scrollerOf(el)
    const measure = () => {
      const isDoc = scroller === document.scrollingElement
      setHeight(boardHeight(isDoc ? window.innerHeight : scroller.clientHeight, 16, min))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(scroller)
    window.addEventListener("resize", measure)
    return () => { ro.disconnect(); window.removeEventListener("resize", measure) }
  }, [min])
  return { ref, height }
}
