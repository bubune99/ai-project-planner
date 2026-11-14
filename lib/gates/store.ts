/**
 * Checks: reading and writing page checklists, verdicts and pictures.
 * Every rule (what counts as cleared, what comes next, which pictures to
 * delete) is in gate-model.ts; this file is SQL and file storage only.
 * Callers check access first: these functions trust the ids they are given.
 */
import { sql } from "@/lib/db/client"
import {
  allChecks, checkState, diffChecklists, hookLine, imagesToExpire, nextCheck, sameChecklist, summarize, validateChecklist,
  type Actor, type Checklist, type Result, type StoredImage, type Verdict,
} from "./gate-model"

export interface ChecklistRow {
  id: string
  project_id: string
  route: string
  version: number
  title: string | null
  env: string | null
  build: string | null
  doc: Checklist
  created_at: string
}

export class GateError extends Error {}

const iso = (d: string | Date) => new Date(d).toISOString()

async function resultsOf(checklistId: string): Promise<Result[]> {
  const rows = (await sql`
    SELECT check_key, actor, status, note, created_at FROM gate_results WHERE checklist_id = ${checklistId} ORDER BY created_at
  `) as { check_key: string; actor: Actor; status: Verdict; note: string | null; created_at: string }[]
  return rows.map((r) => ({ key: r.check_key, actor: r.actor, status: r.status, note: r.note ?? undefined, at: iso(r.created_at) }))
}

export async function getChecklist(checklistId: string): Promise<ChecklistRow | null> {
  const [row] = (await sql`
    SELECT id, project_id, route, version, title, env, build, doc, created_at FROM gate_checklists WHERE id = ${checklistId}
  `) as ChecklistRow[]
  return row ?? null
}

async function latestFor(projectId: string, route: string, before?: number): Promise<ChecklistRow | null> {
  const [row] = (await sql`
    SELECT id, project_id, route, version, title, env, build, doc, created_at FROM gate_checklists
    WHERE project_id = ${projectId} AND route = ${route} AND (${before ?? null}::int IS NULL OR version < ${before ?? null}::int)
    ORDER BY version DESC LIMIT 1
  `) as ChecklistRow[]
  return row ?? null
}

/** Where a page stands: its checks, and how it compares with its plan. The agent may finish only when both are clear. */
async function progress(row: ChecklistRow, results: Result[]) {
  const { planStatus } = await import("./plan-store")
  const summary = summarize(row.doc, results), plan = await planStatus(row.project_id, row.doc)
  const hook = summary.done && !plan.clear
    ? `All ${summary.total} checks on ${row.route} are cleared, but you may not finish yet. ${plan.line}`
    : [hookLine(row.doc, results), plan.line].filter(Boolean).join(" ")
  return { summary, next: nextCheck(row.doc, results), hook, plan, mayFinish: summary.done && plan.clear }
}

/** Saves a page's checklist. An unchanged list keeps its version and its verdicts; a changed one starts a new version. */
export async function saveChecklist(a: { projectId: string; userId: string; list: Checklist; env?: string; build?: string }) {
  const issues = validateChecklist(a.list)
  if (issues.length) throw new GateError(issues.slice(0, 8).map((i) => `${i.where}: ${i.message}`).join("; "))
  const prev = await latestFor(a.projectId, a.list.route)
  if (prev && sameChecklist(prev.doc, a.list)) {
    return { checklistId: prev.id, version: prev.version, created: false, changes: { added: [], removed: [], kept: allControls(prev.doc) }, ...(await progress(prev, await resultsOf(prev.id))) }
  }
  const [row] = (await sql`
    INSERT INTO gate_checklists (project_id, route, version, title, env, build, doc, created_by)
    VALUES (${a.projectId}, ${a.list.route}, ${(prev?.version ?? 0) + 1}, ${a.list.title ?? null}, ${a.env ?? null}, ${a.build ?? null}, ${JSON.stringify(a.list)}::jsonb, ${a.userId})
    RETURNING id, project_id, route, version, title, env, build, doc, created_at
  `) as ChecklistRow[]
  return { checklistId: row.id, version: row.version, created: true, changes: diffChecklists(prev?.doc ?? null, a.list), ...(await progress(row, [])) }
}

const allControls = (l: Checklist) => l.views.reduce((t, v) => t + v.controls.length, 0)

/** Records one verdict on each of the given checks. */
export async function recordResults(a: { checklist: ChecklistRow; userId: string; keys: string[]; actor: Actor; status: Verdict; note?: string }) {
  if (a.status === "waived" && a.actor !== "owner") throw new GateError("Only the owner can waive a check")
  const known = new Set(allChecks(a.checklist.doc).map((c) => c.key))
  const unknown = a.keys.filter((k) => !known.has(k))
  if (!a.keys.length) throw new GateError("Pass at least one check key")
  if (unknown.length) throw new GateError(`Not on this checklist: ${unknown.slice(0, 5).join(", ")}`)
  if (a.status === "failed" && !a.note?.trim()) throw new GateError("A failed check needs a note saying what went wrong")
  await sql`
    INSERT INTO gate_results (checklist_id, check_key, actor, status, note, created_by)
    SELECT ${a.checklist.id}, k, ${a.actor}, ${a.status}, ${a.note ?? null}, ${a.userId} FROM unnest(${a.keys}::text[]) AS k
  `
  return progress(a.checklist, await resultsOf(a.checklist.id))
}

function imageType(raw: Buffer): "webp" | "jpeg" | "png" | null {
  if (raw.subarray(0, 4).toString("ascii") === "RIFF" && raw.subarray(8, 12).toString("ascii") === "WEBP") return "webp"
  if (raw[0] === 0xff && raw[1] === 0xd8) return "jpeg"
  if (raw.subarray(1, 4).toString("ascii") === "PNG") return "png"
  return null
}

/** Stores a view's picture, or a picture proving a check, then deletes whatever the retention rule no longer keeps. */
export async function attachImage(a: { checklist: ChecklistRow; userId: string; kind: "view" | "evidence"; refKey: string; imageBase64: string }) {
  const doc = a.checklist.doc
  if (a.kind === "view" && !doc.views.some((v) => v.key === a.refKey)) throw new GateError(`No view "${a.refKey}" on this checklist`)
  if (a.kind === "evidence" && !allChecks(doc).some((c) => c.key === a.refKey)) throw new GateError(`No check "${a.refKey}" on this checklist`)
  const raw = Buffer.from(a.imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64")
  if (raw.length > 4 * 1024 * 1024) throw new GateError("Image is over 4 MB")
  const type = imageType(raw)
  if (!type) throw new GateError("Image must be WebP, JPEG or PNG")
  const { uploadToR2, isR2Configured } = await import("@/lib/storage/r2-client")
  if (!isR2Configured()) throw new GateError("File storage is not configured on this server")
  const blobKey = `gates/${a.checklist.project_id}/${a.checklist.id}/${crypto.randomUUID()}.${type === "jpeg" ? "jpg" : type}`
  await uploadToR2(blobKey, raw, `image/${type}`)
  const [row] = (await sql`
    INSERT INTO gate_images (project_id, checklist_id, kind, ref_key, blob_key, byte_size, created_by)
    VALUES (${a.checklist.project_id}, ${a.checklist.id}, ${a.kind}, ${a.refKey}, ${blobKey}, ${raw.length}, ${a.userId})
    RETURNING id
  `) as { id: string }[]
  let swept = null
  try { swept = await sweepGateImages(new Date(), a.checklist.project_id, a.checklist.route) } catch { /* cleanup is best-effort; the picture is saved */ }
  return { imageId: row.id, byteSize: raw.length, swept }
}

/** Stores a view's extract: the page's own HTML with its styles written inline, gzipped. The planner draws it instead of a picture. */
export async function attachExtract(a: { checklist: ChecklistRow; userId: string; viewKey: string; gzBase64: string }) {
  if (!a.checklist.doc.views.some((v) => v.key === a.viewKey)) throw new GateError(`No view "${a.viewKey}" on this checklist`)
  const raw = Buffer.from(a.gzBase64, "base64")
  if (raw[0] !== 0x1f || raw[1] !== 0x8b) throw new GateError("The extract must be gzipped")
  if (raw.length > 1.5 * 1024 * 1024) throw new GateError("The extract is over 1.5 MB gzipped")
  const { uploadToR2, isR2Configured } = await import("@/lib/storage/r2-client")
  if (!isR2Configured()) throw new GateError("File storage is not configured on this server")
  const blobKey = `gates/${a.checklist.project_id}/${a.checklist.id}/${crypto.randomUUID()}.html.gz`
  await uploadToR2(blobKey, raw, "application/gzip")
  const [row] = (await sql`
    INSERT INTO gate_images (project_id, checklist_id, kind, ref_key, blob_key, byte_size, created_by)
    VALUES (${a.checklist.project_id}, ${a.checklist.id}, 'extract', ${a.viewKey}, ${blobKey}, ${raw.length}, ${a.userId})
    RETURNING id
  `) as { id: string }[]
  try { await sweepGateImages(new Date(), a.checklist.project_id, a.checklist.route) } catch { /* cleanup is best-effort */ }
  return { extractId: row.id, byteSize: raw.length }
}

/** A view's extract as HTML text, with anything that could run removed. Null when none is stored. */
export async function readExtract(checklistId: string, viewKey: string): Promise<string | null> {
  const [row] = (await sql`
    SELECT blob_key FROM gate_images WHERE checklist_id = ${checklistId} AND kind = 'extract' AND ref_key = ${viewKey} AND deleted_at IS NULL
    ORDER BY captured_at DESC LIMIT 1
  `) as { blob_key: string }[]
  if (!row) return null
  const { getSignedDownloadUrl } = await import("@/lib/storage/r2-client")
  const res = await fetch(await getSignedDownloadUrl(row.blob_key, 60))
  if (!res.ok) return null
  const { gunzipSync } = await import("node:zlib")
  const html = gunzipSync(Buffer.from(await res.arrayBuffer()), { maxOutputLength: 12 * 1024 * 1024 }).toString("utf8")
  // The page shows this in a sealed frame where nothing can run; scripts and handlers are removed as well.
  return html.replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "").replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2")
}

/** Applies the retention rule to one page's pictures (all versions), or to a whole project. */
export async function sweepGateImages(now: Date, projectId: string, route?: string) {
  const rows = (await sql`
    SELECT i.id, i.kind, i.ref_key, i.blob_key, i.byte_size, i.captured_at, c.id AS checklist_id, c.route, c.version
    FROM gate_images i JOIN gate_checklists c ON c.id = i.checklist_id
    WHERE i.deleted_at IS NULL AND i.project_id = ${projectId} AND (${route ?? null}::text IS NULL OR c.route = ${route ?? null})
  `) as { id: string; kind: StoredImage["kind"]; ref_key: string; blob_key: string; captured_at: string; checklist_id: string; route: string; version: number }[]
  const byRoute = new Map<string, typeof rows>()
  for (const r of rows) byRoute.set(r.route, [...(byRoute.get(r.route) ?? []), r])
  const expire: typeof rows = []
  for (const list of byRoute.values()) {
    const current = Math.max(...list.map((r) => r.version))
    const currentId = list.find((r) => r.version === current)!.checklist_id
    const results = await resultsOf(currentId)
    const images: StoredImage[] = list.map((r) => ({ id: r.id, kind: r.kind, version: r.version, key: r.ref_key, capturedAt: iso(r.captured_at) }))
    const ids = new Set(imagesToExpire(images, current, (key) => checkState(results, key), now))
    expire.push(...list.filter((r) => ids.has(r.id)))
  }
  if (!expire.length) return { checked: rows.length, expired: 0, bytesFreed: 0 }
  const { deleteMultipleFromR2 } = await import("@/lib/storage/r2-client")
  const keys = expire.map((r) => r.blob_key)
  for (let i = 0; i < keys.length; i += 500) await deleteMultipleFromR2(keys.slice(i, i + 500))
  const [freed] = (await sql`
    WITH gone AS (UPDATE gate_images SET deleted_at = now() WHERE id = ANY(${expire.map((r) => r.id)}::uuid[]) RETURNING byte_size)
    SELECT COALESCE(SUM(byte_size), 0)::int AS bytes FROM gone
  `) as { bytes: number }[]
  return { checked: rows.length, expired: expire.length, bytesFreed: freed.bytes }
}

/** Every page of a project that has a checklist: its latest version and where it stands. */
export async function listPages(projectId: string) {
  const rows = (await sql`
    SELECT DISTINCT ON (route) id, project_id, route, version, title, env, build, doc, created_at
    FROM gate_checklists WHERE project_id = ${projectId} ORDER BY route, version DESC
  `) as ChecklistRow[]
  return Promise.all(rows.map(async (row) => {
    const p = await progress(row, await resultsOf(row.id))
    return { id: row.id, route: row.route, title: row.title, version: row.version, env: row.env, build: row.build, createdAt: iso(row.created_at), controls: allControls(row.doc), views: row.doc.views.length, summary: p.summary, mayFinish: p.mayFinish }
  }))
}

/** One page's checklist with its verdicts, its pictures (short-lived links) and what changed since the version before. */
export async function loadPage(row: ChecklistRow) {
  const results = await resultsOf(row.id)
  const images = (await sql`
    SELECT DISTINCT ON (kind, ref_key) id, kind, ref_key, blob_key, captured_at FROM gate_images
    WHERE checklist_id = ${row.id} AND deleted_at IS NULL ORDER BY kind, ref_key, captured_at DESC
  `) as { id: string; kind: StoredImage["kind"]; ref_key: string; blob_key: string; captured_at: string }[]
  const { getSignedDownloadUrl, isR2Configured } = await import("@/lib/storage/r2-client")
  const extracts = images.filter((i) => i.kind === "extract").map((i) => i.ref_key)
  const signed = isR2Configured()
    ? await Promise.all(images.filter((i) => i.kind !== "extract").map(async (i) => ({ kind: i.kind, key: i.ref_key, url: await getSignedDownloadUrl(i.blob_key, 3600), capturedAt: iso(i.captured_at) })))
    : []
  const prev = await latestFor(row.project_id, row.route, row.version)
  return {
    id: row.id, route: row.route, title: row.title, version: row.version, env: row.env, build: row.build, createdAt: iso(row.created_at),
    checklist: row.doc, results, images: signed, extracts, changes: diffChecklists(prev?.doc ?? null, row.doc), ...(await progress(row, results)),
  }
}
