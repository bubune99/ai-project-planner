import { NextRequest, NextResponse } from 'next/server'
import { stackServerApp } from '@/lib/auth/stack-auth'
import { sql } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await stackServerApp.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (
      (SELECT id FROM users WHERE stack_id = ${user.id} LIMIT 1),
      ${endpoint},
      ${keys.p256dh},
      ${keys.auth}
    )
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      updated_at = NOW(),
      deleted_at = NULL
  `

  return NextResponse.json({ subscribed: true })
}

export async function DELETE(request: NextRequest) {
  const user = await stackServerApp.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = await request.json()
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  await sql`
    UPDATE push_subscriptions SET deleted_at = NOW()
    WHERE endpoint = ${endpoint}
      AND user_id = (SELECT id FROM users WHERE stack_id = ${user.id} LIMIT 1)
  `

  return NextResponse.json({ unsubscribed: true })
}
