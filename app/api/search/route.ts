import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/search
 * Global search across all domains: projects, ideas, todos, transactions, decisions
 *
 * Query params:
 * - q: string (required) - search query
 * - domains: string (comma-separated) - which domains to search: projects,ideas,todos,transactions,decisions
 * - limit: number (default 10 per domain)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const query = searchParams.get('q')
    if (!query?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Search query (q) is required', 400)
    }

    const domainsParam = searchParams.get('domains')
    const domains = domainsParam
      ? domainsParam.split(',').map(d => d.trim().toLowerCase())
      : ['projects', 'ideas', 'todos', 'transactions', 'decisions']

    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 25)
    const searchPattern = `%${query}%`

    const results: Record<string, any[]> = {}
    const counts: Record<string, number> = {}

    // Search projects
    if (domains.includes('projects')) {
      const projectResults = await sql`
        SELECT
          id,
          name,
          description,
          status,
          current_phase,
          updated_at
        FROM projects
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND (
            name ILIKE ${searchPattern}
            OR description ILIKE ${searchPattern}
          )
        ORDER BY
          CASE WHEN name ILIKE ${searchPattern} THEN 0 ELSE 1 END,
          updated_at DESC
        LIMIT ${limit}
      `
      results.projects = projectResults.map(p => ({
        id: p.id,
        type: 'project',
        title: p.name,
        description: p.description,
        status: p.status,
        phase: p.current_phase,
        updatedAt: p.updated_at
      }))

      const projectCount = await sql`
        SELECT COUNT(*) as count FROM projects
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND (name ILIKE ${searchPattern} OR description ILIKE ${searchPattern})
      `
      counts.projects = parseInt(projectCount[0]?.count || '0')
    }

    // Search ideas
    if (domains.includes('ideas')) {
      const ideaResults = await sql`
        SELECT
          id,
          title,
          description,
          lifecycle,
          category,
          tags,
          updated_at
        FROM ideas
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND (
            title ILIKE ${searchPattern}
            OR description ILIKE ${searchPattern}
            OR category ILIKE ${searchPattern}
            OR tags::text ILIKE ${searchPattern}
          )
        ORDER BY
          CASE WHEN title ILIKE ${searchPattern} THEN 0 ELSE 1 END,
          updated_at DESC
        LIMIT ${limit}
      `
      results.ideas = ideaResults.map(i => ({
        id: i.id,
        type: 'idea',
        title: i.title,
        description: i.description,
        lifecycle: i.lifecycle,
        category: i.category,
        tags: i.tags || [],
        updatedAt: i.updated_at
      }))

      const ideaCount = await sql`
        SELECT COUNT(*) as count FROM ideas
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND (
            title ILIKE ${searchPattern}
            OR description ILIKE ${searchPattern}
            OR category ILIKE ${searchPattern}
            OR tags::text ILIKE ${searchPattern}
          )
      `
      counts.ideas = parseInt(ideaCount[0]?.count || '0')
    }

    // Search todos
    if (domains.includes('todos')) {
      const todoResults = await sql`
        SELECT
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.due_date,
          t.project_id,
          p.name as project_name,
          t.updated_at
        FROM todos t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.user_id = ${userId}
          AND t.deleted_at IS NULL
          AND (
            t.title ILIKE ${searchPattern}
            OR t.description ILIKE ${searchPattern}
          )
        ORDER BY
          CASE WHEN t.title ILIKE ${searchPattern} THEN 0 ELSE 1 END,
          t.updated_at DESC
        LIMIT ${limit}
      `
      results.todos = todoResults.map(t => ({
        id: t.id,
        type: 'todo',
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.due_date,
        project: t.project_id ? { id: t.project_id, name: t.project_name } : null,
        updatedAt: t.updated_at
      }))

      const todoCount = await sql`
        SELECT COUNT(*) as count FROM todos
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND (title ILIKE ${searchPattern} OR description ILIKE ${searchPattern})
      `
      counts.todos = parseInt(todoCount[0]?.count || '0')
    }

    // Search transactions
    if (domains.includes('transactions')) {
      const transactionResults = await sql`
        SELECT
          id,
          description,
          amount,
          type,
          category,
          merchant,
          date,
          notes
        FROM transactions
        WHERE user_id = ${userId}
          AND (
            description ILIKE ${searchPattern}
            OR category ILIKE ${searchPattern}
            OR merchant ILIKE ${searchPattern}
            OR notes ILIKE ${searchPattern}
          )
        ORDER BY
          CASE WHEN description ILIKE ${searchPattern} THEN 0 ELSE 1 END,
          date DESC
        LIMIT ${limit}
      `
      results.transactions = transactionResults.map(t => ({
        id: t.id,
        type: 'transaction',
        title: t.description || t.merchant || 'Transaction',
        amount: parseFloat(t.amount),
        transactionType: t.type,
        category: t.category,
        merchant: t.merchant,
        date: t.date,
        notes: t.notes
      }))

      const transactionCount = await sql`
        SELECT COUNT(*) as count FROM transactions
        WHERE user_id = ${userId}
          AND (
            description ILIKE ${searchPattern}
            OR category ILIKE ${searchPattern}
            OR merchant ILIKE ${searchPattern}
            OR notes ILIKE ${searchPattern}
          )
      `
      counts.transactions = parseInt(transactionCount[0]?.count || '0')
    }

    // Search decisions (from memory WHY layer)
    if (domains.includes('decisions')) {
      const decisionResults = await sql`
        SELECT
          id,
          title,
          summary,
          status,
          domains as decision_domains,
          tags,
          project_id,
          idea_id,
          updated_at
        FROM mlp_why_decisions
        WHERE user_id = ${userId}
          AND (
            title ILIKE ${searchPattern}
            OR summary ILIKE ${searchPattern}
            OR tags::text ILIKE ${searchPattern}
          )
        ORDER BY
          CASE WHEN title ILIKE ${searchPattern} THEN 0 ELSE 1 END,
          updated_at DESC
        LIMIT ${limit}
      `
      results.decisions = decisionResults.map(d => ({
        id: d.id,
        type: 'decision',
        title: d.title,
        summary: d.summary,
        status: d.status,
        domains: d.decision_domains || [],
        tags: d.tags || [],
        projectId: d.project_id,
        ideaId: d.idea_id,
        updatedAt: d.updated_at
      }))

      const decisionCount = await sql`
        SELECT COUNT(*) as count FROM mlp_why_decisions
        WHERE user_id = ${userId}
          AND (
            title ILIKE ${searchPattern}
            OR summary ILIKE ${searchPattern}
            OR tags::text ILIKE ${searchPattern}
          )
      `
      counts.decisions = parseInt(decisionCount[0]?.count || '0')
    }

    // Calculate total matches
    const totalMatches = Object.values(counts).reduce((sum, count) => sum + count, 0)

    return successResponse({
      query,
      results,
      counts,
      totalMatches,
      searchedDomains: domains
    }, {
      limit
    })
  } catch (error: any) {
    console.error('[API] GET /api/search error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to search',
      500,
      error.message
    )
  }
}
