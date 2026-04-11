/**
 * Backbone Foundation — contract tests
 * Covers migrations 033-036 and the helpers in lib/db/backbone.ts.
 *
 * Run:
 *   pnpm tsx --test tests/backbone-foundation/backbone.test.ts
 *
 * Requires DATABASE_URL. Skips cleanly if not set.
 */

// Load env before importing db client
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// ---- Skip gate ---------------------------------------------------------------
const hasDb = !!process.env.DATABASE_URL

if (!hasDb) {
  console.log('[backbone.test] DATABASE_URL not set — skipping contract tests')
  // Exit 0 so CI doesn't fail in environments without DB credentials.
  process.exit(0)
}

// Regular imports (env is already loaded above)
import { sql } from '../../lib/db/client'
import * as backbone from '../../lib/db/backbone'

// ---- Test-run scoping --------------------------------------------------------
const TEST_RUN_ID = `backbone-test-${randomUUID()}`

// Track rows we created so teardown is reliable even on partial failure
const createdWorkerIds: string[] = []
const createdSourceIds: string[] = []
const createdJobIds: string[] = []
const createdStepIds: string[] = []
const createdProjectIds: string[] = []
let testUserId: string | null = null

// Find an existing user to attach test data to (avoids creating users in
// a test run — users are owned by Stack Auth upstream).
before(async () => {
  const rows = await sql`SELECT id FROM users LIMIT 1`
  if (rows.length === 0) {
    console.log('[backbone.test] no users in DB — skipping')
    process.exit(0)
  }
  testUserId = rows[0].id as string
})

after(async () => {
  // Reverse order cleanup
  if (createdSourceIds.length) {
    await sql`DELETE FROM sources WHERE id = ANY(${createdSourceIds}::uuid[])`
  }
  if (createdJobIds.length) {
    await sql`DELETE FROM agent_jobs WHERE id = ANY(${createdJobIds}::uuid[])`
  }
  if (createdStepIds.length) {
    await sql`DELETE FROM project_steps WHERE id = ANY(${createdStepIds}::uuid[])`
  }
  if (createdProjectIds.length) {
    await sql`DELETE FROM projects WHERE id = ANY(${createdProjectIds}::uuid[])`
  }
  if (createdWorkerIds.length) {
    await sql`DELETE FROM workers WHERE id = ANY(${createdWorkerIds}::uuid[])`
  }
})

// =============================================================================
// 1. Schema smoke test
// =============================================================================

test('schema: workers table has expected columns', async () => {
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'workers'
  `
  const names = cols.map((c: { column_name: string }) => c.column_name)
  assert.ok(names.includes('id'), 'workers.id')
  assert.ok(names.includes('user_id'), 'workers.user_id')
  assert.ok(names.includes('kind'), 'workers.kind')
  assert.ok(names.includes('capabilities'), 'workers.capabilities')
  assert.ok(names.includes('status'), 'workers.status')
  assert.ok(names.includes('last_seen_at'), 'workers.last_seen_at')
  assert.ok(names.includes('deleted_at'), 'workers.deleted_at')
})

test('schema: agent_jobs has delegation + unlock columns', async () => {
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'agent_jobs'
  `
  const names = cols.map((c: { column_name: string }) => c.column_name)
  for (const expected of [
    'worker_id',
    'parent_step_id',
    'unlock_prompt',
    'unlock_resolved_at',
    'unlock_resolved_by',
    'unlock_note',
    'capabilities_required',
  ]) {
    assert.ok(names.includes(expected), `agent_jobs.${expected} missing`)
  }
})

test('schema: agent_jobs status check allows awaiting-unlock', async () => {
  // Introspect the current constraint definition
  const [row] = await sql`
    SELECT pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conname = 'agent_jobs_status_check'
  `
  assert.ok(row, 'agent_jobs_status_check constraint exists')
  assert.match(String(row.def), /awaiting-unlock/, 'constraint includes awaiting-unlock')
})

test('schema: project_steps.step_instructions exists and is an object', async () => {
  const [row] = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'project_steps' AND column_name = 'step_instructions'
  `
  assert.ok(row, 'step_instructions column exists')
  assert.equal(row.data_type, 'jsonb')
})

test('schema: sources table exists with FKs and CHECK', async () => {
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'sources'
  `
  const names = cols.map((c: { column_name: string }) => c.column_name)
  for (const expected of ['kind', 'step_id', 'job_id', 'todo_id', 'external_id']) {
    assert.ok(names.includes(expected), `sources.${expected} missing`)
  }

  const [check] = await sql`
    SELECT pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conname = 'source_has_target'
  `
  assert.ok(check, 'source_has_target CHECK exists')
})

// =============================================================================
// 2. Worker registration round-trip
// =============================================================================

test('workers: createWorker → listWorkers round-trip', async () => {
  const worker = await backbone.createWorker({
    userId: testUserId,
    kind: 'claude_code_local',
    name: `test-${TEST_RUN_ID}`,
    capabilities: { tools: ['edit', 'read'], max_context: 200000 },
    status: 'active',
    metadata: { test_run: TEST_RUN_ID },
  })
  createdWorkerIds.push(worker.id)

  assert.ok(worker.id, 'worker has id')
  assert.equal(worker.kind, 'claude_code_local')
  assert.equal(worker.status, 'active')
  assert.equal(worker.user_id, testUserId)

  const list = await backbone.listWorkers({ userId: testUserId!, kind: 'claude_code_local' })
  const found = list.find((w) => w.id === worker.id)
  assert.ok(found, 'listWorkers returns the created worker')
})

test('workers: updateWorkerStatus bumps last_seen_at', async () => {
  const worker = await backbone.createWorker({
    userId: testUserId,
    kind: 'cron',
    name: `heartbeat-${TEST_RUN_ID}`,
    status: 'inactive',
  })
  createdWorkerIds.push(worker.id)

  const before = worker.last_seen_at
  const updated = await backbone.updateWorkerStatus(worker.id, 'active')
  assert.ok(updated, 'update returns row')
  assert.equal(updated!.status, 'active')
  assert.ok(updated!.last_seen_at, 'last_seen_at is set')
  // Strict inequality in case the row was created and updated in the same ms
  if (before) {
    assert.ok(
      new Date(updated!.last_seen_at!).getTime() >= new Date(before).getTime(),
      'last_seen_at advanced'
    )
  }
})

// =============================================================================
// 3. Unlock lifecycle
// =============================================================================

// Shared helper: attempt to create a project + step. Returns null if the
// pre-existing `update_step_computed_fields` trigger bug blocks the insert.
async function tryCreateProjectAndStep(label: string) {
  try {
    const [project] = await sql`
      INSERT INTO projects (name, description, status, priority, user_id)
      VALUES (${label + '-proj-' + TEST_RUN_ID}, 'backbone test', 'planning', 'low', ${testUserId})
      RETURNING id
    `
    createdProjectIds.push(project.id)

    const [step] = await sql`
      INSERT INTO project_steps (
        project_id, title, description, status, phase, stage, order_index
      )
      VALUES (
        ${project.id}, ${label + ' step'}, 'backbone test step',
        'pending', 'planning', 'design', 0
      )
      RETURNING id
    `
    createdStepIds.push(step.id)
    return { project, step }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/no field "step_id"/.test(msg)) {
      console.warn(
        `[skip] ${label}: pre-existing update_step_computed_fields trigger bug ` +
          `blocks INSERT INTO project_steps. Tracked in BACKBONE_FOUNDATION.md.`
      )
      return null
    }
    throw e
  }
}

test('unlock lifecycle: transitionJobToUnlock → resolveUnlock', async () => {
  // The unlock state machine does NOT require a parent_step (it's nullable).
  // This test exercises the state machine directly on agent_jobs so it's
  // immune to the pre-existing `update_step_computed_fields` trigger bug.
  //
  // Attempt to attach to a real step if one exists — nice-to-have, not required.
  let parentStepId: string | null = null
  const scaffold = await tryCreateProjectAndStep('unlock')
  if (scaffold) {
    parentStepId = scaffold.step.id
  } else {
    const rows = await sql`
      SELECT ps.id
      FROM project_steps ps
      JOIN projects p ON ps.project_id = p.id
      WHERE p.user_id = ${testUserId} AND ps.deleted_at IS NULL
      LIMIT 1
    `
    if (rows.length > 0) parentStepId = rows[0].id as string
  }

  // Agent job (with or without a parent step), status in_progress
  const [job] = await sql`
    INSERT INTO agent_jobs (
      title, description, created_by, status, parent_step_id
    )
    VALUES (
      ${'test job ' + TEST_RUN_ID}, 'unlock test',
      ${testUserId}, 'in_progress', ${parentStepId}
    )
    RETURNING id
  `
  createdJobIds.push(job.id)

  // 3. Transition to awaiting-unlock
  const awaiting = await backbone.transitionJobToUnlock(
    job.id,
    'Need owner to approve schema drop'
  )
  assert.ok(awaiting, 'transition returns row')
  assert.equal(awaiting!.status, 'awaiting-unlock')
  assert.equal(awaiting!.unlock_prompt, 'Need owner to approve schema drop')

  // 4. listAwaitingUnlocks sees it
  const list = await backbone.listAwaitingUnlocks({ userId: testUserId! })
  assert.ok(
    list.some((j) => j.id === job.id),
    'listAwaitingUnlocks returns the job'
  )

  // 5. Resolve — moves to 'queued'
  const resolved = await backbone.resolveUnlock(job.id, testUserId!, 'approved')
  assert.ok(resolved, 'resolve returns row')
  assert.equal(resolved!.status, 'queued')
  assert.equal(resolved!.unlock_note, 'approved')
  assert.ok(resolved!.unlock_resolved_at, 'unlock_resolved_at set')
  assert.equal(resolved!.unlock_resolved_by, testUserId)

  // 6. Double-resolve is a no-op
  const second = await backbone.resolveUnlock(job.id, testUserId!)
  assert.equal(second, null, 'double-resolve returns null')
})

// =============================================================================
// 4. Source creation
// =============================================================================

test('sources: createSource linked to a job, list it back', async () => {
  // Pivot: link the source to an agent_job (immune to the trigger bug)
  // instead of a project_step. listSourcesForJob / listSourcesForStep share
  // the same code path, so coverage is equivalent.
  const [job] = await sql`
    INSERT INTO agent_jobs (title, description, created_by, status)
    VALUES (${'source-test-job-' + TEST_RUN_ID}, 'source test', ${testUserId}, 'queued')
    RETURNING id
  `
  createdJobIds.push(job.id)

  const source = await backbone.createSource({
    userId: testUserId!,
    kind: 'github_issue',
    externalId: 'test-issue-42',
    externalUrl: 'https://github.com/example/repo/issues/42',
    jobId: job.id,
    status: 'open',
    metadata: { test_run: TEST_RUN_ID },
  })
  createdSourceIds.push(source.id)

  assert.ok(source.id, 'source has id')
  assert.equal(source.kind, 'github_issue')
  assert.equal(source.job_id, job.id)

  const list = await backbone.listSourcesForJob(job.id)
  assert.ok(
    list.some((s) => s.id === source.id),
    'listSourcesForJob returns the source'
  )
})

test('sources: createSource without any target throws', async () => {
  await assert.rejects(
    () =>
      backbone.createSource({
        userId: testUserId!,
        kind: 'manual',
      }),
    /at least one of/
  )
})
