/** Walks: saving and listing. Rules are in walk-model.ts; this file is SQL only. Callers check access first. */
import { sql } from "@/lib/db/client"
import { loadFlows } from "@/lib/people/store"
import { coverage, openFindings, parseWalk, walkLine, type StoredWalk, type Walk } from "./walk-model"

export class WalkError extends Error {}

export async function listWalks(projectId: string, build?: string) {
  const rows = (await sql`
    SELECT id, doc, actor, created_at FROM walks WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 200
  `) as { id: string; doc: Walk; actor: "agent" | "owner"; created_at: string }[]
  // Read through the parser, so an older row never reaches the page in a shape it cannot draw.
  const walks: StoredWalk[] = rows.map((r) => ({ ...parseWalk(r.doc).walk, id: r.id, actor: r.actor, at: new Date(r.created_at).toISOString() }))
  const people = await loadFlows(projectId)
  return {
    walks: walks.map((w) => ({ ...w, line: walkLine(w) })),
    coverage: coverage(people.doc.flows.map((f) => ({ id: f.id, name: f.name })), walks, build),
    open: openFindings(walks),
  }
}

export async function saveWalk(a: { projectId: string; userId: string; raw: unknown; actor: "agent" | "owner" }) {
  const { walk, errors } = parseWalk(a.raw)
  if (errors.length) throw new WalkError(errors.slice(0, 6).join(". "))
  const [row] = (await sql`
    INSERT INTO walks (project_id, goal, use_case, persona, outcome, env, build, doc, actor, created_by)
    VALUES (${a.projectId}, ${walk.goal}, ${walk.useCase ?? null}, ${walk.persona ?? null}, ${walk.outcome}, ${walk.env ?? null}, ${walk.build ?? null}, ${JSON.stringify(walk)}::jsonb, ${a.actor}, ${a.userId})
    RETURNING id
  `) as { id: string }[]
  return { id: row.id, line: walkLine(walk), findings: walk.findings.length }
}
