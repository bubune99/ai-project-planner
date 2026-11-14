/** Guides: reading and writing the stack entries and statements. Rules are in guides.ts; this file is SQL only. */
import { sql } from "@/lib/db/client"
import { DEFAULT_GUIDES } from "./default-guides"
import { toRules, validateGuide, type Guide } from "./guides"
import { GateError } from "./store"

type Row = Guide & { project_id: string | null; updated_at: string }

/** A person's guides: those for all their projects, plus one project's own when given. */
export async function listGuides(userId: string, projectId?: string | null): Promise<Row[]> {
  return (await sql`
    SELECT id, kind, name, summary, skill, applies, checks, status, source, basis, project_id, updated_at
    FROM gate_guides WHERE user_id = ${userId} AND (project_id IS NULL OR project_id = ${projectId ?? null}::uuid)
    ORDER BY kind, lower(name)
  `) as Row[]
}

/** The rules the plugin applies, compiled from the active guides. */
export async function rulesFor(userId: string, projectId?: string | null) {
  const guides = await listGuides(userId, projectId)
  return { rules: toRules(guides), guides: guides.filter((g) => g.status === "active").map((g) => ({ name: g.name, kind: g.kind, skill: g.skill ?? null })) }
}

/** Adds a guide, or replaces the one with the same name. */
export async function saveGuide(userId: string, g: Omit<Guide, "id">, projectId?: string | null) {
  const issues = validateGuide({ ...g, id: "new" })
  if (issues.length) throw new GateError(issues.map((i) => `${i.where}: ${i.message}`).join("; "))
  const [row] = (await sql`
    INSERT INTO gate_guides (user_id, project_id, kind, name, summary, skill, applies, checks, status, source, basis)
    VALUES (${userId}, ${projectId ?? null}, ${g.kind}, ${g.name.trim()}, ${g.summary.trim()}, ${g.skill ?? null}, ${JSON.stringify(g.applies)}::jsonb, ${JSON.stringify(g.checks)}::jsonb, ${g.status}, ${g.source}, ${g.basis.trim()})
    ON CONFLICT (user_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
    DO UPDATE SET kind = EXCLUDED.kind, summary = EXCLUDED.summary, skill = EXCLUDED.skill, applies = EXCLUDED.applies, checks = EXCLUDED.checks,
      status = EXCLUDED.status, source = EXCLUDED.source, basis = EXCLUDED.basis, updated_at = now()
    RETURNING id
  `) as { id: string }[]
  return { id: row.id }
}

/** Settles a draft, or sets a guide aside without deleting it. */
export async function setGuideStatus(userId: string, id: string, status: "active" | "draft") {
  const rows = (await sql`UPDATE gate_guides SET status = ${status}, updated_at = now() WHERE id = ${id} AND user_id = ${userId} RETURNING id`) as { id: string }[]
  if (!rows.length) throw new GateError("Guide not found")
}

/** Installs the starting set. Guides that already exist (by name) are left exactly as they are. */
export async function installDefaults(userId: string) {
  const have = new Set((await listGuides(userId)).map((g) => g.name.toLowerCase()))
  const added: string[] = []
  for (const g of DEFAULT_GUIDES) {
    if (have.has(g.name.toLowerCase())) continue
    await saveGuide(userId, g)
    added.push(g.name)
  }
  return { added, kept: have.size }
}
