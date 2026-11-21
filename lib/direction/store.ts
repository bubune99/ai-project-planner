/**
 * Direction: one document per project and the record of every change to it. Rules are in direction-model.ts; this
 * file is SQL only. Callers check access first.
 */
import { sql } from "@/lib/db/client"
import { agentRefusals, describeChanges, emptyDoc, parseDoc, type DirectionDoc } from "./direction-model"

export class DirectionError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) { super(message) }
}

const iso = (d: string | Date) => new Date(d).toISOString()

export async function loadDirection(projectId: string) {
  const [row] = (await sql`SELECT doc, version, updated_at FROM project_direction WHERE project_id = ${projectId}`) as { doc: unknown; version: number; updated_at: string }[]
  const log = (await sql`
    SELECT version, actor, lines, created_at FROM project_direction_changes WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 40
  `) as { version: number; actor: "owner" | "agent"; lines: string[]; created_at: string }[]
  return {
    doc: row ? parseDoc(row.doc).doc : emptyDoc(),
    version: row?.version ?? 0,
    updatedAt: row ? iso(row.updated_at) : null,
    log: log.map((l) => ({ version: l.version, actor: l.actor, lines: l.lines, at: iso(l.created_at) })),
  }
}

/** Saves the whole document; refused when someone else saved since `baseVersion`. Nothing changed writes nothing. */
export async function saveDirection(a: { projectId: string; userId: string; raw: unknown; baseVersion: number; actor: "owner" | "agent" }): Promise<{ doc: DirectionDoc; version: number; lines: string[] }> {
  const { doc, errors } = parseDoc(a.raw)
  if (errors.length) throw new DirectionError(errors.slice(0, 6).join(". "))
  const current = await loadDirection(a.projectId)
  if (current.version !== a.baseVersion) throw new DirectionError("Someone else changed this since you opened it. It has been reloaded; make your change again.", 409)
  if (a.actor === "agent") {
    const refused = agentRefusals(current.doc, doc)
    if (refused.length) throw new DirectionError(refused.slice(0, 4).join(". "))
  }
  const lines = describeChanges(current.doc, doc)
  if (!lines.length) return { doc: current.doc, version: current.version, lines }
  const next = current.version + 1, json = JSON.stringify(doc)
  const written = current.version === 0
    ? ((await sql`INSERT INTO project_direction (project_id, doc, version, updated_by) VALUES (${a.projectId}, ${json}::jsonb, 1, ${a.userId}) ON CONFLICT (project_id) DO NOTHING RETURNING version`) as unknown[])
    : ((await sql`UPDATE project_direction SET doc = ${json}::jsonb, version = ${next}, updated_by = ${a.userId}, updated_at = now() WHERE project_id = ${a.projectId} AND version = ${current.version} RETURNING version`) as unknown[])
  if (!written.length) throw new DirectionError("Someone else changed this at the same moment. It has been reloaded; make your change again.", 409)
  await sql`INSERT INTO project_direction_changes (project_id, version, actor, created_by, lines) VALUES (${a.projectId}, ${next}, ${a.actor}, ${a.userId}, ${JSON.stringify(lines.slice(0, 60))}::jsonb)`
  return { doc, version: next, lines }
}

/**
 * Applies one pure edit to the latest document (an agent's tool call): load, edit, save at that version, and try
 * once more if someone saved in between.
 */
export async function editDirection<T>(a: { projectId: string; userId: string; actor: "owner" | "agent"; edit: (doc: DirectionDoc) => { doc: DirectionDoc; result: T } }): Promise<{ result: T; version: number }> {
  for (let attempt = 0; ; attempt++) {
    const current = await loadDirection(a.projectId)
    const { doc, result } = a.edit(current.doc)
    try {
      const saved = await saveDirection({ projectId: a.projectId, userId: a.userId, raw: doc, baseVersion: current.version, actor: a.actor })
      return { result, version: saved.version }
    } catch (e) {
      if (!(e instanceof DirectionError && e.status === 409) || attempt >= 1) throw e
    }
  }
}
