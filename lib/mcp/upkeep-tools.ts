/**
 * Upkeep tools (card c28cb7e1 parts 4 and 5): checks a platform agent, or any agent, runs over the planner's own
 * data. They move nothing by themselves; what needs the owner becomes one question per project in his inbox.
 *
 *   upkeep_stale_check   cards in progress that have not moved, open twins with the same title, carried-over cards
 *                        nobody has reviewed. Rules in lib/upkeep/stale-check.ts (pure, asserted).
 *   upkeep_runs          what each earlier run checked, found and asked, so its usefulness can be counted.
 *
 * Every run is recorded in upkeep_runs (migration 081). Each tool is classified in lib/agents/risk.ts.
 */
import { z } from "zod"
import { sql } from "@/lib/db/client"
import { getMcpUserId, requireMcpScope } from "@/lib/auth/mcp-context"
import { IDLE_DAYS, UNREVIEWED_DAYS } from "@/lib/upkeep/stale-check"
import { runStaleCheck } from "@/lib/upkeep/run-stale-check"

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true }
}
const reason = (e: unknown) => (e instanceof Error ? e.message : "Unknown error")
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function registerUpkeepTools(server: any): void {
  server.tool(
    "upkeep_stale_check",
    `The stale-task check over your projects: cards in progress that have not moved in ${IDLE_DAYS} days (an agent puts these back to Up next with a note; never a question), open cards with the same title in one project (the owner's to merge: with ask=true, one question per project in his inbox, never twice while one is open), and cards carried over from the old todo list, ${UNREVIEWED_DAYS}+ days old, that nobody has written on (counted, for an agent to sort). Moves nothing. Every run is recorded (upkeep_runs).`,
    {
      projectId: z.string().optional().describe("Only this project"),
      ask: z.boolean().optional().describe("Put what is the owner's to decide into his inbox (default false: report only)"),
      by: z.string().max(120).optional().describe("Your agent name, kept on the run record"),
    },
    async ({ projectId, ask, by }: { projectId?: string; ask?: boolean; by?: string }) => {
      try {
        const userId = getMcpUserId()
        if (projectId && !UUID.test(projectId)) return fail("projectId must be a project id")
        if (ask) requireMcpScope("write")
        return ok(await runStaleCheck({ userId, projectId, ask, by }))
      } catch (e) {
        return fail(reason(e))
      }
    }
  )

  server.tool(
    "upkeep_runs",
    "What earlier upkeep runs checked, found and asked, newest first: the record that says whether a check is worth running.",
    {
      kind: z.string().max(40).optional().describe("Only this kind, e.g. stale_check"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ kind, limit }: { kind?: string; limit?: number }) => {
      try {
        const userId = getMcpUserId()
        const rows = (await sql`
          SELECT id, kind, project_id, ran_by, ran_at, checked, found - 'findings' AS counts, asked
            FROM upkeep_runs
           WHERE user_id = ${userId} AND (${kind ?? null}::text IS NULL OR kind = ${kind ?? null})
           ORDER BY ran_at DESC
           LIMIT ${limit ?? 10}
        `) as Record<string, unknown>[]
        return ok({ runs: rows })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )
}
