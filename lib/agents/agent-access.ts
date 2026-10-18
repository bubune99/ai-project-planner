import { AGENTS, DEFAULT_AGENT_ID, type AgentId } from "./catalog"
import { platformAdminIds } from "@/lib/auth/platform-admin"

/**
 * Which agents a person may pick. The platform owner sees all three; everyone
 * else (siblings, editors) sees JARVIS only, who hands off to the specialists
 * itself. Fails open while PLANNER_ADMIN_USER_IDS is unset, so turning this on
 * is one env var and nothing changes until then.
 */
export function allowedAgentIds(
  userId: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): AgentId[] {
  const admins = platformAdminIds(env)
  if (admins.size === 0 || (userId && admins.has(userId))) return AGENTS.map((a) => a.id)
  return [DEFAULT_AGENT_ID]
}
