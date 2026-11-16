/** SQL for lib/intake/check-card.ts: make a check's or a walk's fix card once, and close a check's card when it passes. */
import { sql } from "@/lib/db/client"
import type { CardDraft } from "./check-card"

/** The open card carrying this marker, or a new one in Up next. Returns its id. */
export async function upsertFixCard(projectId: string, d: CardDraft): Promise<string> {
  const [open] = (await sql`
    SELECT id FROM project_steps
     WHERE project_id = ${projectId} AND deleted_at IS NULL AND status NOT IN ('completed', 'cancelled')
       AND position(${d.marker} in description) > 0
     LIMIT 1
  `) as { id: string }[]
  if (open) return open.id
  const [made] = (await sql`
    INSERT INTO project_steps (project_id, title, description, status, phase, stage, priority, order_index, tags, work_kind, metadata)
    VALUES (
      ${projectId}, ${d.title}, ${d.description}, 'pending',
      COALESCE((SELECT NULLIF(current_phase, '') FROM projects WHERE id = ${projectId}), 'planning'), 'backlog', 'high',
      (SELECT COALESCE(MAX(order_index), 0) + 1 FROM project_steps WHERE project_id = ${projectId} AND deleted_at IS NULL),
      ${d.tags}::text[], 'task', ${JSON.stringify(d.metadata)}::jsonb
    )
    RETURNING id
  `) as { id: string }[]
  return made.id
}

/** A check that now passes closes the card its failure made. */
export async function closeFixCards(projectId: string, markers: string[]): Promise<number> {
  if (!markers.length) return 0
  const rows = (await sql`
    UPDATE project_steps SET status = 'completed', progress = 100, updated_at = NOW()
     WHERE project_id = ${projectId} AND deleted_at IS NULL AND status NOT IN ('completed', 'cancelled')
       AND metadata->>'source' = 'check'
       AND EXISTS (SELECT 1 FROM unnest(${markers}::text[]) m WHERE position(m in description) > 0)
    RETURNING id
  `) as { id: string }[]
  return rows.length
}
