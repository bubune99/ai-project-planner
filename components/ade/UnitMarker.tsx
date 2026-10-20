"use client"

/*
 * UnitMarker — tags every visible control on the current screen with a
 * data-ui (lib/ade/ui/scan.ts) so the assistant can point at it. Runs on route
 * change and when the page's structure changes (debounced). It watches
 * childList only, so tagging an element never re-triggers it.
 */

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { annotateScreen } from "@/lib/ade/ui/scan"

export function UnitMarker() {
  const pathname = usePathname()
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const run = () => { try { annotateScreen() } catch { /* never break the page for tagging */ } }
    const later = () => { if (t) clearTimeout(t); t = setTimeout(run, 350) }
    later()
    const mo = new MutationObserver((muts) => {
      // Ignore the dock's own chat churn.
      if (muts.every((m) => (m.target as Element).closest?.('[data-ui="dock"], [data-fbw]'))) return
      later()
    })
    mo.observe(document.body, { childList: true, subtree: true })
    return () => { mo.disconnect(); if (t) clearTimeout(t) }
  }, [pathname])
  return null
}
