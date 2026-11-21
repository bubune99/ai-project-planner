/**
 * Direction tools: before acting on a decision, an agent reads how the owner wants that kind of decision made, and
 * records the build decisions it proposes or takes. Rules: lib/direction/direction-model.ts; SQL: lib/direction/store.ts.
 * Agents use the owner's API key but are always recorded as agents here, and may never set a mode or answer.
 *
 * Wire-up: registerDirectionTools(server) in registerPlannerTools.
 */
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getMcpUserId, requireMcpProjectWriteAccess, requireMcpScope, verifyMcpProjectAccess } from "@/lib/auth/mcp-context"
import { KINDS, guidanceFor, propose, tree, waitingCount } from "@/lib/direction/direction-model"
import { editDirection, loadDirection } from "@/lib/direction/store"

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] })
const fail = (message: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true })
const reason = (e: unknown) => (e instanceof Error ? e.message : "Unknown error")
const kindIds = KINDS.map((k) => k.id) as [string, ...string[]]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerDirectionTools(server: any): void {
  server.tool(
    "direction_for",
    "How the owner wants a kind of decision made on this project, before you act on it: the mode (ai: go ahead; tell: go ahead and record it; ask: do not act, record it and take the next card), what the AI would do by best practice, the owner's direction for it, and his earlier answers on the same kind. Without kindId: the whole tree, with the decisions waiting on him.",
    { projectId: z.string(), kindId: z.enum(kindIds).optional().describe("The kind of decision, e.g. stack.library, data.migration.prod, design.redesign") },
    async ({ projectId, kindId }: { projectId: string; kindId?: string }) => {
      try {
        requireMcpScope("read")
        if (!(await verifyMcpProjectAccess(projectId)).hasAccess) return fail("Project not found or access denied")
        const { doc } = await loadDirection(projectId)
        if (kindId) return ok(guidanceFor(doc, kindId))
        return ok({
          areas: tree(doc).map((a) => ({ area: a.area, title: a.title, kinds: a.kinds.map((k) => ({ id: k.id, title: k.title, mode: k.mode, ...(k.note ? { ownerDirection: k.note } : {}) })) })),
          waiting: doc.upcoming.filter((u) => u.status === "waiting").map((u) => ({ id: u.id, kindId: u.kindId, title: u.title })),
          waitingCount: waitingCount(doc),
        })
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "direction_propose",
    "Record a build decision in the project's Direction tab: the path you want to take, why, and the other ways considered. If the owner set that kind to ask, it waits for his approve or redirect (mark your card waiting and take the next one); otherwise it is recorded as decided by the AI. Read direction_for first.",
    {
      projectId: z.string(), kindId: z.enum(kindIds), title: z.string().min(3).max(200),
      aiPath: z.string().min(3).max(2000).describe("What you would do"), why: z.string().max(1000).optional(),
      alternatives: z.array(z.string().max(300)).max(6).optional(),
      agent: z.string().max(80).optional().describe("Your agent name"),
    },
    async (a: { projectId: string; kindId: string; title: string; aiPath: string; why?: string; alternatives?: string[]; agent?: string }) => {
      try {
        requireMcpScope("write")
        await requireMcpProjectWriteAccess(a.projectId)
        const id = randomUUID()
        const { result, version } = await editDirection({
          projectId: a.projectId, userId: getMcpUserId(), actor: "agent",
          edit: (doc) => {
            const p = propose(doc, { id, kindId: a.kindId, title: a.title, aiPath: a.aiPath, why: [a.why, a.agent ? `(${a.agent})` : ""].filter(Boolean).join(" "), alternatives: a.alternatives, at: new Date().toISOString() })
            return { doc: p.doc, result: p.entry }
          },
        })
        return ok({
          ...result, version,
          next_actions: result.status === "waiting"
            ? ["It waits in the owner's Direction tab. Mark the card waiting on it and take the next card; check direction_for later for his answer."]
            : ["Recorded as decided. Carry on."],
        })
      } catch (e) { return fail(reason(e)) }
    },
  )
}
