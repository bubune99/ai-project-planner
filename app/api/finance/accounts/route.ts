import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { FinanceAccount } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend FinanceAccount format
 */
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
 * GET /api/finance/accounts
 * List all accounts for authenticated user
 *
 * Query params:
 * - type: account_type filter
 * - active: "true" | "false"
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const accountType = searchParams.get('type')
    const activeOnly = searchParams.get('active') !== 'false'

    const accounts = await sql`
      SELECT * FROM finance_accounts
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        ${activeOnly ? sql`AND is_active = true` : sql``}
        ${accountType ? sql`AND account_type = ${accountType}` : sql``}
      ORDER BY is_primary DESC, name ASC
    `

    // Calculate totals
    const totals = await sql`
      SELECT
        SUM(CASE WHEN account_type NOT IN ('credit_card', 'loan') THEN current_balance ELSE 0 END) as total_assets,
        SUM(CASE WHEN account_type IN ('credit_card', 'loan') THEN current_balance ELSE 0 END) as total_liabilities
      FROM finance_accounts
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND is_active = true
    `

    return successResponse(accounts.map(transformAccount), {
      total: accounts.length,
      totals: {
        assets: parseFloat(totals[0]?.total_assets || '0'),
        liabilities: parseFloat(totals[0]?.total_liabilities || '0'),
        netWorth: parseFloat(totals[0]?.total_assets || '0') - parseFloat(totals[0]?.total_liabilities || '0')
      }
    })
  } catch (error: any) {
    console.error('[API] GET /api/finance/accounts error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get accounts', 500, error.message)
  }
}

/**
 * POST /api/finance/accounts
 * Create a new financial account
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
      name,
      accountType,
      institution,
      accountNumberLast4,
      currency,
      currentBalance,
      availableBalance,
      creditLimit,
      interestRate,
      loanPrincipal,
      loanTermMonths,
      isPrimary,
      color,
      icon,
      metadata
    } = body

    // Validate required fields
    if (!name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Account name is required', 400)
    }
    if (!accountType) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Account type is required', 400)
    }

    // If this is set as primary, unset other primary accounts
    if (isPrimary) {
      await sql`
        UPDATE finance_accounts
        SET is_primary = false
        WHERE user_id = ${userId} AND is_primary = true
      `
    }

    const result = await sql`
      INSERT INTO finance_accounts (
        user_id, name, account_type, institution, account_number_last4,
        currency, current_balance, available_balance, credit_limit,
        interest_rate, loan_principal, loan_term_months, is_primary,
        color, icon, metadata
      ) VALUES (
        ${userId},
        ${name.trim()},
        ${accountType},
        ${institution || null},
        ${accountNumberLast4 || null},
        ${currency || 'USD'},
        ${currentBalance || 0},
        ${availableBalance || null},
        ${creditLimit || null},
        ${interestRate || null},
        ${loanPrincipal || null},
        ${loanTermMonths || null},
        ${isPrimary || false},
        ${color || null},
        ${icon || null},
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

    return successResponse(transformAccount(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/finance/accounts error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create account', 500, error.message)
  }
}
