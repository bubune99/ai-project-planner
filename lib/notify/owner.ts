/*
 * Tells the owner on their phone that something is waiting on them. Called where a question is put in their inbox
 * and where a change is made ready to judge. It never throws and never holds the caller up: a notice that could not
 * be sent must not stop the work that raised it. Rules and wording: notify-model.ts.
 */
import { sql } from "@/lib/db/client"
import { sendPushToUser } from "@/lib/push/send"
import { noticeFor, parsePrefs, type NotifyKind, type NotifyPrefs } from "./notify-model"

export async function getPrefs(userId: string): Promise<NotifyPrefs> {
  try {
    const rows = (await sql`SELECT prefs FROM notification_prefs WHERE user_id = ${userId}`) as { prefs: unknown }[]
    return parsePrefs(rows[0]?.prefs)
  } catch { return parsePrefs(null) }
}

export async function savePrefs(userId: string, raw: unknown): Promise<NotifyPrefs> {
  const prefs = parsePrefs(raw)
  await sql`
    INSERT INTO notification_prefs (user_id, prefs) VALUES (${userId}, ${JSON.stringify(prefs)}::jsonb)
    ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()
  `
  return prefs
}

export async function notifyOwner(userId: string, kind: NotifyKind, a: { id: string; text: string; projectId?: string | null }): Promise<void> {
  try {
    if (!(await getPrefs(userId))[kind]) return
    let projectName: string | null = null
    if (a.projectId) {
      const rows = (await sql`SELECT name FROM projects WHERE id::text = ${a.projectId} AND deleted_at IS NULL`) as { name: string }[]
      projectName = rows[0]?.name ?? null
    }
    await sendPushToUser(userId, noticeFor(kind, { ...a, projectName }))
  } catch (error) {
    console.error("notifyOwner failed:", error instanceof Error ? error.message : error)
  }
}
