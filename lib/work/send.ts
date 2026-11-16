/**
 * Sends a card to the project's agents: a planner job naming the project and the card. The far-gates finish hook and
 * listener hand it to the session bound to that project, which claims the card. Rules in pipeline.ts.
 */
import { sql } from "@/lib/db/client"
import { jobFor, sendsOnMove, type WorkRow } from "./pipeline"

/** Sends the card when this move calls for it, once: a card with an open job is not sent again. Returns the job id. */
export async function sendIfMoved(step: WorkRow, from: string | null, projectId: string, userId: string): Promise<string | null> {
  if (!sendsOnMove(from, step.status, step.work_kind ?? "task")) return null
  return (await sendNow(step, projectId, userId)).jobId
}

/** Sends the card to the project's agents now, once: a card that already has an open job is not sent again. */
export async function sendNow(step: WorkRow, projectId: string, userId: string): Promise<{ jobId: string; already: boolean }> {
  const [open] = (await sql`
    SELECT id FROM agent_jobs WHERE parent_step_id = ${step.id} AND status IN ('pending', 'queued', 'assigned', 'claimed', 'in_progress') LIMIT 1
  `) as { id: string }[]
  if (open) return { jobId: open.id, already: true }
  const [project] = (await sql`SELECT name FROM projects WHERE id = ${projectId}`) as { name: string }[]
  const j = jobFor(step, projectId, step.status === "in-progress", project?.name)
  const [job] = (await sql`
    INSERT INTO agent_jobs (title, description, created_by, status, priority, input, tags, parent_step_id, metadata)
    VALUES (${j.title}, ${j.description}, ${userId}, 'pending', ${j.priority}, ${JSON.stringify(j.input)}::jsonb, ${j.tags}::text[], ${j.parentStepId}, ${JSON.stringify({ from: "board" })}::jsonb)
    RETURNING id
  `) as { id: string }[]
  await sql`
    UPDATE project_steps
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{work}', COALESCE(metadata->'work', '{}'::jsonb) || ${JSON.stringify({ sentAt: new Date().toISOString(), jobId: job.id })}::jsonb)
    WHERE id = ${step.id}
  `
  return { jobId: job.id, already: false }
}
