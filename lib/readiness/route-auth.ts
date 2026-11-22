/**
 * The gate every readiness route passes first: signed in (or a valid API
 * key), and allowed on this project. Reading needs read access to the
 * project; writing needs write access (owner, or an editor or admin
 * collaborator), the same helpers the sibling routes under
 * app/api/projects/[id]/ use.
 *
 * Who is acting decides whether a pass is stored or only proposed: see
 * whoIsActing in input.ts.
 */
import { type NextResponse } from "next/server"
import { ErrorCodes, errorResponse } from "@/lib/api-utils"
import { getAuthContext, verifyProjectOwnerOnly, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { whoIsActing, type Source } from "./input"

type Acting = ReturnType<typeof whoIsActing>
type Gate = { ok: true; acting: (o?: { saysAgent?: boolean; source?: Source }) => Acting } | { ok: false; response: NextResponse }

/**
 * Auth and access, before the request body is read. `acting` is then called
 * with what the body says (agent: true), since that can only lower what the
 * caller may do, never raise it.
 */
export async function readinessAuth(projectId: string, need: "read" | "write"): Promise<Gate> {
  const auth = await getAuthContext()
  if (!auth) return { ok: false, response: errorResponse(ErrorCodes.UNAUTHORIZED, "Sign in, or send an API key", 401) }
  const allowed = need === "write" ? await verifyProjectWriteAccess(projectId, auth.userId) : await verifyProjectOwnership(projectId, auth.userId)
  // 404, not 403: someone without access is not told the project exists.
  if (!allowed) return { ok: false, response: errorResponse(ErrorCodes.NOT_FOUND, "Project not found", 404) }
  const isOwner = await verifyProjectOwnerOnly(projectId, auth.userId)
  return { ok: true, acting: (o = {}) => whoIsActing(auth, { isOwner, saysAgent: o.saysAgent === true, source: o.source }) }
}

export const serverError = (where: string, error: unknown) => {
  console.error(`[readiness] ${where}:`, error)
  return errorResponse(ErrorCodes.INTERNAL_ERROR, "Something went wrong", 500)
}
