/*
 * Risk class of every planner MCP tool, in code (control layer, 2026-10-17).
 *
 * The in-app agents' allowlists (registry.ts) say what an agent is OFFERED.
 * This file says what an agent may EVER be offered, whatever an allowlist says:
 * money-domain, destructive and worker-only tools are removed by
 * enforceRisk() even if someone adds them to an allowlist by mistake.
 *
 * Classes come from lib/ade/ui/control.ts (read | edit-draft | commit |
 * destructive | money). The planner has no draft layer yet, so every live
 * write is class "commit". `directOk` marks the few low-risk, reversible
 * writes that may stay direct once draft-first change sets exist; every other
 * "commit" tool is meant to become a proposal (see ~/briefs/planner-ade-2026-10-18.md,
 * slice S3). `domain` keeps finance and worker plumbing out of the in-app chat.
 *
 * Pure: no DB, no MCP import. Asserted by risk.assert.ts, which also checks
 * that every tool registered in lib/mcp/planner-tools.ts is classified here.
 */

import { riskOfTool, type ToolRiskInput, type RiskClass } from "../ade/ui/control"

export interface PlannerToolMeta extends ToolRiskInput {
  /** A reversible, low-risk live write that may stay direct once change sets exist. */
  directOk?: true
  /** Where the tool belongs. Finance and worker tools never reach the in-app chat. */
  domain?: "finance" | "worker" | "admin"
}

const R: PlannerToolMeta = { effect: "read" }
const W: PlannerToolMeta = { effect: "write" }
const WD: PlannerToolMeta = { effect: "write", directOk: true }
const WORKER_W: PlannerToolMeta = { effect: "write", domain: "worker" }
const FIN_R: PlannerToolMeta = { effect: "read", domain: "finance" }

export const PLANNER_TOOL_RISK: Readonly<Record<string, PlannerToolMeta>> = {
  // ── reads ──
  analyze_impact: R, audit_5wh: R, catalog_get: R, catalog_get_dependents: R, catalog_list: R, catalog_search: R,
  find_attempts: R, find_related: R, get_5wh: R, get_active_project: R, get_agenda: R, get_answer: R, get_dashboard: R,
  get_execution_plan: R, get_idea: R, get_knowledge_graph: R, get_project_context: R, get_project_tasks: R,
  global_search: R, library_get: R, library_list_protocols: R, library_list_skills: R, library_list_templates: R,
  library_search: R, list_agent_jobs: R, list_agents: R, list_awaiting_unlocks: R, list_collaborators: R,
  list_decisions: R, list_document_versions: R, list_documents: R, list_ideas: R, list_phases: R, list_projects: R,
  list_sources_for_job: R, list_sources_for_step: R, list_stale_surfaces: R, list_todos: R, list_workers: R,
  catch_me_up: R, my_work: R, show_unit: R, planner_agent_guide: R, project_workload: R, read_document: R, resolve_workspace: R, search_chats: R, search_memory: R,

  // ── finance (money domain): never in the in-app chat ──
  get_finance_summary: FIN_R, list_accounts: FIN_R, list_transactions: FIN_R,
  create_transaction: { effect: "write", money: true, domain: "finance" },

  // ── destructive / overwriting ──
  delete_todo: { effect: "irreversible" },
  restore_document_version: { effect: "irreversible" },

  // ── low-risk reversible writes (may stay direct once change sets exist) ──
  toggle_todo: WD, add_progress_note: WD,

  // ── live writes to plan data (become proposals in slice S3) ──
  add_decision_node: W, add_idea_facet: W, add_task_comment: W, assign_task: W, compose_work_order: W,
  create_agent_job: W, create_decision: W, create_document: W, create_event: W, create_idea: W, create_project: W,
  create_source: W, create_task: W, create_todo: W, declare_dependency: W, entity_link: W,
  library_create_protocol: W, library_create_skill: W, library_create_template: W, mark_stale: W, promote_idea: W,
  register_surface: W, reorder_todos: W, score_prompt: W, score_template: W, transition_phase: W, update_document: W,
  update_idea: W, update_project: W, update_task: W, update_todo: W, catalog_scan_now: W, record_attempt: W,
  record_mlp_attempt: W, record_prompt_fire: W, record_spec_outcome: W, work_order_check_in: W, work_order_claim_step: W,

  // ── owner/admin controls (spend limits): never in the in-app chat; resetting a limit removes a guard ──
  get_ai_limits: { effect: "read", domain: "admin" },
  reset_ai_limits: { effect: "irreversible", domain: "admin" },

  // ── worker / plumbing / caller-scoped: never in the in-app chat ──
  claim_job: WORKER_W, heartbeat_worker: WORKER_W, register_worker: WORKER_W, request_unlock: WORKER_W,
  resolve_unlock: WORKER_W, update_job_status: WORKER_W, set_active_project: WORKER_W, register_workspace: WORKER_W,
  ask_owner: WORKER_W,
}

/** Class of a tool for one call. Unknown tools are treated as destructive: not offered until classified. */
export function riskOfPlannerTool(name: string, input?: unknown): RiskClass {
  const meta = PLANNER_TOOL_RISK[name]
  return meta ? riskOfTool(meta, input) : "destructive"
}

/** True when a tool may be offered to the in-app agent chat at all, whatever its allowlist says. */
export function inAppEligible(name: string): boolean {
  const meta = PLANNER_TOOL_RISK[name]
  if (!meta) return false
  if (meta.domain) return false
  const risk = riskOfTool(meta)
  return risk !== "money" && risk !== "destructive"
}

/** Removes anything the in-app chat must never offer. Pure; keeps order. */
export function enforceRisk(names: readonly string[]): string[] {
  return names.filter(inAppEligible)
}

/** Names removed by enforceRisk, for logging. */
export function blockedByRisk(names: readonly string[]): string[] {
  return names.filter((n) => !inAppEligible(n))
}
