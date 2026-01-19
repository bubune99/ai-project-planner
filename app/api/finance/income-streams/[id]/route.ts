import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { FinanceIncomeStream } from '@/lib/types'

export const dynamic = 'force-dynamic'

function transformIncomeStream(row: any): FinanceIncomeStream {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sourceType: row.source_type,
    amount: parseFloat(row.amount),
    currency: row.currency,
    frequency: row.frequency,
    nextPaymentDate: row.next_payment_date,
    accountId: row.account_id,
    sourceName: row.source_name,
    isTaxable: row.is_taxable,
    taxCategory: row.tax_category,
    isActive: row.is_active,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/finance/income-streams/[id]
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

    const streams = await sql`
      SELECT s.*, a.name as account_name
      FROM finance_income_streams s
      LEFT JOIN finance_accounts a ON s.account_id = a.id
      WHERE s.id = ${id} AND s.user_id = ${userId} AND s.deleted_at IS NULL
    `

    if (streams.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Income stream not found', 404)
    }

    return successResponse(transformIncomeStream(streams[0]))
  } catch (error: any) {
    console.error('[API] GET /api/finance/income-streams/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get income stream', 500, error.message)
  }
}

/**
 * PATCH /api/finance/income-streams/[id]
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
      SELECT * FROM finance_income_streams
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Income stream not found', 404)
    }

    const {
      name,
      sourceType,
      amount,
      currency,
      frequency,
      nextPaymentDate,
      accountId,
      sourceName,
      isTaxable,
      taxCategory,
      isActive,
      metadata
    } = body

    const result = await sql`
      UPDATE finance_income_streams SET
        name = COALESCE(${name}, name),
        source_type = COALESCE(${sourceType}, source_type),
        amount = COALESCE(${amount}, amount),
        currency = COALESCE(${currency}, currency),
        frequency = COALESCE(${frequency}, frequency),
        next_payment_date = COALESCE(${nextPaymentDate}, next_payment_date),
        account_id = COALESCE(${accountId}, account_id),
        source_name = COALESCE(${sourceName}, source_name),
        is_taxable = COALESCE(${isTaxable}, is_taxable),
        tax_category = COALESCE(${taxCategory}, tax_category),
        is_active = COALESCE(${isActive}, is_active),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata)
      WHERE id = ${id}
      RETURNING *
    `

    // Fetch with account name join
    const updated = await sql`
      SELECT s.*, a.name as account_name
      FROM finance_income_streams s
      LEFT JOIN finance_accounts a ON s.account_id = a.id
      WHERE s.id = ${id}
    `

    return successResponse(transformIncomeStream(updated[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/finance/income-streams/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update income stream', 500, error.message)
  }
}

/**
 * DELETE /api/finance/income-streams/[id]
 * Soft delete an income stream
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

    const result = await sql`
      UPDATE finance_income_streams
      SET deleted_at = NOW(), is_active = false
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Income stream not found', 404)
    }

    return successResponse({ deleted: true, id })
  } catch (error: any) {
    console.error('[API] DELETE /api/finance/income-streams/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete income stream', 500, error.message)
  }
}
