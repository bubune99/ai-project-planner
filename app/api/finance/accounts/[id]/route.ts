import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { FinanceAccount } from '@/lib/types'

export const dynamic = 'force-dynamic'

function transformAccount(row: any): FinanceAccount {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    accountType: row.account_type,
    institution: row.institution,
    accountNumberLast4: row.account_number_last4,
    currency: row.currency,
    currentBalance: parseFloat(row.current_balance),
    availableBalance: row.available_balance ? parseFloat(row.available_balance) : null,
    creditLimit: row.credit_limit ? parseFloat(row.credit_limit) : null,
    interestRate: row.interest_rate ? parseFloat(row.interest_rate) : null,
    loanPrincipal: row.loan_principal ? parseFloat(row.loan_principal) : null,
    loanTermMonths: row.loan_term_months,
    isActive: row.is_active,
    isPrimary: row.is_primary,
    color: row.color,
    icon: row.icon,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/finance/accounts/[id]
 * Get a single account with recent transactions
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

    const accounts = await sql`
      SELECT * FROM finance_accounts
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `

    if (accounts.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Account not found', 404)
    }

    // Get recent transactions for this account
    const recentTransactions = await sql`
      SELECT * FROM finance_transactions
      WHERE account_id = ${id}
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 10
    `

    return successResponse({
      ...transformAccount(accounts[0]),
      recentTransactions: recentTransactions.map(t => ({
        id: t.id,
        type: t.transaction_type,
        amount: parseFloat(t.amount),
        description: t.description,
        merchant: t.merchant,
        date: t.transaction_date,
        categoryId: t.category_id
      }))
    })
  } catch (error: any) {
    console.error('[API] GET /api/finance/accounts/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get account', 500, error.message)
  }
}

/**
 * PATCH /api/finance/accounts/[id]
 * Update an account
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
      SELECT id FROM finance_accounts
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Account not found', 404)
    }

    const {
      name,
      institution,
      accountNumberLast4,
      currentBalance,
      availableBalance,
      creditLimit,
      interestRate,
      isActive,
      isPrimary,
      color,
      icon,
      metadata
    } = body

    // If setting as primary, unset other primary accounts
    if (isPrimary === true) {
      await sql`
        UPDATE finance_accounts
        SET is_primary = false
        WHERE user_id = ${userId} AND is_primary = true AND id != ${id}
      `
    }

    const result = await sql`
      UPDATE finance_accounts SET
        name = COALESCE(${name}, name),
        institution = COALESCE(${institution}, institution),
        account_number_last4 = COALESCE(${accountNumberLast4}, account_number_last4),
        current_balance = COALESCE(${currentBalance}, current_balance),
        available_balance = COALESCE(${availableBalance}, available_balance),
        credit_limit = COALESCE(${creditLimit}, credit_limit),
        interest_rate = COALESCE(${interestRate}, interest_rate),
        is_active = COALESCE(${isActive}, is_active),
        is_primary = COALESCE(${isPrimary}, is_primary),
        color = COALESCE(${color}, color),
        icon = COALESCE(${icon}, icon),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata)
      WHERE id = ${id}
      RETURNING *
    `

    return successResponse(transformAccount(result[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/finance/accounts/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update account', 500, error.message)
  }
}

/**
 * DELETE /api/finance/accounts/[id]
 * Soft delete an account
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
      UPDATE finance_accounts
      SET deleted_at = NOW(), is_active = false
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Account not found', 404)
    }

    return successResponse({ deleted: true, id })
  } catch (error: any) {
    console.error('[API] DELETE /api/finance/accounts/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete account', 500, error.message)
  }
}
