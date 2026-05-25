/**
 * Work Order Recompute — lib/work-orders/recompute.ts
 *
 * After a step completes, promotes any 'pending' steps whose prerequisites
 * are now all 'completed' to 'ready'. Also finalises the parent work_order
 * when terminal states are reached.
 */

import { sql } from '@/lib/db/client'

export type RecomputeResult = {
  promoted: string[]           // step IDs promoted from pending → ready
  workOrderFinished: boolean   // true if work order moved to completed or failed
  workOrderStatus?: string     // new status if changed
}

/**
 * After any step terminal transition (completion, failure, skip, block),
 * re-evaluate which pending steps can now be promoted to 'ready'.
 *
 * Algorithm:
 *   1. Load all non-terminal steps for the work order.
 *   2. Load the set of completed step IDs for this work order.
 *   3. For each 'pending' step, check if ALL entries in prerequisites[] are in
 *      the completed set. If yes, promote to 'ready'.
 *   4. After promotion, check if the entire work order has reached a terminal
 *      state (all completed → set work_order.status='completed'; any failed →
 *      set work_order.status='failed').
 */
export async function recomputeReadySteps(workOrderId: string): Promise<RecomputeResult> {
  // Load all step statuses for this work order
  const allSteps = await sql`
    SELECT id, status, prerequisites
    FROM work_order_steps
    WHERE work_order_id = ${workOrderId}
  `

  if (allSteps.length === 0) {
    return { promoted: [], workOrderFinished: false }
  }

  // Build completed set
  const completedIds = new Set(
    allSteps
      .filter(s => s.status === 'completed' || s.status === 'skipped')
      .map(s => s.id as string)
  )

  // Find pending steps whose prerequisites are fully satisfied
  const promoted: string[] = []

  for (const step of allSteps) {
    if (step.status !== 'pending') continue

    const prereqs: string[] = step.prerequisites ?? []
    const allSatisfied = prereqs.length === 0 || prereqs.every((pid: string) => completedIds.has(pid))

    if (allSatisfied) {
      await sql`
        UPDATE work_order_steps
        SET status = 'ready', updated_at = NOW()
        WHERE id = ${step.id}
          AND status = 'pending'
      `
      promoted.push(step.id as string)
    }
  }

  // Refresh statuses after promotion to determine work order terminal state
  const refreshed = await sql`
    SELECT id, status FROM work_order_steps WHERE work_order_id = ${workOrderId}
  `

  const anyFailed = refreshed.some(s => s.status === 'failed')
  const allTerminal = refreshed.every(s =>
    ['completed', 'failed', 'skipped', 'cancelled'].includes(s.status)
  )

  let workOrderFinished = false
  let workOrderStatus: string | undefined

  if (allTerminal) {
    workOrderFinished = true
    workOrderStatus = anyFailed ? 'failed' : 'completed'

    if (anyFailed) {
      await sql`
        UPDATE work_orders
        SET status = 'failed', updated_at = NOW()
        WHERE id = ${workOrderId}
          AND status NOT IN ('cancelled', 'failed', 'completed')
      `
    } else {
      await sql`
        UPDATE work_orders
        SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE id = ${workOrderId}
          AND status NOT IN ('cancelled', 'failed', 'completed')
      `
    }
  }

  return { promoted, workOrderFinished, workOrderStatus }
}
