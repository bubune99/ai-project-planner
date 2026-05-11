import { NextResponse } from 'next/server'
import { sql } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

/**
 * Health check endpoint
 * Returns minimal status info to avoid leaking environment details
 */
export async function GET() {
  try {
    // Test database connection
    await sql`SELECT 1 as health`

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
    }, { status: 503 })
  }
}
