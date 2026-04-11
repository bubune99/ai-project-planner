/**
 * Backbone Foundation — query helpers
 * -----------------------------------------------------------------------------
 * Lightweight CRUD + lifecycle helpers for the new backbone tables added in
 * migrations 033-036:
 *
 *   - workers      (registry of execution sites)
 *   - agent_jobs   (extended with delegation + unlock-as-status)
 *   - sources      (federation scaffolding)
 *   - project_steps.step_instructions (structured task shape)
 *
 * These helpers are deliberately minimal — just enough to back the new MCP
 * tools in app/mcp/route.ts. Anything heavier (search, pagination, joins
 * across silos) stays in the MCP layer for now.
 */

import { sql } from './client'
import type {
  Worker,
  WorkerKind,
  WorkerStatus,
  WorkerCapabilities,
  AgentJob,
  AgentJobStatus,
  Source,
  SourceKind,
} from './schema'

// ============================================================================
// Workers
// ============================================================================

export interface CreateWorkerInput {
  userId: string | null
  kind: WorkerKind
  name: string
  capabilities?: WorkerCapabilities
  status?: WorkerStatus
  metadata?: Record<string, unknown>
}

export async function createWorker(input: CreateWorkerInput): Promise<Worker> {
  const [row] = await sql`
    INSERT INTO workers (user_id, kind, name, capabilities, status, metadata)
    VALUES (
      ${input.userId},
      ${input.kind},
      ${input.name},
      ${JSON.stringify(input.capabilities ?? {})}::jsonb,
      ${input.status ?? 'inactive'},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING *
  `
  return row as unknown as Worker
}

export interface ListWorkersFilter {
  userId?: string | null
  kind?: WorkerKind
  status?: WorkerStatus
  includeShared?: boolean // include user_id IS NULL rows
  limit?: number
}

export async function listWorkers(filter: ListWorkersFilter = {}): Promise<Worker[]> {
  const limit = Math.min(filter.limit ?? 50, 200)
  const rows = await sql`
    SELECT *
    FROM workers
    WHERE deleted_at IS NULL
      ${
        filter.userId !== undefined
          ? filter.includeShared
            ? sql`AND (user_id = ${filter.userId} OR user_id IS NULL)`
            : sql`AND user_id = ${filter.userId}`
          : sql``
      }
      ${filter.kind ? sql`AND kind = ${filter.kind}` : sql``}
      ${filter.status ? sql`AND status = ${filter.status}` : sql``}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows as unknown as Worker[]
}

export async function getWorker(workerId: string): Promise<Worker | null> {
  const [row] = await sql`
    SELECT * FROM workers WHERE id = ${workerId} AND deleted_at IS NULL
  `
  return (row as unknown as Worker) ?? null
}

export async function updateWorkerStatus(
  workerId: string,
  status: WorkerStatus
): Promise<Worker | null> {
  const [row] = await sql`
    UPDATE workers
    SET status = ${status},
        last_seen_at = NOW(),
        updated_at = NOW()
    WHERE id = ${workerId} AND deleted_at IS NULL
    RETURNING *
  `
  return (row as unknown as Worker) ?? null
}

// ============================================================================
// Agent Jobs — delegation + unlock-as-status
// ============================================================================

/**
 * Worker claims a job: sets worker_id + status='claimed'. Idempotent if the
 * same worker re-claims; fails if another worker already holds it.
 */
export async function claimJob(
  jobId: string,
  workerId: string
): Promise<AgentJob | null> {
  const [row] = await sql`
    UPDATE agent_jobs
    SET worker_id = ${workerId},
        status = 'claimed',
        updated_at = NOW()
    WHERE id = ${jobId}
      AND (worker_id IS NULL OR worker_id = ${workerId})
      AND status IN ('pending', 'queued', 'assigned')
    RETURNING *
  `
  return (row as unknown as AgentJob) ?? null
}

/**
 * Transition a job to 'awaiting-unlock'. Used when the agent has reached a
 * point where it needs the owner to act/approve/decide.
 */
export async function transitionJobToUnlock(
  jobId: string,
  unlockPrompt: string
): Promise<AgentJob | null> {
  const [row] = await sql`
    UPDATE agent_jobs
    SET status = 'awaiting-unlock',
        unlock_prompt = ${unlockPrompt},
        unlock_resolved_at = NULL,
        unlock_resolved_by = NULL,
        unlock_note = NULL,
        updated_at = NOW()
    WHERE id = ${jobId}
    RETURNING *
  `
  return (row as unknown as AgentJob) ?? null
}

/**
 * Owner resolves an unlock: moves status back to 'queued' so the next
 * available worker (possibly the same one) can pick it up.
 */
export async function resolveUnlock(
  jobId: string,
  resolvedBy: string,
  note?: string
): Promise<AgentJob | null> {
  const [row] = await sql`
    UPDATE agent_jobs
    SET status = 'queued',
        unlock_resolved_at = NOW(),
        unlock_resolved_by = ${resolvedBy},
        unlock_note = ${note ?? null},
        updated_at = NOW()
    WHERE id = ${jobId}
      AND status = 'awaiting-unlock'
    RETURNING *
  `
  return (row as unknown as AgentJob) ?? null
}

export interface ListAwaitingUnlocksFilter {
  userId: string
  limit?: number
}

/**
 * Owner query: "what's waiting for me?"
 *
 * Note: agent_jobs.created_by is VARCHAR(255) holding the user id (pre-FK
 * schema from migration 031), so we compare to the string form of userId.
 */
export async function listAwaitingUnlocks(
  filter: ListAwaitingUnlocksFilter
): Promise<AgentJob[]> {
  const limit = Math.min(filter.limit ?? 50, 200)
  const rows = await sql`
    SELECT *
    FROM agent_jobs
    WHERE status = 'awaiting-unlock'
      AND created_by = ${filter.userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows as unknown as AgentJob[]
}

// ============================================================================
// Sources — federation scaffolding
// ============================================================================

export interface CreateSourceInput {
  userId: string
  kind: SourceKind
  externalId?: string | null
  externalUrl?: string | null
  stepId?: string | null
  jobId?: string | null
  todoId?: string | null
  status?: string | null
  metadata?: Record<string, unknown>
}

export async function createSource(input: CreateSourceInput): Promise<Source> {
  if (!input.stepId && !input.jobId && !input.todoId) {
    throw new Error('createSource: at least one of stepId, jobId, todoId must be set')
  }
  const [row] = await sql`
    INSERT INTO sources (
      user_id, kind, external_id, external_url,
      step_id, job_id, todo_id,
      status, metadata
    )
    VALUES (
      ${input.userId},
      ${input.kind},
      ${input.externalId ?? null},
      ${input.externalUrl ?? null},
      ${input.stepId ?? null},
      ${input.jobId ?? null},
      ${input.todoId ?? null},
      ${input.status ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING *
  `
  return row as unknown as Source
}

export async function listSourcesForStep(stepId: string): Promise<Source[]> {
  const rows = await sql`
    SELECT * FROM sources
    WHERE step_id = ${stepId} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `
  return rows as unknown as Source[]
}

export async function listSourcesForJob(jobId: string): Promise<Source[]> {
  const rows = await sql`
    SELECT * FROM sources
    WHERE job_id = ${jobId} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `
  return rows as unknown as Source[]
}
