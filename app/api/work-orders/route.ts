/**
 * /api/work-orders
 *
 * GET   — list work orders for authenticated user
 * POST  — create work order (compose from template or ad-hoc step specs)
 *
 * Composition sources:
 *   sourceTemplateId — calls composeFromTemplate (DB hydration)
 *   steps[]          — calls composeFromSpecs (ad-hoc)
 *
 * After composing, inserts work_order + all work_order_steps in a single
 * transaction using the neon pool. Steps with no prerequisites start as
 * 'ready'; others start as 'pending'.
 */

import { sql, pool } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'
import { composeFromSpecs, composeFromTemplate, type StepSpec } from '@/lib/work-orders/compose'

export const dynamic = 'force-dynamic'

// ============================================================================
// Row transformers
// ============================================================================

function transformWorkOrder(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    sourceType: row.source_type,
    sourceTemplateId: row.source_template_id,
    sourceTemplateVersion: row.source_template_version,
    insertionStrategy: row.insertion_strategy,
    parallelismRecommended: row.parallelism_recommended,
    projectId: row.project_id,
    userId: row.user_id,
    createdByType: row.created_by_type,
    createdById: row.created_by_id,
    approvedAt: row.approved_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ?? {},
  }
}

// ============================================================================
// GET /api/work-orders
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const sp = new URL(request.url).searchParams
    const status = sp.get('status')
    const projectId = sp.get('projectId')
    const limit = Math.min(parseInt(sp.get('limit') ?? '50', 10) || 50, 200)
    const offset = parseInt(sp.get('offset') ?? '0', 10) || 0

    const rows = await sql`
      SELECT wo.*
      FROM work_orders wo
      WHERE wo.user_id = ${userId}
        AND wo.deleted_at IS NULL
        AND (${status}::text IS NULL OR wo.status = ${status})
        AND (${projectId}::uuid IS NULL OR wo.project_id = ${projectId})
      ORDER BY wo.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const countRows = await sql`
      SELECT COUNT(*) AS total
      FROM work_orders
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND (${status}::text IS NULL OR status = ${status})
        AND (${projectId}::uuid IS NULL OR project_id = ${projectId})
    `

    return successResponse(
      rows.map(transformWorkOrder),
      { total: Number(countRows[0]?.total ?? 0), limit, offset }
    )
  } catch (error) {
    console.error('GET /api/work-orders error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load work orders', 500)
  }
}

// ============================================================================
// POST /api/work-orders
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const body = await request.json()
    const {
      title,
      description,
      projectId,
      sourceTemplateId,
      steps: adHocSteps,
      insertionStrategy,
      autoApprove,
    } = body

    if (!title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'title is required', 400)
    }
    if (!projectId) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'projectId is required', 400)
    }

    // Verify project ownership
    const hasAccess = await verifyProjectOwnership(projectId, userId)
    if (!hasAccess) {
      return errorResponse(ErrorCodes.FORBIDDEN, 'No access to this project', 403)
    }

    // ---- Compose plan --------------------------------------------------------
    let plan
    let sourceType: string
    let sourceTemplateVersion: number | null = null

    if (sourceTemplateId) {
      try {
        plan = await composeFromTemplate(sourceTemplateId, userId)
        sourceType = 'feature_template'
        // Fetch the template version for recording
        const tvRows = await sql`
          SELECT version FROM feature_templates WHERE id = ${sourceTemplateId} AND deleted_at IS NULL
        `
        sourceTemplateVersion = tvRows[0]?.version ?? null
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return errorResponse(ErrorCodes.VALIDATION_ERROR, `Template composition failed: ${msg}`, 400)
      }
    } else if (Array.isArray(adHocSteps) && adHocSteps.length > 0) {
      plan = composeFromSpecs(adHocSteps as StepSpec[])
      sourceType = 'ad_hoc'
    } else {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Either sourceTemplateId or steps[] must be provided',
        400
      )
    }

    // ---- Build 5W+H envelope for the work order ----------------------------
    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId },
      {
        type: 'work_order',
        title: title.trim(),
        summary: description?.slice(0, 200) || title.trim(),
        rationale:
          body.documentation_5wh?.why?.rationale ||
          `Work order created from ${sourceType === 'feature_template' ? 'template' : 'ad-hoc steps'}: ${title}`,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    const safeInsertionStrategy = [
      'atomic', 'extends', 'replaces', 'enriches',
    ].includes(insertionStrategy) ? insertionStrategy : 'atomic'

    const initialStatus = autoApprove ? 'approved' : 'proposed'
    const approvedAt = autoApprove ? new Date().toISOString() : null

    // ---- Transactional insert: work_order + all steps -----------------------
    const client = await (pool as import('@neondatabase/serverless').Pool).connect()
    let workOrderId: string
    let insertedSteps: Record<string, unknown>[] = []

    try {
      await client.query('BEGIN')

      // Insert work_order
      const woResult = await client.query<Record<string, unknown>>(
        `INSERT INTO work_orders (
          title, description, source_type, source_template_id, source_template_version,
          insertion_strategy, parallelism_recommended, status, approved_at,
          user_id, project_id, created_by_type, documentation_5wh
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13::jsonb
        ) RETURNING *`,
        [
          title.trim(),
          description ?? null,
          sourceType,
          sourceTemplateId ?? null,
          sourceTemplateVersion,
          safeInsertionStrategy,
          plan.max_parallelism,
          initialStatus,
          approvedAt,
          userId,
          projectId,
          'user',
          envelopeForSql(envelopeResult.envelope),
        ]
      )
      workOrderId = woResult.rows[0].id as string

      // Insert steps
      // We need to re-map prerequisite_indices → step UUIDs after insert.
      // Strategy: insert in order, tracking assigned UUIDs, then back-fill prerequisites[].
      // Two-pass: first pass inserts with empty prerequisites, second pass fills them.
      const stepIdsByOrder: string[] = []

      for (const step of plan.steps) {
        // Build step-level envelope
        const stepEnvelopeResult = buildEnvelopeForWrite(
          {},
          { userId, projectId },
          {
            type: 'work_order_step',
            title: step.title,
            summary: step.description || step.instructions?.slice(0, 200) || step.title,
            rationale: `Step ${step.step_order + 1} of work order: ${title}`,
          },
          'legacy'
        )
        const stepEnvelope = stepEnvelopeResult.ok
          ? envelopeForSql(stepEnvelopeResult.envelope)
          : '{}'

        const initialStepStatus = step.prerequisite_indices.length === 0 ? 'ready' : 'pending'

        const stepResult = await client.query<Record<string, unknown>>(
          `INSERT INTO work_order_steps (
            work_order_id, step_order, level, parallel_group,
            title, description, step_type,
            source_skill_id, source_skill_version,
            prerequisites, provides, requires,
            instructions, acceptance_criteria, step_references, expected_artifacts, required_capabilities,
            status, documentation_5wh
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9,
            '{}', $10, $11,
            $12, $13, $14::jsonb, $15, $16,
            $17, $18::jsonb
          ) RETURNING id`,
          [
            workOrderId,
            step.step_order,
            step.level,
            step.parallel_group,
            step.title,
            step.description ?? null,
            step.step_type ?? 'task',
            step.source_skill_id ?? null,
            step.source_skill_version ?? null,
            step.provides ?? [],
            step.requires ?? [],
            step.instructions ?? null,
            step.acceptance_criteria ?? [],
            JSON.stringify(step.step_references ?? []),
            step.expected_artifacts ?? [],
            step.required_capabilities ?? [],
            initialStepStatus,
            stepEnvelope,
          ]
        )
        stepIdsByOrder.push(stepResult.rows[0].id as string)
      }

      // Second pass: update prerequisites[] using resolved UUIDs
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]
        if (step.prerequisite_indices.length > 0) {
          const prereqUUIDs = step.prerequisite_indices.map(idx => stepIdsByOrder[idx])
          await client.query(
            `UPDATE work_order_steps SET prerequisites = $1 WHERE id = $2`,
            [prereqUUIDs, stepIdsByOrder[i]]
          )
        }
      }

      // If autoApprove, set started_at if any step is ready
      if (autoApprove && plan.steps.length > 0) {
        await client.query(
          `UPDATE work_orders SET started_at = NOW() WHERE id = $1 AND status = 'approved'`,
          [workOrderId]
        )
      }

      await client.query('COMMIT')

      // Fetch inserted steps for response
      const stepsRows = await sql`
        SELECT * FROM work_order_steps
        WHERE work_order_id = ${workOrderId}
        ORDER BY step_order ASC
      `
      insertedSteps = stepsRows as Record<string, unknown>[]
    } catch (txErr) {
      await client.query('ROLLBACK')
      throw txErr
    } finally {
      client.release()
    }

    // Fetch final work order row
    const woRows = await sql`SELECT * FROM work_orders WHERE id = ${workOrderId}`
    const workOrder = transformWorkOrder(woRows[0])

    return successResponse(
      {
        ...workOrder,
        steps: insertedSteps,
        composer: {
          max_parallelism: plan.max_parallelism,
          cycles_detected: plan.cycles_detected,
          warnings: plan.warnings,
        },
      },
      undefined,
      201
    )
  } catch (error) {
    console.error('POST /api/work-orders error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create work order', 500)
  }
}
