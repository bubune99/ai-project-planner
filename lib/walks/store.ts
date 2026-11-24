/** Walks: saving and listing. Rules are in walk-model.ts; this file is SQL only. Callers check access first. */
import { sql } from "@/lib/db/client"
import { loadFlows } from "@/lib/people/store"
import { coverage, findingKey, fixIn, openFindings, parseWalk, settleIn, walkLine, withoutCalls, type Fixed, type Settled, type StoredWalk, type Walk } from "./walk-model"

import { walkErrorCard } from "@/lib/intake/check-card"
import { upsertFixCard } from "@/lib/intake/check-card-store"
import { latestChecklists, recordResults } from "@/lib/gates/store"
import { walkVerdicts } from "./walk-checks"
import { coverageLine, flowCoverage } from "./step-coverage"
import { listShips } from "@/lib/gates/ship-store"

export class WalkError extends Error {}

export async function listWalks(projectId: string, build?: string) {
  const rows = (await sql`
    SELECT id, doc, actor, created_at FROM walks WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 200
  `) as { id: string; doc: Walk; actor: "agent" | "owner"; created_at: string }[]
  // Read through the parser, so an older row never reaches the page in a shape it cannot draw.
  const walks: StoredWalk[] = rows.map((r) => ({ ...parseWalk(r.doc).walk, id: r.id, actor: r.actor, at: new Date(r.created_at).toISOString() }))
  const [people, ships] = await Promise.all([loadFlows(projectId), listShips(projectId, 400)])
  // Step by step: how much of each use case has been walked, on which ways, and what shipped since (step-coverage.ts).
  const steps = new Map(people.doc.flows.map((f) => { const c = flowCoverage(f, walks, ships.ships); return [f.id, { ...c, line: coverageLine(c) }] as const }))
  return {
    walks: walks.map((w) => ({ ...w, line: walkLine(w) })),
    coverage: coverage(people.doc.flows.map((f) => ({ id: f.id, name: f.name })), walks, build).map((c) => ({ ...c, steps: steps.get(c.useCase) ?? null })),
    open: openFindings(walks),
  }
}

export async function saveWalk(a: { projectId: string; userId: string; raw: unknown; actor: "agent" | "owner" }) {
  const parsed = parseWalk(a.raw)
  if (parsed.errors.length) throw new WalkError(parsed.errors.slice(0, 6).join(". "))
  // The owner's calls are made on the page, one at a time. A walk that arrives with some already in it does not get to keep them.
  const walk = withoutCalls(parsed.walk)
  const [row] = (await sql`
    INSERT INTO walks (project_id, goal, use_case, persona, outcome, env, build, doc, actor, created_by)
    VALUES (${a.projectId}, ${walk.goal}, ${walk.useCase ?? null}, ${walk.persona ?? null}, ${walk.outcome}, ${walk.env ?? null}, ${walk.build ?? null}, ${JSON.stringify(walk)}::jsonb, ${a.actor}, ${a.userId})
    RETURNING id
  `) as { id: string }[]
  // Errors a walk found are bugs: each goes straight to Up next as a card, once (owner, 2026-11-16).
  let cards = 0
  for (const f of walk.findings.filter((x) => x.kind === "error")) {
    try {
      await upsertFixCard(a.projectId, walkErrorCard({ key: findingKey(f), what: f.what, goal: walk.goal, suggest: f.suggest, route: (walk as { route?: string }).route ?? null }))
      cards++
    } catch (e) {
      console.error("[walks] walk saved but a fix card was not made", row.id, e instanceof Error ? e.message : e)
    }
  }
  // A press made on a walk clears that control's function check (owner, 2026-11-17: "walks are main and checks cover
  // buttons that might not have been clicked"). Recorded as the walker's verdict; a reviewer or the owner can still differ.
  let cleared = 0
  if (walk.steps.some((s) => s.control)) {
    try {
      const rows = await latestChecklists(a.projectId)
      const verdicts = walkVerdicts(walk, rows.map((r) => ({ route: r.route, list: r.doc })))
      for (const v of verdicts) {
        const checklist = rows.find((r) => r.route === v.route)
        if (!checklist) continue
        await recordResults({ checklist, userId: a.userId, keys: [v.key], actor: a.actor === "owner" ? "owner" : "builder", status: v.status, note: v.note })
        cleared++
      }
    } catch (e) {
      console.error("[walks] walk saved but its presses were not recorded on the checks", row.id, e instanceof Error ? e.message : e)
    }
  }
  return { id: row.id, line: walkLine(walk), findings: walk.findings.length, cards, checks: cleared }
}

/** The line in a task's description that ties it to a finding the owner said to change. */
export const findingMarker = (key: string) => `walk-finding: ${key}`

/**
 * The owner's call on one finding, for every walk in the project that met it: "do" (it becomes a task for agents),
 * "leave" (it is no longer open), or null (put back to open). Callers have checked that this is the owner's own session.
 */
/**
 * A finding fixed and proved (by an agent, or the owner), or put back to open with null. Closes it on every walk that
 * met it; a later walk that meets it again reopens it on its own (openFindings).
 */
export async function fixFinding(a: { projectId: string; key: string; fixed: Fixed | null }) {
  const rows = (await sql`SELECT id, doc FROM walks WHERE project_id = ${a.projectId} ORDER BY created_at DESC LIMIT 200`) as { id: string; doc: Walk }[]
  const met = rows.map((r) => ({ id: r.id, walk: parseWalk(r.doc).walk })).filter((r) => r.walk.findings.some((f) => findingKey(f) === a.key))
  if (!met.length) throw new WalkError("That finding is not on any walk of this project")
  for (const r of met) await sql`UPDATE walks SET doc = ${JSON.stringify(fixIn(r.walk, a.key, a.fixed))}::jsonb WHERE id = ${r.id} AND project_id = ${a.projectId}`
  return { key: a.key, fixed: !!a.fixed, walks: met.length }
}

export async function settleFinding(a: { projectId: string; key: string; call: "do" | "leave" | null }) {
  const rows = (await sql`SELECT id, doc FROM walks WHERE project_id = ${a.projectId} ORDER BY created_at DESC LIMIT 200`) as { id: string; doc: Walk }[]
  const met = rows.map((r) => ({ id: r.id, walk: parseWalk(r.doc).walk })).filter((r) => r.walk.findings.some((f) => findingKey(f) === a.key))
  if (!met.length) throw new WalkError("That finding is not on any walk of this project")
  const finding = met[0].walk.findings.find((f) => findingKey(f) === a.key)!
  const marker = findingMarker(a.key)
  let task: string | undefined
  if (a.call === "do") {
    const [open] = (await sql`
      SELECT id FROM project_steps WHERE project_id = ${a.projectId} AND deleted_at IS NULL AND status NOT IN ('completed', 'cancelled') AND position(${marker} in description) > 0 LIMIT 1
    `) as { id: string }[]
    if (open) task = open.id
    else {
      const description = [`**The owner said to change this (${new Date().toISOString().slice(0, 10)}).** It was found by an agent walking the product, and was the owner's call.`, "", `- What was found: ${finding.what}`, `- Met while trying to: ${met[0].walk.goal}`, finding.suggest ? `- Suggested: ${finding.suggest}` : null, "", "Make the change on a review branch, prove it on staging, and send the before and after for the owner to judge.", "", marker].filter((l) => l !== null).join("\n")
      const [made] = (await sql`
        INSERT INTO project_steps (project_id, title, description, status, phase, stage, estimated_hours, priority, tasks, acceptance_criteria, metadata, order_index, tags)
        VALUES (
          ${a.projectId}, ${`Change, as the owner asked: ${finding.what}`.slice(0, 180)}, ${description}, 'pending',
          COALESCE((SELECT NULLIF(current_phase, '') FROM projects WHERE id = ${a.projectId}), 'planning'), 'backlog', 0, 'high',
          '[]'::jsonb, '[]'::jsonb, ${JSON.stringify({ source: "walk-finding", key: a.key })}::jsonb,
          (SELECT COALESCE(MAX(order_index), 0) + 1 FROM project_steps WHERE project_id = ${a.projectId} AND deleted_at IS NULL),
          ${["from-walk", "owner-asked"]}::text[]
        )
        RETURNING id
      `) as { id: string }[]
      task = made.id
    }
  } else {
    // Taken back, or left as it is after all: a task that nobody has started is withdrawn with it. One in progress is left alone.
    await sql`UPDATE project_steps SET deleted_at = NOW() WHERE project_id = ${a.projectId} AND deleted_at IS NULL AND status = 'pending' AND position(${marker} in description) > 0`
  }
  const settled: Settled | null = a.call ? { call: a.call, at: new Date().toISOString(), ...(task ? { task } : {}) } : null
  for (const r of met) await sql`UPDATE walks SET doc = ${JSON.stringify(settleIn(r.walk, a.key, settled))}::jsonb WHERE id = ${r.id} AND project_id = ${a.projectId}`
  return { key: a.key, call: a.call, walks: met.length, ...(task ? { task } : {}) }
}
