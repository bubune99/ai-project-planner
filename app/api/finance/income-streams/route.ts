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
 * GET /api/finance/income-streams
 * List all income streams
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const activeOnly = searchParams.get('active') !== 'false'
    const sourceType = searchParams.get('sourceType')

    const streams = await sql`
      SELECT s.*, a.name as account_name
      FROM finance_income_streams s
      LEFT JOIN finance_accounts a ON s.account_id = a.id
      WHERE s.user_id = ${userId}
        AND s.deleted_at IS NULL
        ${activeOnly ? sql`AND s.is_active = true` : sql``}
        ${sourceType ? sql`AND s.source_type = ${sourceType}` : sql``}
      ORDER BY s.amount DESC, s.name ASC
    `

    // Calculate monthly income
    const monthlyTotal = streams.reduce((sum, s) => {
      const amount = parseFloat(s.amount)
      switch (s.frequency) {
        case 'daily': return sum + amount * 30
        case 'weekly': return sum + amount * 4
        case 'biweekly': return sum + amount * 2
        case 'monthly': return sum + amount
        case 'quarterly': return sum + amount / 3
        case 'yearly': return sum + amount / 12
        default: return sum + amount
      }
    }, 0)

    return successResponse(streams.map(transformIncomeStream), {
      total: streams.length,
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100
    })
  } catch (error: any) {
    console.error('[API] GET /api/finance/income-streams error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get income streams', 500, error.message)
  }
}

/**
 * POST /api/finance/income-streams
 * Create a new income stream
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
      sourceType,
      amount,
      currency,
      frequency,
      nextPaymentDate,
      accountId,
      sourceName,
      isTaxable,
      taxCategory,
      metadata
    } = body

    if (!name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Name is required', 400)
    }
    if (!sourceType) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Source type is required', 400)
    }
    if (!amount || amount <= 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Valid positive amount is required', 400)
    }

    const result = await sql`
      INSERT INTO finance_income_streams (
        user_id, name, source_type, amount, currency, frequency,
        next_payment_date, account_id, source_name, is_taxable,
        tax_category, metadata
      ) VALUES (
        ${userId},
        ${name.trim()},
        ${sourceType},
        ${amount},
        ${currency || 'USD'},
        ${frequency || 'monthly'},
        ${nextPaymentDate || null},
        ${accountId || null},
        ${sourceName || null},
        ${isTaxable !== false},
        ${taxCategory || null},
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

    return successResponse(transformIncomeStream(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/finance/income-streams error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create income stream', 500, error.message)
  }
}
