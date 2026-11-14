/**
 * People and flows: one document per project, and the record of every change
 * to it. Rules are in people-model.ts; this file is SQL only. Callers check
 * access first.
 */
import { sql } from "@/lib/db/client"
import { describeChanges, emptyDoc, parseDoc, type FlowDoc } from "./people-model"

export class FlowError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) { super(message) }
}

const iso = (d: string | Date) => new Date(d).toISOString()

export async function loadFlows(projectId: string) {
  const [row] = (await sql`SELECT doc, version, updated_at FROM people_flows WHERE project_id = ${projectId}`) as { doc: unknown; version: number; updated_at: string }[]
  const log = (await sql`
    SELECT version, actor, lines, created_at FROM people_flow_changes WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 40
  `) as { version: number; actor: "owner" | "agent"; lines: string[]; created_at: string }[]
  return {
    // Read through the same parser as a save, so an older document never reaches the page in a shape it cannot draw.
    doc: row ? parseDoc(row.doc).doc : emptyDoc(),
    version: row?.version ?? 0,
    updatedAt: row ? iso(row.updated_at) : null,
    log: log.map((l) => ({ version: l.version, actor: l.actor, lines: l.lines, at: iso(l.created_at) })),
  }
}

/**
 * Saves the whole document. `baseVersion` is the version the sender was looking at: if someone else saved since, the
 * save is refused rather than silently overwriting them. Nothing changed means nothing is written or recorded.
 */
export async function saveFlows(a: { projectId: string; userId: string; raw: unknown; baseVersion: number; actor: "owner" | "agent" }): Promise<{ doc: FlowDoc; version: number; lines: string[] }> {
  const { doc, errors } = parseDoc(a.raw)
  if (errors.length) throw new FlowError(errors.slice(0, 6).join(". "))
  const current = await loadFlows(a.projectId)
  if (current.version !== a.baseVersion) throw new FlowError("Someone else changed this since you opened it. It has been reloaded; make your change again.", 409)
  const lines = describeChanges(current.doc, doc)
  if (!lines.length) return { doc: current.doc, version: current.version, lines }
  const next = current.version + 1, json = JSON.stringify(doc)
  // The version in the WHERE makes two saves at once safe: only one of them matches.
  const written = current.version === 0
    ? ((await sql`INSERT INTO people_flows (project_id, doc, version, updated_by) VALUES (${a.projectId}, ${json}::jsonb, 1, ${a.userId}) ON CONFLICT (project_id) DO NOTHING RETURNING version`) as unknown[])
    : ((await sql`UPDATE people_flows SET doc = ${json}::jsonb, version = ${next}, updated_by = ${a.userId}, updated_at = now() WHERE project_id = ${a.projectId} AND version = ${current.version} RETURNING version`) as unknown[])
  if (!written.length) throw new FlowError("Someone else changed this at the same moment. It has been reloaded; make your change again.", 409)
  await sql`INSERT INTO people_flow_changes (project_id, version, actor, created_by, lines) VALUES (${a.projectId}, ${next}, ${a.actor}, ${a.userId}, ${JSON.stringify(lines.slice(0, 60))}::jsonb)`
  return { doc, version: next, lines }
}
