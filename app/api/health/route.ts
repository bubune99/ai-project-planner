import { NextResponse } from 'next/server'
import { sql } from '@/lib/db/client'

/**
 * Health check endpoint
 * Tests database connectivity and environment configuration
 */
export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    database: 'unknown',
    environment: process.env.NODE_ENV,
    hasDbUrl: !!process.env.DATABASE_URL,
    hasMcpKey: !!process.env.MCP_API_KEY,
  }

  try {
    // Test database connection
    const result = await sql`SELECT 1 as health, NOW() as db_time`
    checks.database = 'connected'

    return NextResponse.json({
      status: 'ok',
      checks,
      dbResponse: result[0]
    })
  } catch (error: any) {
    checks.database = 'error'

    return NextResponse.json({
      status: 'error',
      checks,
      error: {
        message: error.message,
        code: error.code,
        detail: error.detail
      }
    }, { status: 503 })
  }
}
