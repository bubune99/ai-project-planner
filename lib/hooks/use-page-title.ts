"use client"
import { useEffect } from "react"

/** Names the browser tab after what the page shows ("Name · Planner"); every page said "Planner" (walk 2026-11-16). */
export function usePageTitle(name: string | null | undefined) {
  useEffect(() => {
    if (!name) return
    const was = document.title
    document.title = `${name} · Planner`
    return () => { document.title = was }
  }, [name])
}
