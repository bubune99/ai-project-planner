import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db/client'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { PUBLIC_ROUTE_LIMITS, publicLimitKey } from '@/lib/public-route-limits'

export const dynamic = 'force-dynamic'

/**
 * Health check endpoint
 * Returns minimal status info to avoid leaking environment details
 *
 * Answers without a signed-in caller (declared public in security.config.json), so each address is limited:
 * 60 a minute, sixty times what an uptime checker asking once a minute needs.
 */
export async function GET(request: NextRequest) {
  const { limit, windowMs } = PUBLIC_ROUTE_LIMITS.health

  // The limiter counts in the database, so "allowed" already proves the database answered: that is the health
  // check, and no second query is needed.
  if (await checkRateLimit(publicLimitKey('health', clientIp(request)), limit, windowMs)) {
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  }

  // Refused: either over the limit, or the limiter could not count because the database is unreachable (it
  // refuses in both cases). Ask the database, so an outage still reads as an outage and not as "too many".
  try {
    await sql`SELECT 1 as health`
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
    }, { status: 503 })
  }

  return NextResponse.json(
    { status: 'limited', error: 'Too many health checks from this address. Try again in a minute.' },
    { status: 429, headers: { 'Retry-After': '60' } }
  )
}
