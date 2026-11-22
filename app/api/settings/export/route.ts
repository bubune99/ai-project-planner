/**
 * GET /api/settings/export  → a JSON file of what the signed-in person owns ("Export my data" in Settings).
 *
 * What goes in, what is dropped and what the file looks like are decided in lib/settings/export-model.ts.
 * This route only reads. Every query below is narrowed to the signed-in person's id (their own rows, or rows
 * of a project, idea or chat that is theirs); the words for each are in EXPORT_GROUPS[].filter and the two
 * must say the same thing.
 *
 * - A browser session only. An API key is refused: a key handed to an agent should not be able to carry off
 *   the whole account in one call.
 * - Each list is read newest first with one row more than its limit, so the file can say it was cut.
 * - A list that cannot be read is marked failed in the file rather than shown as empty; if none can be read
 *   the request fails.
 */
import { sql } from "@/lib/db/client"
import { errorResponse, ErrorCodes } from "@/lib/api-utils"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { checkRateLimit, HOUR_MS } from "@/lib/rate-limit"
import {
  EXPORT_GROUPS, buildExport, exportFileName,
  type ExportKey, type GroupRead,
} from "@/lib/settings/export-model"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const EXPORTS_PER_HOUR = 6
/** Lists read at the same time. */
const AT_ONCE = 6

type Rows = Promise<Record<string, unknown>[]>

/** One query per list. `u` is the signed-in person's id, `n` the most rows to read. Typed by key, so a list added to the model without a query here does not compile. */
const READ: Record<ExportKey, (u: string, n: number) => Rows> = {
  notification_prefs: (u, n) => sql`SELECT prefs, updated_at FROM notification_prefs WHERE user_id = ${u} LIMIT ${n}`,
  // Named columns: the key's hash is never read.
  api_keys: (u, n) => sql`
    SELECT id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at
    FROM api_keys WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  // Named columns: the device's address and keys are never read.
  devices: (u, n) => sql`SELECT updated_at, deleted_at FROM push_subscriptions WHERE user_id = ${u} ORDER BY updated_at DESC LIMIT ${n}`,

  projects: (u, n) => sql`SELECT * FROM projects WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  tasks: (u, n) => sql`
    SELECT * FROM project_steps WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${u})
    ORDER BY created_at DESC LIMIT ${n}`,
  phases: (u, n) => sql`
    SELECT * FROM project_phases WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${u})
    ORDER BY created_at DESC LIMIT ${n}`,
  progress_notes: (u, n) => sql`
    SELECT * FROM progress_notes WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${u})
    ORDER BY created_at DESC LIMIT ${n}`,
  task_comments: (u, n) => sql`
    SELECT * FROM step_comments WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${u})
    ORDER BY created_at DESC LIMIT ${n}`,
  decisions: (u, n) => sql`SELECT * FROM mlp_why_decisions WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  architecture_decisions: (u, n) => sql`
    SELECT * FROM architecture_decisions WHERE project_id IN (SELECT id FROM projects WHERE user_id = ${u})
    ORDER BY created_at DESC LIMIT ${n}`,

  documents: (u, n) => sql`
    SELECT * FROM documents
    WHERE user_id = ${u} OR project_id IN (SELECT id FROM projects WHERE user_id = ${u})
    ORDER BY created_at DESC LIMIT ${n}`,
  processes: (u, n) => sql`SELECT * FROM sops WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,

  todos: (u, n) => sql`SELECT * FROM todos WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,

  ideas: (u, n) => sql`SELECT * FROM ideas WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  idea_facets: (u, n) => sql`
    SELECT * FROM idea_facets WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ${u})
    ORDER BY created_at DESC LIMIT ${n}`,
  idea_notes: (u, n) => sql`
    SELECT * FROM idea_notes WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ${u})
    ORDER BY created_at DESC LIMIT ${n}`,

  finance_accounts: (u, n) => sql`SELECT * FROM finance_accounts WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  finance_categories: (u, n) => sql`SELECT * FROM finance_categories WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  finance_transactions: (u, n) => sql`SELECT * FROM finance_transactions WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  finance_budgets: (u, n) => sql`SELECT * FROM finance_budgets WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  finance_income_streams: (u, n) => sql`SELECT * FROM finance_income_streams WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  finance_recurring: (u, n) => sql`SELECT * FROM finance_recurring_transactions WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  finance_goals: (u, n) => sql`SELECT * FROM finance_goals WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,

  calendar_events: (u, n) => sql`SELECT * FROM calendar_events WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  calendar_categories: (u, n) => sql`SELECT * FROM calendar_categories WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,

  clients: (u, n) => sql`SELECT * FROM clients WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  service_schedules: (u, n) => sql`SELECT * FROM service_schedules WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,

  skills: (u, n) => sql`SELECT * FROM skills WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  templates: (u, n) => sql`SELECT * FROM feature_templates WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  protocols: (u, n) => sql`SELECT * FROM protocols WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  prompts: (u, n) => sql`SELECT * FROM prompts WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  statements: (u, n) => sql`SELECT * FROM gate_guides WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,

  chats: (u, n) => sql`SELECT * FROM ai_conversations WHERE user_id = ${u} ORDER BY created_at DESC LIMIT ${n}`,
  chat_messages: (u, n) => sql`
    SELECT * FROM ai_messages WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = ${u})
    ORDER BY created_at DESC LIMIT ${n}`,
}

/** The body in pieces, so a large file is sent as a stream rather than one block. */
function inPieces(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  const PIECE = 256 * 1024
  let at = 0
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) { controller.close(); return }
      controller.enqueue(bytes.subarray(at, at + PIECE))
      at += PIECE
    },
  })
}

export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, "Sign in to export your data.", 401)
  if (auth.authType !== "session") {
    return errorResponse(ErrorCodes.FORBIDDEN, "Export is only available from the Settings page while signed in.", 403)
  }
  const userId = auth.userId

  if (!(await checkRateLimit(`settings-export:${userId}`, EXPORTS_PER_HOUR, HOUR_MS))) {
    return errorResponse("RATE_LIMITED", `You can export ${EXPORTS_PER_HOUR} times an hour. Try again later.`, 429)
  }

  let account: { id: string; email: string; name: string | null }
  try {
    const rows = await sql`SELECT id, email, name FROM users WHERE id = ${userId}`
    if (rows.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, "Your account was not found.", 404)
    account = { id: String(rows[0].id), email: String(rows[0].email), name: rows[0].name == null ? null : String(rows[0].name) }
  } catch (err) {
    console.error("[settings/export] could not read the account", err)
    return errorResponse(ErrorCodes.DATABASE_ERROR, "Your data could not be read. Nothing was exported.", 500)
  }

  const reads: Partial<Record<ExportKey, GroupRead>> = {}
  for (let i = 0; i < EXPORT_GROUPS.length; i += AT_ONCE) {
    await Promise.all(EXPORT_GROUPS.slice(i, i + AT_ONCE).map(async (group) => {
      try {
        reads[group.key] = { rows: await READ[group.key](userId, group.cap + 1) }
      } catch (err) {
        // The reason stays in the server log; the file only says this list could not be read.
        console.error(`[settings/export] could not read ${group.key}`, err)
        reads[group.key] = { error: "could not be read" }
      }
    }))
  }
  if (Object.values(reads).every((r) => r && "error" in r)) {
    return errorResponse(ErrorCodes.DATABASE_ERROR, "Your data could not be read. Nothing was exported.", 500)
  }

  const now = new Date()
  const file = buildExport({ now, account, reads })
  const rowCount = file.contents.reduce((sum, c) => sum + c.count, 0)

  return new Response(inPieces(JSON.stringify(file)), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
      "Cache-Control": "no-store",
      "X-Export-Complete": file.complete ? "true" : "false",
      "X-Export-Rows": String(rowCount),
    },
  })
}
