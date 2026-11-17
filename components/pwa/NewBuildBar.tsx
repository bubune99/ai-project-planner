"use client"

import { useEffect, useRef, useState } from "react"
import { fullLoadFor, isStale, shouldAsk, CHECK_EVERY_MS } from "@/lib/pwa/build-check"

/**
 * After a ship, an open tab (and the installed app, which has no reload button) kept running the build it loaded
 * first (card 1ff9465d). This asks which build is live when the page is shown again, on focus and every few minutes;
 * when it differs, the next in-app link is a full load, and a bar offers Reload. Rules in lib/pwa/build-check.ts.
 */
export function NewBuildBar({ build }: { build: string }) {
  const [stale, setStale] = useState(false)
  const [hidden, setHidden] = useState(false)
  const asked = useRef<number | null>(null)
  const staleRef = useRef(false)

  useEffect(() => {
    let alive = true
    const ask = async (reason: "timer" | "focus") => {
      if (staleRef.current || document.visibilityState !== "visible") return
      const now = Date.now()
      if (!shouldAsk(asked.current, now, reason)) return
      asked.current = now
      try {
        const r = await fetch("/api/version", { cache: "no-store" })
        if (!r.ok) return
        const { build: live } = (await r.json()) as { build?: string }
        if (alive && isStale(build, live)) { staleRef.current = true; setStale(true) }
      } catch { /* offline: ask again later */ }
    }
    const onShow = () => { if (document.visibilityState === "visible") void ask("focus") }
    const onFocus = () => void ask("focus")
    const timer = window.setInterval(() => void ask("timer"), CHECK_EVERY_MS)
    document.addEventListener("visibilitychange", onShow)
    window.addEventListener("focus", onFocus)
    // Once stale, an in-app link loads the new build instead of moving inside the old one.
    const onClick = (e: MouseEvent) => {
      if (!staleRef.current || e.defaultPrevented) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a) return
      if (!fullLoadFor({ href: a.getAttribute("href") || "", target: a.target, download: a.hasAttribute("download") }, window.location.href,
        { button: e.button, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey })) return
      e.preventDefault()
      e.stopPropagation()
      window.location.assign(a.href)
    }
    document.addEventListener("click", onClick, true)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onShow)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("click", onClick, true)
    }
  }, [build])

  if (!stale || hidden) return null
  return (
    <div
      role="status"
      data-new-build
      className="opx-newbuild"
      style={{
        // Centered by margin, not left: 50% + translate: a fixed box at left: 50% is only allowed half the screen,
        // so at 440px the sentence wrapped one word a line into a 142px-tall blob (owner's comment 694b7de9).
        // The distance from the bottom is in globals.css (.opx-newbuild): above the tab bar on phones.
        position: "fixed", left: 16, right: 16, margin: "0 auto", width: "fit-content", zIndex: 2147483000,
        display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 16px",
        borderRadius: 24, background: "var(--opx-ink, #20355b)", color: "var(--opx-card, #fff)",
        boxShadow: "0 12px 32px rgb(0 0 0 / 0.3)", fontSize: 14,
      }}
    >
      <span style={{ flex: "1 1 auto", minWidth: 0 }}>A new version of the planner is ready.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ minHeight: 44, padding: "0 16px", borderRadius: 999, border: 0, fontWeight: 600, cursor: "pointer", background: "var(--opx-card, #fff)", color: "var(--opx-ink, #20355b)", flexShrink: 0 }}
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setHidden(true)}
        style={{ minHeight: 44, padding: "0 12px", borderRadius: 999, border: 0, cursor: "pointer", background: "transparent", color: "inherit", flexShrink: 0 }}
      >
        Later
      </button>
    </div>
  )
}
