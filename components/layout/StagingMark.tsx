"use client"

/**
 * Says "Staging" on every page of the staging site, and nothing anywhere else.
 *
 * Staging has its own database: questions waiting on the owner, tasks and comments there are not the real ones.
 * On 2026-11-14 the owner looked for his waiting questions on staging, found none, and left two comments there
 * that no agent was ever handed. Nothing on screen said which site he was on.
 *
 * The rule (whichSite) is pure and checked in lib/ui/which-site.assert.ts.
 */
import { useEffect, useState } from "react"
import { whichSite } from "@/lib/ui/which-site"

export function StagingMark() {
  const [site, setSite] = useState<ReturnType<typeof whichSite>>("production")
  useEffect(() => { setSite(whichSite(window.location.hostname)) }, [])
  if (site === "production") return null
  return (
    <div
      role="status" data-testid="staging-mark"
      style={{
        position: "fixed", top: 6, left: "50%", transform: "translateX(-50%)", zIndex: 2147483000, pointerEvents: "none",
        background: "color-mix(in srgb, var(--opx-warn, #b7791f) 88%, #000)", color: "#fff", borderRadius: 999,
        padding: "4px 12px", fontSize: 12.5, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgb(0 0 0 / .25)",
      }}
    >
      {site === "staging" ? "Staging: test copy, not your live planner" : "Preview build: not your live planner"}
    </div>
  )
}
