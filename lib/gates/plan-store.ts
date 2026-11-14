/**
 * The plan for a page (what it is supposed to have) and the record of every
 * change to it. Rules are in gate-model.ts; this file is SQL only.
 * Callers check access first.
 */
import { sql } from "@/lib/db/client"
import { buildQuestionInput } from "@/lib/inbox"
import { intakeLine, intakeQuestions, intakeStatus, type Answer } from "./gate-model"
import { comparePlan, decideChange, isSensitive, planClear, planLine, validateChange, type Basis, type Checklist, type Expected, type ExpectSource, type PlanCompare } from "./gate-model"
import { GateError } from "./store"

const APPROVE = "Approve the change", KEEP = "Keep it as planned"

interface ChangeRow {
  id: string; action: "add" | "remove" | "seed"; item: Expected & { count?: number }; reason: string; basis: Basis; quote: string | null
  needs_owner: boolean; why: string; status: "applied" | "waiting" | "approved" | "rejected"; question_id: string | null; created_at: string; decided_at: string | null
}

async function itemsOf(projectId: string, route: string): Promise<Expected[] | null> {
  const [row] = (await sql`SELECT items FROM gate_plans WHERE project_id = ${projectId} AND route = ${route}`) as { items: Expected[] }[]
  return row ? row.items : null
}
async function writeItems(projectId: string, route: string, items: Expected[]) {
  await sql`
    INSERT INTO gate_plans (project_id, route, items) VALUES (${projectId}, ${route}, ${JSON.stringify(items)}::jsonb)
    ON CONFLICT (project_id, route) DO UPDATE SET items = EXCLUDED.items, updated_at = now()
  `
}
const applyTo = (items: Expected[], c: { action: string; item: Expected }) =>
  c.action === "add" ? [...items.filter((i) => i.id !== c.item.id), c.item] : items.filter((i) => i.id !== c.item.id)

/** Takes in the owner's inbox answers for changes that were waiting on them. */
async function settleAnswers(projectId: string, route: string) {
  const waiting = (await sql`
    SELECT c.id, c.action, c.item, j.status AS job_status, j.result
    FROM gate_plan_changes c JOIN agent_jobs j ON j.id = c.question_id
    WHERE c.project_id = ${projectId} AND c.route = ${route} AND c.status = 'waiting' AND j.status <> 'awaiting-unlock'
  `) as { id: string; action: string; item: Expected; result: { answer?: { option?: string | null } } | null }[]
  for (const w of waiting) await settle(projectId, route, w.id, w.result?.answer?.option === APPROVE, "inbox")
}

async function settle(projectId: string, route: string, changeId: string, approve: boolean, via: "planner" | "inbox" | "claude-code", said?: string) {
  const [c] = (await sql`
    UPDATE gate_plan_changes SET status = ${approve ? "approved" : "rejected"}, decided_at = now(), decided_via = ${via}, said = ${said ?? null}
    WHERE id = ${changeId} AND project_id = ${projectId} AND route = ${route} AND status = 'waiting'
    RETURNING action, item
  `) as { action: string; item: Expected }[]
  if (c && approve) await writeItems(projectId, route, applyTo((await itemsOf(projectId, route)) ?? [], c))
  return Boolean(c)
}

/**
 * The owner answers a waiting change: in the Checks tab (via "planner"), or in
 * Claude Code, where the agent asked them and relays their words (via
 * "claude-code"). The owner is not always in the planner, so answering there is
 * never required (owner 2026-11-13): the planner is the record that holds the
 * agent to account. A relayed answer is stored as relayed, with their words, so
 * anyone reading later can see how it was decided.
 */
export async function decidePlanChange(projectId: string, route: string, changeId: string, approve: boolean, via: "planner" | "claude-code" = "planner", said?: string) {
  if (via === "claude-code") {
    if (!said || said.trim().length < 2) throw new GateError("Relay the owner's own reply")
  }
  if (!(await settle(projectId, route, changeId, approve, via, said?.trim().slice(0, 500)))) throw new GateError("That change is not waiting for an answer")
  // The inbox question is answered too, so it does not sit there asking again.
  await sql`
    UPDATE agent_jobs SET status = 'completed', result = ${JSON.stringify({ answer: { option: approve ? APPROVE : KEEP } })}::jsonb
    WHERE id = (SELECT question_id FROM gate_plan_changes WHERE id = ${changeId}) AND status = 'awaiting-unlock'
  `
}

export interface PlanStatus { hasPlan: boolean; compare: PlanCompare | null; line: string; clear: boolean }

/** Where a scan stands against the plan. With no plan recorded, nothing is held against it. */
export async function planStatus(projectId: string, list: Checklist): Promise<PlanStatus> {
  await settleAnswers(projectId, list.route)
  const items = await itemsOf(projectId, list.route)
  if (!items) return { hasPlan: false, compare: null, line: "", clear: true }
  const waiting = (await sql`
    SELECT item->>'id' AS id FROM gate_plan_changes WHERE project_id = ${projectId} AND route = ${list.route} AND status = 'waiting' AND action = 'remove'
  `) as { id: string }[]
  const compare = comparePlan(items, list, waiting.map((w) => w.id))
  return { hasPlan: true, compare, line: planLine(compare), clear: planClear(compare) }
}

/** The plan, its recent changes, and how the latest scan compares. */
export async function loadPlan(projectId: string, route: string, list: Checklist | null) {
  await settleAnswers(projectId, route)
  const items = await itemsOf(projectId, route)
  const changes = (await sql`
    SELECT id, action, item, reason, basis, quote, needs_owner, why, status, question_id, created_at, decided_at, decided_via, said
    FROM gate_plan_changes WHERE project_id = ${projectId} AND route = ${route} ORDER BY created_at DESC LIMIT 40
  `) as ChangeRow[]
  const status = list ? await planStatus(projectId, list) : null
  const intake = intakeStatus(items ?? [])
  return { route, hasPlan: items !== null, intake: { ...intake, open: intake.open.slice(0, 60) }, intakeLine: { attended: intakeLine(intake, true), unattended: intakeLine(intake, false) }, items: items ?? [], changes: changes.map((c) => ({ ...c, answerHere: c.status === "waiting", sensitive: isSensitive(c) })), options: [APPROVE, KEEP], compare: status?.compare ?? null, line: status?.line ?? "" }
}

/**
 * Records the answer to one question about a planned item: why it is there, who uses it, where its content comes
 * from. The answer keeps who gave it and what it rests on. The owner's answer replaces an agent's; an agent cannot
 * replace the owner's.
 */
export async function answerIntake(a: { projectId: string; route: string; item: string; question: string; text: string; by: "owner" | "agent"; basis: Basis; quote?: string }) {
  const items = await itemsOf(a.projectId, a.route)
  if (!items) throw new GateError(`No plan is recorded for ${a.route}`)
  const it = items.find((i) => i.id === a.item) ?? items.find((i) => i.label.toLowerCase() === a.item.toLowerCase().trim())
  if (!it) throw new GateError(`"${a.item}" is not in the plan for ${a.route}`)
  const q = intakeQuestions(it.kind).find((x) => x.id === a.question)
  if (!q) throw new GateError(`"${a.question}" is not a question for this kind of item. Its questions: ${intakeQuestions(it.kind).map((x) => x.id).join(", ")}`)
  if (a.text.trim().length < 3) throw new GateError("Give an answer")
  if (a.by === "agent" && a.basis === "owner_asked" && (a.quote?.trim().length ?? 0) < 8) throw new GateError("Quote the owner's words this answer rests on")
  const old = it.answers?.[q.id]
  if (old?.by === "owner" && a.by === "agent") throw new GateError("The owner has answered this. Only the owner can change it")
  const answer: Answer = { text: a.text.trim().slice(0, 1000), by: a.by, basis: a.basis, ...(a.quote ? { quote: a.quote.trim().slice(0, 600) } : {}), at: new Date().toISOString() }
  await writeItems(a.projectId, a.route, items.map((i) => (i.id === it.id ? { ...i, answers: { ...(i.answers ?? {}), [q.id]: answer } } : i)))
  const left = intakeStatus(items.map((i) => (i.id === it.id ? { ...i, answers: { ...(i.answers ?? {}), [q.id]: answer } } : i)))
  return { item: it.label, question: q.ask, recordedAs: answer.by === "owner" ? "the owner's answer" : answer.basis === "judgment" ? "a proposal for the owner to confirm" : "reasoned from " + answer.basis, missing: left.missing, proposed: left.proposed, next: { attended: intakeLine(left, true), unattended: intakeLine(left, false) } }
}

/** Starts or extends a page's plan from a scan: of an approved mock-up, of a flow, or an agent's reading of the task. */
export async function seedPlan(a: { projectId: string; userId: string; route: string; from: Checklist; source: Exclude<ExpectSource, "owner">; reason: string }) {
  if (a.reason.trim().length < 12) throw new GateError("Say where this plan comes from, so someone reading later can follow")
  const existing = (await itemsOf(a.projectId, a.route)) ?? []
  const have = new Set(existing.map((e) => [e.view ?? "", e.kind ?? "", e.label.toLowerCase()].join("|")))
  const fresh: Expected[] = []
  for (const v of a.from.views) for (const c of v.controls) {
    const key = [v.key, c.kind, c.label.toLowerCase()].join("|")
    if (have.has(key)) continue
    have.add(key)
    fresh.push({ id: crypto.randomUUID(), label: c.label, kind: c.kind, view: v.key, must: c.workflows.map((w) => w.name).join("; "), source: a.source })
  }
  await writeItems(a.projectId, a.route, [...existing, ...fresh])
  await sql`
    INSERT INTO gate_plan_changes (project_id, route, action, item, reason, basis, needs_owner, why, status, created_by)
    VALUES (${a.projectId}, ${a.route}, 'seed', ${JSON.stringify({ id: "seed", label: `${fresh.length} controls`, must: "", source: a.source, count: fresh.length })}::jsonb,
      ${a.reason}, 'evidence', false, 'Recording what is expected only makes the checks stricter.', 'applied', ${a.userId})
  `
  return { added: fresh.length, total: existing.length + fresh.length }
}

/** An agent proposes adding or removing one expectation. It takes effect at once, or waits on the owner; the answer says which and why. */
export async function proposePlanChange(a: {
  projectId: string; userId: string; route: string; action: "add" | "remove"
  label: string; must?: string; kind?: string; view?: string; reason: string; basis: Basis; quote?: string; replacedBy?: string; source?: Exclude<ExpectSource, "owner">
}) {
  const items = (await itemsOf(a.projectId, a.route)) ?? []
  const found = items.find((i) => i.label.toLowerCase() === a.label.toLowerCase().trim() && (!a.view || i.view === a.view))
  if (a.action === "remove" && !found) throw new GateError(`"${a.label}" is not in the plan for ${a.route}`)
  if (a.action === "add" && found) throw new GateError(`"${a.label}" is already in the plan for ${a.route}`)
  const item: Expected = a.action === "remove" ? found! : {
    id: crypto.randomUUID(), label: a.label.trim(), must: (a.must ?? "").trim(), source: a.basis === "owner_asked" ? "owner" : a.source ?? "agent",
    ...(a.kind ? { kind: a.kind } : {}), ...(a.view ? { view: a.view } : {}),
  }
  const change = { action: a.action, item, reason: a.reason, basis: a.basis, quote: a.quote, replacedBy: a.replacedBy }
  const issues = validateChange(change)
  if (issues.length) throw new GateError(issues.map((i) => i.message).join("; "))
  const [shipped] = (await sql`SELECT 1 AS yes FROM gate_checklists WHERE project_id = ${a.projectId} AND route = ${a.route} AND env = 'prod' LIMIT 1`) as { yes: number }[]
  const after = applyTo(items, change)
  const verdict = decideChange(change, { shipped: Boolean(shipped), labels: after.map((i) => i.label) })
  let questionId: string | null = null
  if (verdict.needsOwner) {
    const built = buildQuestionInput({
      question: `${a.action === "add" ? "Add" : "Drop"} "${item.label}" ${a.action === "add" ? "to" : "from"} the plan for ${a.route}?`,
      options: [APPROVE, KEEP],
      context: `Reason given: ${a.reason} Why you are being asked: ${verdict.why} [gate-plan:${a.route}]`,
      projectId: a.projectId,
    })
    if (!built.ok) throw new GateError(built.error)
    const [job] = (await sql`
      INSERT INTO agent_jobs (title, description, created_by, assigned_to, status, priority, input, tags, parent_step_id, unlock_prompt)
      VALUES (${built.value.question.slice(0, 255)}, ${built.value.input.context}, ${a.userId}, 'mcp-client',
        'awaiting-unlock', 'normal', ${JSON.stringify(built.value.input)}::jsonb, ARRAY['question','gate-plan'], NULL, ${built.value.question})
      RETURNING id
    `) as { id: string }[]
    questionId = job.id
  } else await writeItems(a.projectId, a.route, after)
  const [row] = (await sql`
    INSERT INTO gate_plan_changes (project_id, route, action, item, reason, basis, quote, needs_owner, why, status, question_id, created_by)
    VALUES (${a.projectId}, ${a.route}, ${a.action}, ${JSON.stringify(item)}::jsonb, ${a.reason}, ${a.basis}, ${a.quote ?? null},
      ${verdict.needsOwner}, ${verdict.why}, ${verdict.needsOwner ? "waiting" : "applied"}, ${questionId}, ${a.userId})
    RETURNING id
  `) as { id: string }[]
  return {
    changeId: row.id, applied: !verdict.needsOwner, askedOwner: verdict.needsOwner, why: verdict.why, questionId,
    next: verdict.needsOwner ? "The owner has been asked in the planner inbox. Do not wait: carry on with the other checks." : "The plan is updated. Carry on.",
  }
}
