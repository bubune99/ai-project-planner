/**
 * POST   /api/push/subscribe  { endpoint, keys: { p256dh, auth } }  → turn notifications on for this device
 * DELETE /api/push/subscribe  { endpoint }                          → turn them off for this device
 *
 * The signed-in user comes from getAuthContext, the same as /api/push/prefs, so the device is saved
 * under the id the sender reads (lib/push/send.ts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db/client'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

const short = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  const endpoint = short(body?.endpoint, 2000)
  const p256dh = short(body?.keys?.p256dh, 300)
  const key = short(body?.keys?.auth, 300)
  if (!endpoint || !endpoint.startsWith('https://') || !p256dh || !key) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  try {
    // A device that signs in as someone else moves to that person.
    await sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (${auth.userId}, ${endpoint}, ${p256dh}, ${key})
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        updated_at = NOW(),
        deleted_at = NULL
    `
  } catch (err) {
    console.error('push subscribe: could not save the device', err)
    return NextResponse.json({ error: 'This device could not be saved.' }, { status: 500 })
  }

  return NextResponse.json({ subscribed: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null
  const endpoint = short(body?.endpoint, 2000)
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  try {
    await sql`UPDATE push_subscriptions SET deleted_at = NOW() WHERE endpoint = ${endpoint} AND user_id = ${auth.userId}`
  } catch (err) {
    console.error('push subscribe: could not turn the device off', err)
    return NextResponse.json({ error: 'This device could not be turned off.' }, { status: 500 })
  }

  return NextResponse.json({ unsubscribed: true })
}
