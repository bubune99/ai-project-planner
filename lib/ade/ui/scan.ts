"use client"

import { cleanLabel, makeKeys, type ScreenUnit } from "./screen-units"

/** Things we never tag: our own overlays, the feedback widget, hidden or tiny elements. */
const SKIP = '[data-fbw], [data-ade-skip], script, style, noscript'

const SELECTORS: { kind: ScreenUnit["kind"]; sel: string }[] = [
  { kind: "nav", sel: ".j-sidebar a, nav a.j-nav-item" },
  { kind: "tab", sel: '[role="tab"]' },
  { kind: "section", sel: "main h1, main h2, main h3, .j-card-title, .j-topbar-titles h1" },
  { kind: "action", sel: "main button, main a[href], .j-topbar button, .j-topbar a" },
  { kind: "field", sel: "main input, main textarea, main select" },
]

function nameOf(el: Element, kind: ScreenUnit["kind"]): string | null {
  const aria = el.getAttribute("aria-label")
  if (aria) return cleanLabel(aria)
  if (kind === "field") {
    const f = el as HTMLInputElement
    return cleanLabel(f.placeholder || f.getAttribute("title") || (f.id ? document.querySelector(`label[for="${CSS.escape(f.id)}"]`)?.textContent : null))
  }
  const title = el.getAttribute("title")
  const text = (el as HTMLElement).innerText
  return cleanLabel(text) ?? cleanLabel(title)
}

function visible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return false
  const cs = getComputedStyle(el)
  return cs.visibility !== "hidden" && cs.display !== "none"
}

/** Give every untagged, visible control a stable data-ui. Idempotent; never touches elements that already have one. */
export function annotateScreen(root: ParentNode = document): number {
  const pending: { el: Element; kind: ScreenUnit["kind"]; label: string }[] = []
  const taken = new Set<string>(Array.from(root.querySelectorAll("[data-ui]")).map((e) => e.getAttribute("data-ui") ?? ""))
  for (const { kind, sel } of SELECTORS) {
    root.querySelectorAll(sel).forEach((el) => {
      if (el.hasAttribute("data-ui") || el.closest(SKIP) || el.closest('[data-ui="dock"]') || !visible(el)) return
      if (pending.some((p) => p.el === el)) return
      const label = nameOf(el, kind)
      if (label) pending.push({ el, kind, label })
    })
  }
  const keys = makeKeys(pending)
  let n = 0
  pending.forEach((p, i) => {
    let key = keys[i]
    let bump = 2
    while (taken.has(key)) key = `${keys[i]}~${bump++}`
    taken.add(key)
    p.el.setAttribute("data-ui", key)
    p.el.setAttribute("data-ui-label", p.label)
    n++
  })
  return n
}

/** What is on screen right now: [key, label] for each visible unit outside the dock. */
export function scanUnits(root: ParentNode = document, limit = 80): ScreenUnit[] {
  const out: ScreenUnit[] = []
  root.querySelectorAll("[data-ui]").forEach((el) => {
    if (out.length >= limit) return
    const key = el.getAttribute("data-ui") ?? ""
    if (!key || el.closest('[data-ui="dock"]') || el.closest(SKIP) || !visible(el)) return
    const label = el.getAttribute("data-ui-label") ?? nameOf(el, (key.split(".")[0] as ScreenUnit["kind"]) || "action")
    if (!label) return
    const kind = (["section", "action", "field", "nav", "tab"].includes(key.split(".")[0]) ? key.split(".")[0] : "action") as ScreenUnit["kind"]
    out.push({ key, label, kind })
  })
  return out
}
