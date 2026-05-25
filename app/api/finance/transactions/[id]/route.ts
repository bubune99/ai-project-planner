import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { mergeEnvelopeForPatch, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

function transformTransaction(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    accountName: row.account_name,
    transactionType: row.transaction_type,
    amount: parseFloat(row.amount),
    currency: row.currency,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
    description: row.description,
    merchant: row.merchant,
    notes: row.notes,
    transactionDate: row.transaction_date,
    postedDate: row.posted_date,
    transferToAccountId: row.transfer_to_account_id,
    transferPairId: row.transfer_pair_id,
    isRecurring: row.is_recurring,
    recurringId: row.recurring_id,
    tags: row.tags || [],
    externalId: row.external_id,
    locationName: row.location_name,
    isPending: row.is_pending,
    isReconciled: row.is_reconciled,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/finance/transactions/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params

    const transactions = await sql`
      SELECT
        t.*,
        a.name as account_name,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color
      FROM finance_transactions t
      LEFT JOIN finance_accounts a ON t.account_id = a.id
      LEFT JOIN finance_categories c ON t.category_id = c.id
      WHERE t.id = ${id} AND t.user_id = ${userId}
    `

    if (transactions.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Transaction not found', 404)
    }

    return successResponse(transformTransaction(transactions[0]))
  } catch (error: any) {
    console.error('[API] GET /api/finance/transactions/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get transaction', 500, error.message)
  }
}

/**
 * PATCH /api/finance/transactions/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params
    const body = await request.json()

    // Verify ownership
    const existing = await sql`
      SELECT id, documentation_5wh FROM finance_transactions
      WHERE id = ${id} AND user_id = ${userId}
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Transaction not found', 404)
    }

    const {
      categoryId,
      description,
      merchant,
      notes,
      transactionDate,
      postedDate,
      tags,
      locationName,
      isPending,
      isReconciled,
      metadata
    } = body

    // Merge 5W+H envelope (non-fatal: transactions have no project_id)
    const mergeResult = mergeEnvelopeForPatch(
      existing[0]?.documentation_5wh,
      body,
      { userId, projectId: undefined, agentId: undefined },
      {
        type: 'finance_transaction',
        title: description || undefined,
        summary: description || body.summary,
        rationale: body?.documentation_5wh?.why?.rationale || 'Update via PATCH /api/finance/transactions/[id]',
      }
    )
    const hasEnvelope = mergeResult.ok

    await sql`
      UPDATE finance_transactions SET
        category_id       = COALESCE(${categoryId}, category_id),
        description       = COALESCE(${description}, description),
        merchant          = COALESCE(${merchant}, merchant),
        notes             = COALESCE(${notes}, notes),
        transaction_date  = COALESCE(${transactionDate}, transaction_date),
        posted_date       = COALESCE(${postedDate}, posted_date),
        tags              = COALESCE(${tags}, tags),
        location_name     = COALESCE(${locationName}, location_name),
        is_pending        = COALESCE(${isPending}, is_pending),
        is_reconciled     = COALESCE(${isReconciled}, is_reconciled),
        metadata          = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata),
        documentation_5wh = COALESCE(${hasEnvelope ? envelopeForSql(mergeResult.envelope) : null}::jsonb, documentation_5wh)
      WHERE id = ${id}
    `

    // Fetch updated with joins
    const updated = await sql`
      SELECT
        t.*,
        a.name as account_name,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color
      FROM finance_transactions t
      LEFT JOIN finance_accounts a ON t.account_id = a.id
      LEFT JOIN finance_categories c ON t.category_id = c.id
      WHERE t.id = ${id}
    `

    return successResponse(transformTransaction(updated[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/finance/transactions/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update transaction', 500, error.message)
  }
}

/**
 * DELETE /api/finance/transactions/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params

    // Note: The trigger will automatically reverse the account balance
    const result = await sql`
      DELETE FROM finance_transactions
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Transaction not found', 404)
    }

    return successResponse({ deleted: true, id })
  } catch (error: any) {
    console.error('[API] DELETE /api/finance/transactions/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete transaction', 500, error.message)
  }
}
