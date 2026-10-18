/*
 * Who may write, as data (role safety for shared projects, 2026-10-18).
 *
 * Two pure pieces, no database:
 *  - WRITE_TOOL_SCOPE: for every write-class planner tool, whether its rows
 *    belong to the caller alone ("personal") or to a project that other people
 *    share ("project-role-checked": the handler refuses a viewer). Asserted
 *    against lib/mcp/planner-tools.ts by access.assert.ts, so a new write tool
 *    cannot ship without a decision here.
 *  - scopesForRole / toolsAllowedForRole: what the in-app agent may be given
 *    for a person's role on the open project. A viewer gets a read-only agent.
 *
 * Roles are owner | admin | editor | viewer. `null` means a project was named
 * but no usable role came back (no access, or the lookup failed): treated as
 * read-only, so a failed lookup never widens anything.
 */

import { riskOfPlannerTool } from "./risk"

export type ProjectRole = "owner" | "admin" | "editor" | "viewer"
export type AgentScope = "read" | "write"

export type WriteScope = "personal" | "project-role-checked"

export const WRITE_TOOL_SCOPE: Readonly<Record<string, WriteScope>> = {
  // ── project-role-checked: the handler refuses a viewer ──
  add_decision_node: "project-role-checked", // decision row's project_id is read; viewer refused
  add_progress_note: "project-role-checked", // requireMcpProjectWriteAccess
  add_task_comment: "project-role-checked", // requireMcpProjectWriteAccess
  ask_owner: "project-role-checked", // requireMcpProjectWriteAccess on the project it is about
  assign_task: "project-role-checked", // requireMcpProjectWriteAccess
  compose_work_order: "project-role-checked", // verifyMcpProjectAccess + canWrite
  create_agent_job: "project-role-checked", // projectId given: canWrite or role check (closed 2026-10-18)
  create_decision: "project-role-checked", // projectId given: canWrite (closed 2026-10-18)
  create_document: "project-role-checked", // requireMcpProjectWriteAccess
  create_event: "project-role-checked", // projectId given: role check (closed 2026-10-18, was unchecked)
  create_source: "project-role-checked", // sourceParentAccessError(..., needWrite) checks canWrite on the step's project
  create_task: "project-role-checked", // requireMcpProjectWriteAccess
  create_todo: "project-role-checked", // projectId given: canWrite (closed 2026-10-18)
  library_create_protocol: "project-role-checked", // projectId given: role check (closed 2026-10-18, was unchecked)
  library_create_skill: "project-role-checked", // projectId given: role check (closed 2026-10-18, was unchecked)
  library_create_template: "project-role-checked", // projectId given: role check (closed 2026-10-18, was unchecked)
  record_attempt: "project-role-checked", // projectId given: role check (closed 2026-10-18, was unchecked)
  record_mlp_attempt: "project-role-checked", // decision row's project_id is read; viewer refused
  register_surface: "project-role-checked", // project_id given: role check (closed 2026-10-18, was unchecked)
  register_workspace: "project-role-checked", // updateProjectWorkspace checks canWrite inside lib/auth/mcp-context.ts
  restore_document_version: "project-role-checked", // requireMcpProjectWriteAccess
  transition_phase: "project-role-checked", // requireMcpProjectWriteAccess
  update_document: "project-role-checked", // requireMcpProjectWriteAccess
  update_project: "project-role-checked", // requireMcpProjectWriteAccess
  update_task: "project-role-checked", // requireMcpProjectWriteAccess
  update_todo: "project-role-checked", // linking to a project: canWrite; an already-linked todo: viewer refused
  work_order_check_in: "project-role-checked", // work order's project_id is read; viewer refused
  work_order_claim_step: "project-role-checked", // work order's project_id is read; viewer refused

  // ── personal: every statement is scoped to the caller's own rows ──
  add_idea_facet: "personal", // idea must have user_id = caller
  catalog_scan_now: "personal", // surfaces and dependencies written under user_id = caller
  claim_job: "personal", // job.created_by must be the caller
  create_idea: "personal", // ideas are per user; no project id accepted
  create_project: "personal", // new project owned by the caller
  create_transaction: "personal", // finance account must be the caller's; money domain, never in the in-app chat
  declare_dependency: "personal", // both surfaces must have user_id = caller
  delete_todo: "personal", // todo must have user_id = caller (soft delete)
  entity_link: "personal", // relation row keyed by user_id; links are the caller's graph
  heartbeat_worker: "personal", // worker must belong to the caller
  mark_stale: "personal", // surface must have user_id = caller
  promote_idea: "personal", // idea must have user_id = caller; creates a project the caller owns
  record_prompt_fire: "personal", // prompt is the caller's or public; fire row has user_id = caller
  record_spec_outcome: "personal", // spec source must have user_id = caller
  register_worker: "personal", // worker registered under the caller's account only
  reorder_todos: "personal", // only todos with user_id = caller are reordered
  request_unlock: "personal", // job.created_by must be the caller
  reset_ai_limits: "personal", // platform-owner check; touches no project data; never in the in-app chat
  resolve_unlock: "personal", // job.created_by must be the caller
  score_prompt: "personal", // prompt must have user_id = caller
  score_template: "personal", // template is the caller's or public; writes the caller's own score
  set_active_project: "personal", // only moves the caller's own API key pointer after an access check
  toggle_todo: "personal", // todo must have user_id = caller
  update_idea: "personal", // idea must have user_id = caller
  update_job_status: "personal", // job.created_by must be the caller
}

/** Names of the tools whose handlers must refuse a viewer. */
export function projectScopedWriteTools(): string[] {
  return Object.entries(WRITE_TOOL_SCOPE)
    .filter(([, scope]) => scope === "project-role-checked")
    .map(([name]) => name)
}

/** What a role may do. `null` (project named, no usable role) is read-only: fail closed. */
export function scopesForRole(role: ProjectRole | null): AgentScope[] {
  if (role === "owner" || role === "admin" || role === "editor") return ["read", "write"]
  return ["read"]
}

/**
 * The only writes a viewer keeps: their own personal todos. A todo is the
 * caller's own row; the handlers still refuse to create or edit one that is
 * linked to a project the caller can only read (create_todo / update_todo).
 */
export const VIEWER_PERSONAL_TOOLS: readonly string[] = ["create_todo", "update_todo", "toggle_todo"]

/**
 * The tools a request may be offered for a role on its project. `role` is
 * `undefined` when the request has no project (nothing changes), a role when
 * one was resolved, or `null` when a project was named but no role came back.
 * Viewers and `null` keep tools whose risk class is "read", plus their own
 * personal todo tools; a tool that is not classified counts as not-read, so
 * it is dropped. The rule is per open project, not per person. Pure; keeps order.
 */
export function toolsAllowedForRole(names: readonly string[], role: ProjectRole | null | undefined): string[] {
  if (role === undefined) return [...names]
  if (scopesForRole(role).includes("write")) return [...names]
  return names.filter((n) => riskOfPlannerTool(n) === "read" || VIEWER_PERSONAL_TOOLS.includes(n))
}

/** Scopes an agent run gets: the agent's own, narrowed to what the offered tools actually need. */
export function scopesForTools(names: readonly string[], agentMayWrite: boolean): AgentScope[] {
  const needsWrite = names.some((n) => riskOfPlannerTool(n) !== "read")
  return agentMayWrite && needsWrite ? ["read", "write"] : ["read"]
}
