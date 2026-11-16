"use client"

import { useEffect, useRef, useState } from "react"
import { roomBelow } from "./fill-room"

/** The page's own scroller: the nearest ancestor that scrolls vertically, or the document. */
function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if (oy === "auto" || oy === "scroll") return p
  }
  return document.scrollingElement as HTMLElement
}

/** Height for an area that scrolls itself, so the page around it does not scroll too (lib/layout/fill-room.ts). */
export function useRoomBelow<T extends HTMLElement>(min = 360) {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const scroller = scrollerOf(el)
    const measure = () => {
      const isDoc = scroller === document.scrollingElement
      const top = el.getBoundingClientRect().top - (isDoc ? 0 : scroller.getBoundingClientRect().top) + scroller.scrollTop
      const pad = parseFloat(getComputedStyle(scroller).paddingBottom) || 0
      setHeight(roomBelow(isDoc ? window.innerHeight : scroller.clientHeight, top, Math.max(16, pad), min))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(scroller)
    // What sits above the area can grow or shrink (a panel opening, data arriving).
    if (el.parentElement) ro.observe(el.parentElement)
    window.addEventListener("resize", measure)
    return () => { ro.disconnect(); window.removeEventListener("resize", measure) }
  }, [min])
  return { ref, height }
}
