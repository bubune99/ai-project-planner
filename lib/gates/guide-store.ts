/**
 * Guides: reading and writing the stack entries and statements. Rules are in guides.ts; this file is SQL only.
 *
 * A REMOVED guide keeps its row and its versions: its newest version carries removed: true in its content, and
 * every read below leaves such a guide out (the same EXISTS in each query). Nothing is deleted, because deleting the
 * row would take its history with it (gate_guide_versions cascades), and no table change was needed.
 */
import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db/client"
import { DEFAULT_GUIDES } from "./default-guides"
import {
  historyOf, readChange, refusal, sameContent, savingOverRemoved, startingSet, storedContent, toRules, toStored, validateGuide, versionToPutBack, versionToRestore, withTrial,
  type Guide, type GuideContent, type GuideVersion, type Saver, type VersionChange,
} from "./guides"
import { ledgerRecords } from "./code-result-store"
import { ledgerOf, trialBegan, type Ledger } from "./guide-ledger"
import { GateError } from "./store"

type Row = Guide & { project_id: string | null; updated_at: string }

/** A save that does not say who made it came from an agent's tool: it is never recorded as the owner's. */
const UNNAMED_AGENT: Saver = { kind: "agent", name: "" }

/** A person's guides: those for all their projects, plus one project's own when given. Removed ones are left out. */
export async function listGuides(userId: string, projectId?: string | null): Promise<Row[]> {
  return (await sql`
    SELECT g.id, g.kind, g.name, g.summary, g.skill, g.applies, g.checks, g.status, g.source, g.basis, to_char(g.trial_until, 'YYYY-MM-DD') AS "trialUntil", g.project_id, g.updated_at
    FROM gate_guides g WHERE g.user_id = ${userId} AND (g.project_id IS NULL OR g.project_id = ${projectId ?? null}::uuid)
      AND NOT EXISTS (SELECT 1 FROM gate_guide_versions v WHERE v.guide_id = g.id AND v.content->>'removed' = 'true'
        AND v.version = (SELECT max(x.version) FROM gate_guide_versions x WHERE x.guide_id = g.id))
    ORDER BY g.kind, lower(g.name)
  `) as Row[]
}

export type RemovedGuide = Pick<Guide, "id" | "kind" | "name" | "summary" | "status"> & { removedAt: string }

/** The guides the owner removed, newest removal first, so each can be put back. Same reach as listGuides. */
export async function listRemovedGuides(userId: string, projectId?: string | null): Promise<RemovedGuide[]> {
  const rows = (await sql`
    SELECT g.id, g.kind, g.name, g.summary, g.status, v.created_at
    FROM gate_guides g JOIN gate_guide_versions v ON v.guide_id = g.id
    WHERE g.user_id = ${userId} AND (g.project_id IS NULL OR g.project_id = ${projectId ?? null}::uuid)
      AND v.content->>'removed' = 'true' AND v.version = (SELECT max(x.version) FROM gate_guide_versions x WHERE x.guide_id = g.id)
    ORDER BY v.created_at DESC
  `) as (Omit<RemovedGuide, "removedAt"> & { created_at: string | Date })[]
  return rows.map(({ created_at, ...g }) => ({ ...g, removedAt: new Date(created_at).toISOString() }))
}

/** The rules the plugin applies, compiled from the active guides. A statement on trial is enforced like any other. */
export async function rulesFor(userId: string, projectId?: string | null) {
  const guides = await listGuides(userId, projectId)
  return { rules: toRules(guides), guides: guides.filter((g) => g.status === "active").map((g) => ({ name: g.name, kind: g.kind, skill: g.skill ?? null })) }
}

/** A guide on the list, or (removed: true) one that was removed. Asking for the other kind finds nothing. */
async function guideById(userId: string, id: string, removed = false): Promise<GuideContent> {
  const rows = (await sql`
    SELECT g.kind, g.name, g.summary, g.skill, g.applies, g.checks, g.status, g.source, g.basis, to_char(g.trial_until, 'YYYY-MM-DD') AS "trialUntil"
    FROM gate_guides g WHERE g.id = ${id}::uuid AND g.user_id = ${userId}
      AND EXISTS (SELECT 1 FROM gate_guide_versions v WHERE v.guide_id = g.id AND v.content->>'removed' = 'true'
        AND v.version = (SELECT max(x.version) FROM gate_guide_versions x WHERE x.guide_id = g.id)) = ${removed}::boolean
  `) as unknown[]
  if (!rows.length) throw new GateError(removed ? "That one is not removed, so there is nothing to put back" : "Guide not found")
  return storedContent(rows[0])
}

/**
 * Writes a guide's new content and keeps it as a version, in one transaction. If the guide existed before history
 * was kept, the state it was in is kept first (as version 1, saved by "before"), so the first change loses nothing.
 */
async function writeVersion(userId: string, id: string, c: GuideContent, by: Saver, change: VersionChange, opts: { projectId?: string | null; isNew?: boolean; restoredFrom?: number } = {}) {
  const no = refusal(by, change)
  if (no) throw new GateError(no)
  // A removal and a putting back are kept in the kinds of change the table allows, with a mark in the content.
  const stored = toStored(change)
  const kept = stored.mark ? { ...c, [stored.mark]: true } : c
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
    SELECT ${id}::uuid, ${userId}::uuid, COALESCE(max(version), 0) + 1, ${by.kind}::text, ${by.kind === "agent" ? by.name.trim().slice(0, 80) : ""}::text, ${stored.change}::text,
      ${opts.restoredFrom ?? null}::integer, ${JSON.stringify(kept)}::jsonb
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
    SELECT g.id, to_char(g.trial_until, 'YYYY-MM-DD') AS "trialUntil",
      EXISTS (SELECT 1 FROM gate_guide_versions v WHERE v.guide_id = g.id AND v.content->>'removed' = 'true'
        AND v.version = (SELECT max(x.version) FROM gate_guide_versions x WHERE x.guide_id = g.id)) AS removed
    FROM gate_guides g
    WHERE g.user_id = ${userId} AND COALESCE(g.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(${projectId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND lower(g.name) = lower(${g.name.trim()})
  `) as { id: string; trialUntil: string | null; removed: boolean }[]
  const next = storedContent({ ...g, trialUntil: prev?.trialUntil ?? null })
  if (!prev) {
    const id = randomUUID()
    await writeVersion(userId, id, next, by, "saved", { projectId, isNew: true })
    return { id }
  }
  if (prev.removed) {
    // The name belongs to one the owner removed. The owner saving it again brings it back with this content, as a
    // new version (even when nothing differs: it is the save that puts it back). An agent may not.
    const no = savingOverRemoved(by, g.name)
    if (no) throw new GateError(no)
    await writeVersion(userId, prev.id, next, by, "saved")
    return { id: prev.id }
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

type VersionRow = { version: number; saved_by: "owner" | "agent" | "before"; saved_by_name: string; change: string; restored_from: number | null; content: unknown; created_at: string | Date }

const toVersion = (r: VersionRow): GuideVersion => ({
  version: r.version, at: new Date(r.created_at).toISOString(), change: readChange(r.change, r.content),
  by: r.saved_by === "agent" ? { kind: "agent", name: r.saved_by_name } : { kind: r.saved_by },
  ...(r.restored_from === null ? {} : { restoredFrom: r.restored_from }),
  content: storedContent(r.content),
})

async function versionsOf(userId: string, id: string): Promise<GuideVersion[]> {
  const rows = (await sql`
    SELECT version, saved_by, saved_by_name, change, restored_from, content, created_at
    FROM gate_guide_versions WHERE guide_id = ${id}::uuid AND user_id = ${userId} ORDER BY version
  `) as VersionRow[]
  return rows.map(toVersion)
}

/**
 * Every guide's ledger, by guide id: since when it has been in force as worded and on trial (from the versions
 * kept), and its check numbers (from the results the plugin sends: code-result-store.ts, migration 088, counted
 * across all the person's projects). checkResultsKept is false, and every statement has no numbers, while that table
 * is not there or holds nothing of theirs. Four queries at most however many guides there are.
 */
export async function guideLedgers(userId: string, projectId?: string | null): Promise<{ checkResultsKept: boolean; ledgers: Record<string, Ledger> }> {
  const guides = await listGuides(userId, projectId)
  const rows = (await sql`
    SELECT guide_id, version, saved_by, saved_by_name, change, restored_from, content, created_at
    FROM gate_guide_versions WHERE user_id = ${userId} ORDER BY guide_id, version
  `) as (VersionRow & { guide_id: string })[]
  const byGuide = new Map<string, GuideVersion[]>()
  for (const r of rows) byGuide.set(r.guide_id, [...(byGuide.get(r.guide_id) ?? []), toVersion(r)])
  const all = guides.map((g) => ({ guide: { ...storedContent(g), id: g.id, updatedAt: g.updated_at ? new Date(g.updated_at).toISOString() : null }, versions: byGuide.get(g.id) ?? [] }))
  // The trials' own numbers need each result since the earliest trial began; without a trial that is not read at all.
  const began = all.map((x) => trialBegan(x.guide, x.versions)).filter((at): at is string => !!at).sort()
  const { kept, records, sinceTrial } = await ledgerRecords(userId, began[0] ?? null)
  const ledgers: Record<string, Ledger> = {}
  for (const x of all) ledgers[x.guide.id] = ledgerOf(x.guide, x.versions, records, sinceTrial)
  return { checkResultsKept: kept, ledgers }
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

/**
 * Removes a guide: it leaves the list and the rules at once, and its history records who removed it and when. The
 * row and every version stay, so it can be put back exactly as it was. The owner's only.
 */
export async function removeGuide(userId: string, id: string, by: Saver) {
  const no = refusal(by, "removed")
  if (no) throw new GateError(no)
  const current = await guideById(userId, id)
  await writeVersion(userId, id, current, by, "removed")
  return { id, name: current.name }
}

/** Puts a removed guide back as it was: same id, wording, kind, draft or rule, and trial. The owner's only. */
export async function putBackGuide(userId: string, id: string, by: Saver) {
  const no = refusal(by, "put-back")
  if (no) throw new GateError(no)
  await guideById(userId, id, true)
  const found = versionToPutBack(await versionsOf(userId, id))
  if ("error" in found) throw new GateError(found.error)
  await writeVersion(userId, id, found.content, by, "put-back", { restoredFrom: found.restoredFrom })
  return { id, name: found.content.name }
}

/**
 * Installs the starting set. Guides on the list (by name) are left exactly as they are. One the owner removed comes
 * back, in the starting wording, only when it is the owner asking; for an agent it stays removed and is named.
 */
export async function installDefaults(userId: string, by: Saver = UNNAMED_AGENT) {
  const live = (await listGuides(userId)).map((g) => g.name)
  const removed = (await listRemovedGuides(userId)).map((g) => g.name)
  const plan = startingSet(DEFAULT_GUIDES.map((g) => g.name), live, removed, by)
  for (const g of DEFAULT_GUIDES) if (plan.add.includes(g.name)) await saveGuide(userId, g, null, by)
  return { added: plan.add, kept: live.length, leftRemoved: plan.leftRemoved }
}
