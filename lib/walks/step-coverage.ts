/**
 * Which steps of a use case have been walked, and on which way through.
 *
 * Owner, 2026-11-23: "we should be able to walk partial walkthroughs when needed or alternate paths when we want".
 * A walk could only stand for a whole use case, so a walk of three steps counted for all of them, and the other ways
 * through a step (People and flows: a step's `ways`) were never owed a walk at all.
 *
 * A walk says what it covered:
 * - `covers`: the ids of the steps it walked (main line or a way), for a partial walk;
 * - `way`: the id of the way it took, for a walk of the whole use case along another way;
 * - neither: the whole main line (every walk before this rule).
 *
 * Pure: no database, no clock. Checked in step-coverage.assert.ts.
 */
import { routeCovers, type Ship } from "@/lib/gates/fresh-model"
import type { Step, UseCase } from "@/lib/people/people-model"

/** `build`: the commit the walk ran on, when it said. A ship of that same commit recorded later is not a change since the walk. */
export interface CoverWalk { useCase?: string; covers?: string[]; way?: string; at: string; outcome: string; build?: string }

/** Two shas name the same commit when one starts with the other (short and long forms). */
const sameCommit = (a: string, b: string) => !!a && !!b && (a.startsWith(b) || b.startsWith(a))
export type StepState = "never" | "walked" | "changed" | "stopped"
export interface StepCover { id: string; does: string; way: string | null; at: string | null; state: StepState; changes: string[]; reworded: boolean }
export interface WayCover { id: string; label: string; walked: boolean }
export interface FlowCover { steps: StepCover[]; ways: WayCover[]; walked: number; total: number }

/** Every step with the way it is on (null for the main line), main line first and each way after its step. */
export function stepsWithWay(flow: Pick<UseCase, "steps">): { step: Step; way: string | null }[] {
  const out: { step: Step; way: string | null }[] = []
  for (const s of flow.steps) {
    out.push({ step: s, way: null })
    for (const w of s.ways ?? []) for (const x of w.steps) out.push({ step: x, way: w.id })
  }
  return out
}

/** The step ids a walk covered in this use case. Ids that are not in it are ignored. */
export function walkCovers(flow: Pick<UseCase, "steps">, walk: Pick<CoverWalk, "covers" | "way">): string[] {
  const all = stepsWithWay(flow), ids = new Set(all.map((x) => x.step.id))
  if (walk.covers?.length) return walk.covers.filter((id) => ids.has(id))
  const main = flow.steps.map((s) => s.id)
  if (!walk.way) return main
  // Along another way: the main line up to the step it leaves from, the way's steps, then the rest unless the way ends there.
  const at = flow.steps.findIndex((s) => (s.ways ?? []).some((w) => w.id === walk.way))
  if (at < 0) return main
  const way = flow.steps[at].ways!.find((w) => w.id === walk.way)!
  return [...main.slice(0, at + 1), ...way.steps.map((s) => s.id), ...(way.ends ? [] : main.slice(at + 1))]
}

/**
 * Each step's last walk and whether something shipped to its page since. A step walked by a walk that stopped short is
 * "stopped"; a ship to its page after its last walk makes it "changed"; never covered is "never".
 */
export function flowCoverage(flow: Pick<UseCase, "id" | "steps">, walks: CoverWalk[], ships: Ship[]): FlowCover {
  const mine = walks.filter((w) => w.useCase === flow.id).sort((a, b) => b.at.localeCompare(a.at))
  const covered = mine.map((w) => ({ w, ids: new Set(walkCovers(flow, w)) }))
  const steps = stepsWithWay(flow).map(({ step, way }): StepCover => {
    const last = covered.find((c) => c.ids.has(step.id))?.w
    const route = step.ref?.route
    const t = last ? new Date(last.at).getTime() : 0
    const walkedOn = last?.build?.trim().toLowerCase() ?? ""
    const changes = !last ? [] : [...new Set(ships.filter((s) => new Date(s.at).getTime() > t && s.env !== "report" && !sameCommit(walkedOn, s.sha.toLowerCase()) && (s.everywhere || (!!route && s.routes.some((r) => routeCovers(r, route))))).map((s) => s.sha.slice(0, 7)))]
    // Its words or control changed after its last walk (People and flows keeps when: lib/people/step-stamp.ts).
    const reworded = !!last && !!step.changedAt && new Date(step.changedAt).getTime() > t
    const state: StepState = !last ? "never" : changes.length || reworded ? "changed" : last.outcome !== "reached" ? "stopped" : "walked"
    return { id: step.id, does: step.does, way, at: last?.at ?? null, state, changes, reworded }
  })
  const ways = flow.steps.flatMap((s) => (s.ways ?? []).map((w): WayCover => ({ id: w.id, label: w.label, walked: steps.some((x) => x.way === w.id && x.state !== "never") })))
  return { steps, ways, walked: steps.filter((s) => s.state !== "never").length, total: steps.length }
}

/** One line for a use case: how much of it has been walked. */
export function coverageLine(c: FlowCover): string {
  if (!c.total) return "No steps."
  const never = c.ways.filter((w) => !w.walked)
  const changed = c.steps.filter((s) => s.state === "changed").length
  return [
    `${c.walked} of ${c.total} step${c.total === 1 ? "" : "s"} walked`,
    changed ? `${changed} changed since` : "",
    never.length ? `${never.length === 1 ? "the way" : "the ways"} ${never.map((w) => `"${w.label}"`).join(", ")} never walked` : "",
  ].filter(Boolean).join("; ") + "."
}

/**
 * The step ids a partial walk names, from a list ("a,b") or a range of the main line ("--from b --to d"). Errors in words.
 */
export function readCovers(flow: Pick<UseCase, "steps">, a: { steps?: string; from?: string; to?: string; way?: string }): { ok: true; covers?: string[]; way?: string } | { ok: false; error: string } {
  const all = stepsWithWay(flow), ids = all.map((x) => x.step.id)
  const way = a.way?.trim()
  if (way && !flow.steps.some((s) => (s.ways ?? []).some((w) => w.id === way))) return { ok: false, error: `No way "${way}" in this use case. Its ways: ${flow.steps.flatMap((s) => (s.ways ?? []).map((w) => `${w.id} (${w.label})`)).join(", ") || "none"}` }
  if (a.steps) {
    const want = a.steps.split(",").map((s) => s.trim()).filter(Boolean)
    const bad = want.filter((id) => !ids.includes(id))
    if (bad.length) return { ok: false, error: `Not steps of this use case: ${bad.join(", ")}. Its steps: ${ids.join(", ")}` }
    return { ok: true, covers: want, ...(way ? { way } : {}) }
  }
  if (a.from || a.to) {
    const line = walkCovers(flow, way ? { way } : {})
    const i = a.from ? line.indexOf(a.from) : 0, j = a.to ? line.indexOf(a.to) : line.length - 1
    if (i < 0 || j < 0) return { ok: false, error: `${i < 0 ? a.from : a.to} is not on ${way ? `the way ${way}` : "the main line"}: ${line.join(", ")}` }
    if (j < i) return { ok: false, error: `${a.to} comes before ${a.from}` }
    return { ok: true, covers: line.slice(i, j + 1), ...(way ? { way } : {}) }
  }
  return { ok: true, ...(way ? { way } : {}) }
}
