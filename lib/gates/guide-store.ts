/** Guides: reading and writing the stack entries and statements. Rules are in guides.ts; this file is SQL only. */
import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db/client"
import { DEFAULT_GUIDES } from "./default-guides"
import {
  historyOf, refusal, sameContent, storedContent, toRules, validateGuide, versionToRestore, withTrial,
  type Guide, type GuideContent, type GuideVersion, type Saver, type VersionChange,
} from "./guides"
import { GateError } from "./store"

type Row = Guide & { project_id: string | null; updated_at: string }

/** A save that does not say who made it came from an agent's tool: it is never recorded as the owner's. */
const UNNAMED_AGENT: Saver = { kind: "agent", name: "" }

/** A person's guides: those for all their projects, plus one project's own when given. */
export async function listGuides(userId: string, projectId?: string | null): Promise<Row[]> {
  return (await sql`
    SELECT id, kind, name, summary, skill, applies, checks, status, source, basis, to_char(trial_until, 'YYYY-MM-DD') AS "trialUntil", project_id, updated_at
    FROM gate_guides WHERE user_id = ${userId} AND (project_id IS NULL OR project_id = ${projectId ?? null}::uuid)
    ORDER BY kind, lower(name)
  `) as Row[]
}

/** The rules the plugin applies, compiled from the active guides. A statement on trial is enforced like any other. */
export async function rulesFor(userId: string, projectId?: string | null) {
  const guides = await listGuides(userId, projectId)
  return { rules: toRules(guides), guides: guides.filter((g) => g.status === "active").map((g) => ({ name: g.name, kind: g.kind, skill: g.skill ?? null })) }
}

async function guideById(userId: string, id: string): Promise<GuideContent> {
  const rows = (await sql`
    SELECT kind, name, summary, skill, applies, checks, status, source, basis, to_char(trial_until, 'YYYY-MM-DD') AS "trialUntil"
    FROM gate_guides WHERE id = ${id}::uuid AND user_id = ${userId}
  `) as unknown[]
  if (!rows.length) throw new GateError("Guide not found")
  return storedContent(rows[0])
}

/**
 * Writes a guide's new content and keeps it as a version, in one transaction. If the guide existed before history
 * was kept, the state it was in is kept first (as version 1, saved by "before"), so the first change loses nothing.
 */
async function writeVersion(userId: string, id: string, c: GuideContent, by: Saver, change: VersionChange, opts: { projectId?: string | null; isNew?: boolean; restoredFrom?: number } = {}) {
  const no = refusal(by, change)
  if (no) throw new GateError(no)
  const baseline = sql`
    INSERT INTO gate_guide_versions (guide_id, user_id, version, saved_by, change, content, created_at)
    SELECT g.id, g.user_id, 1, 'before', 'before',
      jsonb_build_object('kind', g.kind, 'name', g.name, 'summary', g.summary, 'skill', g.skill, 'applies', g.applies, 'checks', g.checks,
        'status', g.status, 'source', g.source, 'basis', g.basis, 'trialUntil', to_char(g.trial_until, 'YYYY-MM-DD')),
      g.updated_at
    FROM gate_guides g
    WHERE g.id = ${id}::uuid AND g.user_id = ${userId} AND NOT EXISTS (SELECT 1 FROM gate_guide_versions v WHERE v.guide_id = g.id)
  `
  const write = opts.isNew
    ? sql`
      INSERT INTO gate_guides (id, user_id, project_id, kind, name, summary, skill, applies, checks, status, source, basis, trial_until)
      VALUES (${id}::uuid, ${userId}, ${opts.projectId ?? null}, ${c.kind}, ${c.name.trim()}, ${c.summary.trim()}, ${c.skill ?? null}, ${JSON.stringify(c.applies)}::jsonb,
        ${JSON.stringify(c.checks)}::jsonb, ${c.status}, ${c.source}, ${c.basis.trim()}, ${c.trialUntil}::date)
    `
    : sql`
      UPDATE gate_guides SET kind = ${c.kind}, summary = ${c.summary.trim()}, skill = ${c.skill ?? null}, applies = ${JSON.stringify(c.applies)}::jsonb,
        checks = ${JSON.stringify(c.checks)}::jsonb, status = ${c.status}, source = ${c.source}, basis = ${c.basis.trim()}, trial_until = ${c.trialUntil}::date, updated_at = now()
      WHERE id = ${id}::uuid AND user_id = ${userId}
    `
  const record = sql`
    INSERT INTO gate_guide_versions (guide_id, user_id, version, saved_by, saved_by_name, change, restored_from, content)
    SELECT ${id}::uuid, ${userId}::uuid, COALESCE(max(version), 0) + 1, ${by.kind}::text, ${by.kind === "agent" ? by.name.trim().slice(0, 80) : ""}::text, ${change}::text,
      ${opts.restoredFrom ?? null}::integer, ${JSON.stringify(c)}::jsonb
    FROM gate_guide_versions WHERE guide_id = ${id}::uuid
  `
  await sql.transaction([baseline, write, record])
}

/**
 * Adds a guide, or replaces the one with the same name; the earlier version is kept. A save never changes whether a
 * statement is on trial: that is the owner's, through setGuideTrial. Saving the same content again is not a new version.
 */
export async function saveGuide(userId: string, g: Omit<Guide, "id" | "trialUntil">, projectId?: string | null, by: Saver = UNNAMED_AGENT) {
  const issues = validateGuide({ ...g, id: "new" })
  if (issues.length) throw new GateError(issues.map((i) => `${i.where}: ${i.message}`).join("; "))
  const [prev] = (await sql`
    SELECT id, to_char(trial_until, 'YYYY-MM-DD') AS "trialUntil" FROM gate_guides
    WHERE user_id = ${userId} AND COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(${projectId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND lower(name) = lower(${g.name.trim()})
  `) as { id: string; trialUntil: string | null }[]
  const next = storedContent({ ...g, trialUntil: prev?.trialUntil ?? null })
  if (!prev) {
    const id = randomUUID()
    await writeVersion(userId, id, next, by, "saved", { projectId, isNew: true })
    return { id }
  }
  // The name is the key and stays as first written (as before); everything else is compared.
  const current = await guideById(userId, prev.id)
  if (!sameContent(current, { ...next, name: current.name })) await writeVersion(userId, prev.id, next, by, "saved")
  return { id: prev.id }
}

/** Settles a draft, or sets a guide aside without deleting it. */
export async function setGuideStatus(userId: string, id: string, status: "active" | "draft", by: Saver = UNNAMED_AGENT) {
  const current = await guideById(userId, id)
  if (current.status !== status) await writeVersion(userId, id, { ...current, status }, by, "status")
}

/** Puts a statement on trial until a day, or (null) makes it permanent. The owner's only. */
export async function setGuideTrial(userId: string, id: string, until: string | null, by: Saver, today: string) {
  const change: VersionChange = until === null ? "permanent" : "trial"
  const no = refusal(by, change)
  if (no) throw new GateError(no)
  const current = await guideById(userId, id)
  const next = withTrial(current, until, today)
  if ("error" in next) throw new GateError(next.error)
  if (!sameContent(current, next)) await writeVersion(userId, id, next, by, change)
}

async function versionsOf(userId: string, id: string): Promise<GuideVersion[]> {
  const rows = (await sql`
    SELECT version, saved_by, saved_by_name, change, restored_from, content, created_at
    FROM gate_guide_versions WHERE guide_id = ${id}::uuid AND user_id = ${userId} ORDER BY version
  `) as { version: number; saved_by: "owner" | "agent" | "before"; saved_by_name: string; change: VersionChange; restored_from: number | null; content: unknown; created_at: string | Date }[]
  return rows.map((r) => ({
    version: r.version, at: new Date(r.created_at).toISOString(), change: r.change,
    by: r.saved_by === "agent" ? { kind: "agent", name: r.saved_by_name } : { kind: r.saved_by },
    ...(r.restored_from === null ? {} : { restoredFrom: r.restored_from }),
    content: storedContent(r.content),
  }))
}

/** Every kept version of a guide, newest first: who, when, what changed, and the content so it can be read. */
export async function listGuideVersions(userId: string, id: string) {
  await guideById(userId, id)
  const versions = await versionsOf(userId, id)
  const content = new Map(versions.map((v) => [v.version, v.content]))
  return { versions: historyOf(versions).map((h) => ({ ...h, content: content.get(h.version)! })) }
}

/** Restores an earlier version. The restore is itself a new version; nothing leaves the history. The owner's only. */
export async function restoreGuideVersion(userId: string, id: string, version: number, by: Saver) {
  const no = refusal(by, "restored")
  if (no) throw new GateError(no)
  const current = await guideById(userId, id)
  const found = versionToRestore(await versionsOf(userId, id), version)
  if ("error" in found) throw new GateError(found.error)
  const next = { ...found.content, name: current.name }
  const issues = validateGuide({ ...next, id })
  if (issues.length) throw new GateError(`That version cannot be restored as it is: ${issues.map((i) => i.message).join("; ")}`)
  await writeVersion(userId, id, next, by, "restored", { restoredFrom: version })
}

/** Installs the starting set. Guides that already exist (by name) are left exactly as they are. */
export async function installDefaults(userId: string, by: Saver = UNNAMED_AGENT) {
  const have = new Set((await listGuides(userId)).map((g) => g.name.toLowerCase()))
  const added: string[] = []
  for (const g of DEFAULT_GUIDES) {
    if (have.has(g.name.toLowerCase())) continue
    await saveGuide(userId, g, null, by)
    added.push(g.name)
  }
  return { added, kept: have.size }
}
