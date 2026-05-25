import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { FinanceTransaction } from '@/lib/types'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

function transformTransaction(row: any): FinanceTransaction {
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
    locationLat: row.location_lat ? parseFloat(row.location_lat) : null,
    locationLng: row.location_lng ? parseFloat(row.location_lng) : null,
    receiptBlobKey: row.receipt_blob_key,
    isPending: row.is_pending,
    isReconciled: row.is_reconciled,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/finance/transactions
 * List transactions with filters
 *
 * Query params:
 * - accountId: filter by account
 * - categoryId: filter by category
 * - type: income | expense | transfer
 * - startDate: YYYY-MM-DD
 * - endDate: YYYY-MM-DD
 * - search: search in description/merchant
 * - limit: number (default 50)
 * - offset: number (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const accountId = searchParams.get('accountId')
    const categoryId = searchParams.get('categoryId')
    const type = searchParams.get('type')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const search = searchParams.get('search')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

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
      WHERE t.user_id = ${userId}
        ${accountId ? sql`AND t.account_id = ${accountId}` : sql``}
        ${categoryId ? sql`AND t.category_id = ${categoryId}` : sql``}
        ${type ? sql`AND t.transaction_type = ${type}` : sql``}
        ${startDate ? sql`AND t.transaction_date >= ${startDate}` : sql``}
        ${endDate ? sql`AND t.transaction_date <= ${endDate}` : sql``}
        ${search ? sql`AND (t.description ILIKE ${'%' + search + '%'} OR t.merchant ILIKE ${'%' + search + '%'})` : sql``}
      ORDER BY t.transaction_date DESC, t.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    // Get totals for the filtered period
    const totals = await sql`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as total_expenses
      FROM finance_transactions
      WHERE user_id = ${userId}
        ${accountId ? sql`AND account_id = ${accountId}` : sql``}
        ${categoryId ? sql`AND category_id = ${categoryId}` : sql``}
        ${type ? sql`AND transaction_type = ${type}` : sql``}
        ${startDate ? sql`AND transaction_date >= ${startDate}` : sql``}
        ${endDate ? sql`AND transaction_date <= ${endDate}` : sql``}
    `

    return successResponse(transactions.map(transformTransaction), {
      total: parseInt(totals[0]?.total_count || '0'),
      limit,
      offset,
      totals: {
        income: parseFloat(totals[0]?.total_income || '0'),
        expenses: parseFloat(totals[0]?.total_expenses || '0'),
        net: parseFloat(totals[0]?.total_income || '0') - parseFloat(totals[0]?.total_expenses || '0')
      }
    })
  } catch (error: any) {
    console.error('[API] GET /api/finance/transactions error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get transactions', 500, error.message)
  }
}

/**
 * POST /api/finance/transactions
 * Create a new transaction
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const {
      accountId,
      transactionType,
      amount,
      currency,
      categoryId,
      description,
      merchant,
      notes,
      transactionDate,
      postedDate,
      transferToAccountId,
      tags,
      externalId,
      locationName,
      locationLat,
      locationLng,
      isPending,
      metadata
    } = body

    // Validate required fields
    if (!accountId) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Account ID is required', 400)
    }
    if (!transactionType || !['income', 'expense', 'transfer'].includes(transactionType)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Valid transaction type is required', 400)
    }
    if (!amount || amount <= 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Valid positive amount is required', 400)
    }
    if (!transactionDate) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Transaction date is required', 400)
    }

    // Verify account ownership
    const account = await sql`
      SELECT id FROM finance_accounts
      WHERE id = ${accountId} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (account.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Account not found', 404)
    }

    // For transfers, verify destination account
    if (transactionType === 'transfer' && transferToAccountId) {
      const destAccount = await sql`
        SELECT id FROM finance_accounts
        WHERE id = ${transferToAccountId} AND user_id = ${userId} AND deleted_at IS NULL
      `
      if (destAccount.length === 0) {
        return errorResponse(ErrorCodes.NOT_FOUND, 'Destination account not found', 404)
      }
    }

    // Build 5W+H envelope (legacy mode, non-fatal: transactions are user-scoped, no project_id)
    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId: undefined, agentId: undefined },
      {
        type: 'finance_transaction',
        title: description || `${transactionType} ${amount} ${currency || 'USD'}`,
        summary: description || `${transactionType} transaction of ${amount} ${currency || 'USD'}`,
        rationale: body?.documentation_5wh?.why?.rationale,
      },
      'legacy'
    )
    const hasEnvelope = envelopeResult.ok

    const result = await sql`
      INSERT INTO finance_transactions (
        user_id, account_id, transaction_type, amount, currency,
        category_id, description, merchant, notes, transaction_date,
        posted_date, transfer_to_account_id, tags, external_id,
        location_name, location_lat, location_lng, is_pending, metadata,
        documentation_5wh
      ) VALUES (
        ${userId},
        ${accountId},
        ${transactionType},
        ${amount},
        ${currency || 'USD'},
        ${categoryId || null},
        ${description || null},
        ${merchant || null},
        ${notes || null},
        ${transactionDate},
        ${postedDate || null},
        ${transferToAccountId || null},
        ${tags || []},
        ${externalId || null},
        ${locationName || null},
        ${locationLat || null},
        ${locationLng || null},
        ${isPending || false},
        ${metadata ? JSON.stringify(metadata) : '{}'},
        ${hasEnvelope ? envelopeForSql(envelopeResult.envelope) : null}::jsonb
      )
      RETURNING *
    `

    // Fetch with joins for response
    const fullTransaction = await sql`
      SELECT
        t.*,
        a.name as account_name,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color
      FROM finance_transactions t
      LEFT JOIN finance_accounts a ON t.account_id = a.id
      LEFT JOIN finance_categories c ON t.category_id = c.id
      WHERE t.id = ${result[0].id}
    `

    return successResponse(transformTransaction(fullTransaction[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/finance/transactions error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create transaction', 500, error.message)
  }
}
