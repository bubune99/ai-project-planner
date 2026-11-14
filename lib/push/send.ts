import webPush from 'web-push'
import { sql } from '@/lib/db/client'

/** Phone notifications need a key pair in the environment. Without it nothing is sent and nothing breaks. */
export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

let ready = false
function setup(): boolean {
  if (ready) return true
  if (!pushConfigured()) return false
  webPush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@faridea.dev', process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
  ready = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/** Sends to every device the user turned notifications on for. A device that has gone away is forgotten. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!setup()) return { sent: 0, failed: 0, configured: false }
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
  return { sent, failed, configured: true }
}
