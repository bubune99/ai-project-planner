/**
 * GET /api/inbox — what is waiting on the owner.
 *
 * Every agent_jobs row of the caller's in 'awaiting-unlock': questions asked
 * with the ask_owner MCP tool, plus jobs paused by request_unlock. Newest
 * first (owner, 2026-11-14: "newer items should appear towards the top, not the
 * bottom"). Each card shows how long it has waited, so an old one is still seen for what it is.
 *
 * Each question names the card it holds up (its title, for the link), when it has one. ?step=<card id> lists only
 * the questions holding that card, for the opened card.
 */
import { NextRequest } from "next/server"
import { storedPictures } from "@/lib/inbox/pictures"
import { sql } from "@/lib/db/client"
import { successResponse, errorResponse, ErrorCodes } from "@/lib/api-utils"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { cardOfQuestion, toInboxItem } from "@/lib/inbox"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, "Authentication required", 401)
    const step = request.nextUrl.searchParams.get("step")
    if (step !== null && !UUID.test(step)) return errorResponse(ErrorCodes.BAD_REQUEST, "step must be a card id", 400)

    const rows = (await sql`
      SELECT id, title, unlock_prompt, created_by, assigned_to, created_at, input
      FROM agent_jobs
      WHERE status = 'awaiting-unlock' AND created_by = ${auth.userId}
        AND (${step}::uuid IS NULL OR parent_step_id = ${step}::uuid
             OR id IN (SELECT question_id FROM step_blockers WHERE step_id = ${step}::uuid AND resolved_at IS NULL AND question_id IS NOT NULL))
      ORDER BY created_at DESC
      LIMIT 200
    `) as Record<string, any>[]
    const base = rows.map((r) => toInboxItem(r, {}))

    // The card each question holds up: the one it was asked about, else the blocked card that names it.
    const named = base.length
      ? ((await sql`
          SELECT question_id, step_id FROM step_blockers
          WHERE resolved_at IS NULL AND question_id = ANY(${base.map((i) => i.id)}::uuid[])
        `) as { question_id: string; step_id: string }[])
      : []
    const namedBy = Object.fromEntries(named.map((n) => [n.question_id, n.step_id]))
    const cardIds = Object.fromEntries(base.map((i) => [i.id, cardOfQuestion(i.stepId, namedBy[i.id])]))
    const wanted = Array.from(new Set(Object.values(cardIds).filter((c): c is string => !!c && UUID.test(c))))
    // Only cards in projects the caller can open: a title is never shown from a project he cannot see.
    const cards = wanted.length
      ? ((await sql`
          SELECT s.id, s.title, s.project_id FROM project_steps s
          JOIN projects p ON p.id = s.project_id AND p.deleted_at IS NULL
          WHERE s.id = ANY(${wanted}::uuid[]) AND s.deleted_at IS NULL
            AND (p.user_id = ${auth.userId} OR EXISTS (
                  SELECT 1 FROM project_collaborators c WHERE c.project_id = p.id AND c.user_id = ${auth.userId}
                     AND c.removed_at IS NULL AND c.accepted_at IS NOT NULL))
        `) as { id: string; title: string; project_id: string }[])
      : []
    const cardById = Object.fromEntries(cards.map((c) => [c.id, c]))

    const projectIds = Array.from(new Set(
      base.map((i) => i.projectId ?? cardById[cardIds[i.id] ?? ""]?.project_id ?? null).filter(Boolean) as string[]
    ))
    const projects = projectIds.length
      ? ((await sql`
          SELECT id, name FROM projects
          WHERE user_id = ${auth.userId} AND id = ANY(${projectIds}::uuid[]) AND deleted_at IS NULL
        `) as { id: string; name: string }[])
      : []
    const names = Object.fromEntries(projects.map((p) => [p.id, p.name]))

    // Pictures an agent sent with a question: private files, shown through links that last an hour.
    const { getSignedDownloadUrl, isR2Configured } = await import("@/lib/storage/r2-client")
    const canLink = isR2Configured()
    const items = await Promise.all(rows.map(async (r) => {
      const kept = storedPictures(r.input).filter((p) => p.key.startsWith(`inbox/${auth.userId}/`))
      const pictures = await Promise.all(kept.map(async (p) => ({ url: canLink ? await getSignedDownloadUrl(p.key, 3600).catch(() => null) : null, caption: p.caption, option: p.option ?? null, current: !!p.current })))
      const item = toInboxItem(r, names)
      const card = cardById[cardIds[item.id] ?? ""] ?? null
      // A question asked about no card keeps exactly what it had. One a blocked card names takes that card's project when it gave none.
      if (!card) return { ...item, cardTitle: null, pictures }
      const projectId = item.projectId ?? card.project_id
      return { ...item, stepId: card.id, cardTitle: card.title, projectId, projectName: item.projectName ?? names[projectId] ?? null, pictures }
    }))
    return successResponse(items, { total: items.length, page: 1, limit: 200 })
  } catch (error: unknown) {
    console.error("GET /api/inbox failed:", error)
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Failed to load inbox", 500)
  }
}
