/**
 * /api/admin/envelope-audit
 *
 * Surface 5W+H envelope completeness across all entity tables. Foundation
 * for Phase 11 (G L4 — audit_5wh_completeness MCP tool).
 *
 * GET ?detail=summary    — counts per table (default)
 *     ?detail=tables     — per-table breakdown with empty-field counts
 *     ?detail=entries    — per-row details for a single table (requires ?table=)
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

// Tables augmented in migration 041 (33 entity tables) + the 3 born-with tables from 042/044/045
// where envelope is meaningful to audit.
const ENVELOPE_TABLES = [
  'projects', 'project_steps', 'todos', 'ideas', 'idea_branches', 'idea_facets',
  'idea_validations', 'idea_refinements', 'idea_documents', 'idea_perspectives',
  'idea_scenarios', 'architecture_decisions', 'project_phases', 'progress_notes',
  'documents', 'sops', 'agent_jobs', 'finance_accounts', 'finance_transactions',
  'finance_budgets', 'finance_income_streams', 'finance_goals', 'calendar_events',
  'calendar_categories', 'clients', 'service_schedules', 'feedback', 'sources',
  'feature_requests', 'idea_notes', 'idea_relationships', 'idea_transformations',
  'idea_canvas_snapshots',
  // Born-with envelope tables
  'attempted_solutions', 'entity_relations',
  'skills', 'feature_templates', 'protocols', 'spec_applications',
  'work_orders', 'work_order_steps', 'prompts', 'prompt_fires',
] as const

// User-id column varies by table — most use 'user_id', some use 'created_by'
const USER_ID_COLUMNS: Record<string, string> = {
  idea_branches: 'created_by',
  // others default to 'user_id'
}

// Soft-delete column existence varies
const NO_SOFT_DELETE = new Set([
  'idea_perspectives', 'idea_scenarios', 'idea_branches', 'idea_facets',
  'idea_validations', 'idea_refinements', 'idea_documents', 'idea_notes',
  'idea_canvas_snapshots', 'progress_notes', 'documents', 'project_phases',
  'architecture_decisions', 'finance_categories', 'finance_income_streams',
  'finance_budgets', 'finance_goals', 'feature_requests', 'sources',
  'work_order_check_ins', 'prompt_fires', 'spec_applications',
])

async function getRowCount(table: string, userId: string): Promise<number> {
  const userCol = USER_ID_COLUMNS[table] ?? 'user_id'
  const hasUserCol = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${userCol}
  `
  if (!hasUserCol.length) {
    // No user_id column — return total count
    const r = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM ${table}`)
    return r[0]?.n ?? 0
  }
  const softDelete = NO_SOFT_DELETE.has(table) ? '' : 'AND deleted_at IS NULL'
  const r = await sql.unsafe(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${userCol} = $1 ${softDelete}`,
    [userId]
  )
  return r[0]?.n ?? 0
}

async function getEnvelopeStats(table: string, userId: string): Promise<{
  total: number
  withEnvelope: number
  emptyEnvelope: number
  withRationale: number
  withTitle: number
  withProjectId: number
}> {
  const userCol = USER_ID_COLUMNS[table] ?? 'user_id'
  const hasUserCol = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${userCol}
  `
  const userClause = hasUserCol.length ? `${userCol} = $1 AND` : ''
  const params = hasUserCol.length ? [userId] : []
  const softDelete = NO_SOFT_DELETE.has(table) ? '' : 'AND deleted_at IS NULL'

  const query = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE documentation_5wh != '{}'::jsonb)::int AS with_envelope,
      COUNT(*) FILTER (WHERE documentation_5wh = '{}'::jsonb)::int AS empty_envelope,
      COUNT(*) FILTER (WHERE documentation_5wh->'why'->>'rationale' IS NOT NULL AND documentation_5wh->'why'->>'rationale' != '')::int AS with_rationale,
      COUNT(*) FILTER (WHERE documentation_5wh->'what'->>'title' IS NOT NULL AND documentation_5wh->'what'->>'title' != '')::int AS with_title,
      COUNT(*) FILTER (WHERE documentation_5wh->'where'->>'project_id' IS NOT NULL)::int AS with_project_id
    FROM ${table}
    WHERE ${userClause} 1=1 ${softDelete}
  `
  const r = await sql.unsafe(query, params)
  return {
    total: r[0].total,
    withEnvelope: r[0].with_envelope,
    emptyEnvelope: r[0].empty_envelope,
    withRationale: r[0].with_rationale,
    withTitle: r[0].with_title,
    withProjectId: r[0].with_project_id,
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const sp = new URL(request.url).searchParams
    const detail = sp.get('detail') ?? 'summary'

    if (detail === 'summary') {
      let totalEntities = 0
      let totalWithEnvelope = 0
      let totalWithRationale = 0
      const tableSummaries: Array<{ table: string; total: number; withEnvelope: number; coverage: number }> = []
      for (const table of ENVELOPE_TABLES) {
        try {
          const stats = await getEnvelopeStats(table, userId)
          totalEntities += stats.total
          totalWithEnvelope += stats.withEnvelope
          totalWithRationale += stats.withRationale
          if (stats.total > 0) {
            tableSummaries.push({
              table,
              total: stats.total,
              withEnvelope: stats.withEnvelope,
              coverage: stats.total ? Math.round((stats.withEnvelope / stats.total) * 100) : 0,
            })
          }
        } catch (err) {
          // table may not exist; skip
        }
      }
      tableSummaries.sort((a, b) => b.total - a.total)
      return successResponse({
        totalEntities,
        totalWithEnvelope,
        totalWithRationale,
        envelopeCoverage: totalEntities ? Math.round((totalWithEnvelope / totalEntities) * 100) : 0,
        rationaleCoverage: totalEntities ? Math.round((totalWithRationale / totalEntities) * 100) : 0,
        tables: tableSummaries,
      })
    }

    if (detail === 'tables') {
      const rows: Array<ReturnType<typeof getEnvelopeStats> extends Promise<infer R> ? R & { table: string } : never> = []
      for (const table of ENVELOPE_TABLES) {
        try {
          const stats = await getEnvelopeStats(table, userId)
          rows.push({ table, ...stats } as never)
        } catch {
          // skip
        }
      }
      return successResponse(rows)
    }

    if (detail === 'entries') {
      const table = sp.get('table')
      if (!table || !ENVELOPE_TABLES.includes(table as never)) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Valid ?table= required', 400)
      }
      const userCol = USER_ID_COLUMNS[table] ?? 'user_id'
      const softDelete = NO_SOFT_DELETE.has(table) ? '' : 'AND deleted_at IS NULL'
      const limit = Math.min(Number.parseInt(sp.get('limit') ?? '50', 10), 200)
      const r = await sql.unsafe(
        `SELECT id, documentation_5wh,
           (documentation_5wh = '{}'::jsonb) AS is_empty,
           (documentation_5wh->'why'->>'rationale' IS NULL OR documentation_5wh->'why'->>'rationale' = '') AS missing_rationale
         FROM ${table}
         WHERE ${userCol} = $1 ${softDelete}
         ORDER BY created_at DESC LIMIT ${limit}`,
        [userId]
      )
      return successResponse(r)
    }

    return errorResponse(ErrorCodes.VALIDATION_ERROR, 'detail must be summary | tables | entries', 400)
  } catch (error) {
    console.error('GET /api/admin/envelope-audit error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Audit failed', 500)
  }
}
