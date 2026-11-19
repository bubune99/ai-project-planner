/**
 * Walks clear function checks. Owner 2026-11-17: "I think walks are main and checks cover buttons that might not
 * have been clicked in the check." A walk step that names the control it pressed is a real press of that control, so
 * it settles the control's function check: passed when the step went as expected, failed when it did not. Look and
 * states checks are not touched: a walk proves a press, not colors or hover states.
 *
 * Pure: no database, no clock. Checked by walk-checks.assert.ts.
 */
import { checkKey, workflowStates, type Checklist, type Control } from "../gates/gate-model"
import type { Walk } from "./walk-model"

export interface WalkVerdict { route: string; key: string; status: "passed" | "failed"; note: string }
export interface PageList { route: string; list: Checklist }

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()
const pathOf = (route: string) => route.split("?")[0].replace(/\/+$/, "") || "/"

/** The page a step was on: the exact route, else the only page with that path. */
export function pageFor(pages: PageList[], route: string | undefined): PageList | null {
  if (!route) return null
  const exact = pages.find((p) => p.route === route)
  if (exact) return exact
  const same = pages.filter((p) => pathOf(p.route) === pathOf(route))
  return same.length === 1 ? same[0] : null
}

/** The control a step pressed, by its label (and kind when given). */
export function controlFor(list: Checklist, ref: { label: string; kind?: string }): Control | null {
  const label = norm(ref.label)
  if (!label) return null
  for (const v of list.views) for (const c of v.controls) if (norm(c.label) === label && (!ref.kind || c.kind === ref.kind)) return c
  return null
}

/**
 * The function-check verdicts a walk amounts to. One per check: a failure anywhere in the walk outweighs a pass, so a
 * control that let the walker down once stays failed until it is checked again.
 */
export function walkVerdicts(walk: Walk, pages: PageList[]): WalkVerdict[] {
  const out = new Map<string, WalkVerdict>()
  walk.steps.forEach((step, i) => {
    if (!step.control) return
    const page = pageFor(pages, step.route ?? walk.route)
    if (!page) return
    const c = controlFor(page.list, step.control)
    if (!c) return
    for (const w of c.workflows) {
      if ((w.kind ?? "function") !== "function") continue
      const [state] = workflowStates(c, w)
      if (!state) continue
      const key = checkKey(c.n, w.name, state)
      const id = `${page.route} ${key}`
      const status = step.ok ? "passed" : "failed"
      if (out.get(id)?.status === "failed") continue
      out.set(id, { route: page.route, key, status, note: `Pressed in the walk "${walk.goal}", step ${i + 1}: ${step.did}. Expected: ${step.expected || "not said"}. Saw: ${step.saw}` })
    }
  })
  return [...out.values()]
}
