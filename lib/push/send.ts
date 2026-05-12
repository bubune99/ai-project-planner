import webPush from 'web-push'
import { sql } from '@/lib/db/client'

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@faridea.dev',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const subscriptions = await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions
    WHERE user_id = ${userId} AND deleted_at IS NULL
  `

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      ).catch(async err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`
        }
        throw err
      })
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  return { sent, failed }
}

export async function sendPushToAll(payload: PushPayload) {
  const subscriptions = await sql`
    SELECT DISTINCT ON (user_id) user_id, endpoint, p256dh, auth
    FROM push_subscriptions WHERE deleted_at IS NULL
    ORDER BY user_id, created_at DESC
  `

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    )
  )

  return {
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
  }
}
