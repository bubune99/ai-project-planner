/*
 * The `agents` table is global (one row per built-in agent, shared by every
 * tenant), but `agents.current_task_id` points at a tenant's project_step.
 * These helpers keep that pointer from leaking or being written across
 * tenants:
 *
 *   visibleStepPredicate — a join condition (alias `ps` = project_steps) that
 *     only matches when the caller owns the step's project or is an accepted,
 *     non-removed collaborator on it. Use it in every agents ⟕ project_steps
 *     join so another tenant's step title/status never comes back.
 *   canWriteStep — the caller may assign/complete agent work on a step only
 *     with write access to that step's project.
 */

import { sql } from "@/lib/db/client"
import { canPerformAction } from "@/lib/auth/collaboration-access"

export function visibleStepPredicate(userId: string) {
  return sql`EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = ps.project_id
      AND p.deleted_at IS NULL
      AND (
        p.user_id = ${userId}
        OR EXISTS (
          SELECT 1 FROM project_collaborators pc
          WHERE pc.project_id = p.id
            AND pc.user_id = ${userId}
            AND pc.removed_at IS NULL
            AND pc.accepted_at IS NOT NULL
        )
      )
  )`
}

export async function canWriteStep(stepId: string, userId: string): Promise<boolean> {
  const [step] = (await sql`
    SELECT project_id FROM project_steps WHERE id::text = ${stepId}
  `) as { project_id: string }[]
  if (!step) return false
  return canPerformAction(step.project_id, userId, "write")
}
