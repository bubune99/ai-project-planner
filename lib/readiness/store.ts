/**
 * Launch readiness: storage. Tables from migration 060 (project_readiness,
 * project_validations, project_validation_events).
 *
 * Every write goes through the rules in model.ts (agents pass only
 * machine-checked code items, everything else they propose; only the owner
 * waives) and input.ts (what is accepted from outside), and every change of
 * state lands in project_validation_events.
 *
 * Callers check project access first.
 */

import { sql } from "@/lib/db/client"
import { authorize, computeReadiness, itemById, planSync, type ActorKind, type Evidence, type LaunchType, type Profile, type Readiness, type ValidationRow, type ValidationState } from "./model"
import { MAX_EVIDENCE, cleanEvidence, cleanSyncResults, isOverride, type Actor } from "./input"

interface ProfileRecord { launch_type: string; regions: string[] | null; traits: string[] | null; domain: string | null; site_url: string | null }
interface RowRecord { item_id: string; state: string; reason: string | null; evidence: Evidence[] | null; decided_by: string | null; actor_kind: string; decided_at: string | Date }
export interface HistoryRecord { item_id: string; from_state: string | null; to_state: string; reason: string | null; actor: string | null; actor_kind: string; source: string; override: boolean; created_at: string | Date }

export async function getProfile(projectId: string): Promise<Profile | null> {
  const [p] = (await sql`
    SELECT launch_type, regions, traits, domain, site_url FROM project_readiness WHERE project_id = ${projectId}
  `) as ProfileRecord[]
  if (!p) return null
  return { launchType: p.launch_type as LaunchType, regions: p.regions ?? [], traits: p.traits ?? [], domain: p.domain, siteUrl: p.site_url }
}

export async function saveProfile(projectId: string, p: Profile, actor: Actor): Promise<void> {
  await sql`
    INSERT INTO project_readiness (project_id, launch_type, regions, traits, domain, site_url, updated_by, documentation_5wh)
    VALUES (${projectId}, ${p.launchType}, ${p.regions}, ${p.traits}, ${p.domain ?? null}, ${p.siteUrl ?? null}, ${actor.id},
      ${JSON.stringify({ why: { rationale: "Launch profile: decides which readiness validations apply (plans-and-evidence spec)." } })}::jsonb)
    ON CONFLICT (project_id) DO UPDATE SET
      launch_type = EXCLUDED.launch_type, regions = EXCLUDED.regions, traits = EXCLUDED.traits,
      domain = EXCLUDED.domain, site_url = EXCLUDED.site_url, updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `
}

export async function listRows(projectId: string): Promise<ValidationRow[]> {
  const rows = (await sql`
    SELECT item_id, state, reason, evidence, decided_by, actor_kind, decided_at
    FROM project_validations WHERE project_id = ${projectId}
  `) as RowRecord[]
  return rows.map((r) => ({
    itemId: r.item_id,
    state: r.state as ValidationState,
    reason: r.reason,
    evidence: Array.isArray(r.evidence) ? r.evidence : [],
    decidedBy: r.decided_by,
    actorKind: r.actor_kind as ActorKind,
    decidedAt: r.decided_at instanceof Date ? r.decided_at.toISOString() : String(r.decided_at),
  }))
}

/** The profile and the computed readiness as of `now` (an ISO time the caller passes in). */
export async function getReadiness(projectId: string, now: string): Promise<{ profile: Profile | null; readiness: Readiness | null }> {
  const profile = await getProfile(projectId)
  if (!profile) return { profile: null, readiness: null }
  return { profile, readiness: computeReadiness(profile, await listRows(projectId), now) }
}

/**
 * Set one validation. Returns the state actually stored (an agent's "passed"
 * can come back as "proposed") and a note explaining any downgrade.
 */
export async function setValidation(
  projectId: string,
  itemId: string,
  wanted: unknown,
  input: { reason?: unknown; evidence?: unknown },
  actor: Actor,
): Promise<{ ok: true; state: ValidationState; note?: string } | { ok: false; error: string; status: number }> {
  const item = itemById(itemId)
  if (!item) return { ok: false, error: `unknown checklist item ${itemId.slice(0, 80)}`, status: 404 }
  if (typeof wanted !== "string") return { ok: false, error: "state is required", status: 400 }
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 2000) : null
  const evidence = cleanEvidence(input.evidence)
  if (typeof evidence === "string") return { ok: false, error: evidence, status: 400 }
  const auth = authorize(item, wanted as ValidationState, actor.kind, { reason, evidence })
  if (!auth.ok) return { ok: false, error: auth.error, status: 400 }

  const [prev] = (await sql`
    SELECT state, evidence FROM project_validations WHERE project_id = ${projectId} AND item_id = ${itemId}
  `) as { state: string; evidence: Evidence[] | null }[]
  const override = isOverride(actor.kind, auth.state, prev)
  const merged = [...(prev?.evidence ?? []), ...evidence].slice(-MAX_EVIDENCE)
  const storedReason = auth.note ? `${reason ? reason + " " : ""}(${auth.note})` : reason

  await sql`
    INSERT INTO project_validations (project_id, item_id, state, reason, evidence, decided_by, actor_kind, source, decided_at, documentation_5wh)
    VALUES (${projectId}, ${itemId}, ${auth.state}, ${storedReason}, ${JSON.stringify(merged)}::jsonb, ${actor.id}, ${actor.kind}, ${actor.source}, NOW(),
      ${JSON.stringify({ what: { title: item.title }, why: { rationale: storedReason ?? `Set to ${auth.state}` } })}::jsonb)
    ON CONFLICT (project_id, item_id) DO UPDATE SET
      state = EXCLUDED.state, reason = EXCLUDED.reason, evidence = EXCLUDED.evidence, decided_by = EXCLUDED.decided_by,
      actor_kind = EXCLUDED.actor_kind, source = EXCLUDED.source, decided_at = NOW(), updated_at = NOW()
  `
  await sql`
    INSERT INTO project_validation_events (project_id, item_id, from_state, to_state, reason, evidence, actor, actor_kind, source, override)
    VALUES (${projectId}, ${itemId}, ${prev?.state ?? null}, ${auth.state}, ${storedReason}, ${JSON.stringify(evidence)}::jsonb, ${actor.id}, ${actor.kind}, ${actor.source}, ${override})
  `
  return { ok: true, state: auth.state, ...(auth.note ? { note: auth.note } : {}) }
}

/** Apply a scanner run's machine results (see planSync for the rules). */
export async function applySync(
  projectId: string,
  results: unknown,
  ranAt: string,
  actor: Actor,
): Promise<{ ok: true; applied: { itemId: string; state: ValidationState }[]; skipped: number } | { ok: false; error: string }> {
  const clean = cleanSyncResults(results)
  if (!clean) return { ok: false, error: "results must be an array" }
  const plan = planSync(clean, await listRows(projectId), ranAt)
  const applied: { itemId: string; state: ValidationState }[] = []
  for (const p of plan) {
    if (p.state === "unvalidated") {
      const [gone] = (await sql`
        DELETE FROM project_validations WHERE project_id = ${projectId} AND item_id = ${p.itemId} AND actor_kind = 'agent' RETURNING state
      `) as { state: string }[]
      if (gone) {
        await sql`
          INSERT INTO project_validation_events (project_id, item_id, from_state, to_state, reason, evidence, actor, actor_kind, source)
          VALUES (${projectId}, ${p.itemId}, ${gone.state}, 'unvalidated', ${p.reason}, ${JSON.stringify([p.evidence])}::jsonb, ${actor.id}, ${actor.kind}, ${actor.source})
        `
        applied.push({ itemId: p.itemId, state: "unvalidated" })
      }
      continue
    }
    const r = await setValidation(projectId, p.itemId, p.state, { reason: p.reason, evidence: [p.evidence] }, actor)
    if (r.ok) applied.push({ itemId: p.itemId, state: r.state })
  }
  return { ok: true, applied, skipped: (results as unknown[]).length - applied.length }
}

export async function history(projectId: string, itemId?: string, limit = 50): Promise<HistoryRecord[]> {
  const rows = itemId
    ? await sql`SELECT item_id, from_state, to_state, reason, actor, actor_kind, source, override, created_at FROM project_validation_events WHERE project_id = ${projectId} AND item_id = ${itemId} ORDER BY created_at DESC LIMIT ${limit}`
    : await sql`SELECT item_id, from_state, to_state, reason, actor, actor_kind, source, override, created_at FROM project_validation_events WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT ${limit}`
  return rows as HistoryRecord[]
}
