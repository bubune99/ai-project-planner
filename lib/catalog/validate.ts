/**
 * Validation router — Idea H Tier 3.
 *
 * Given a set of surfaces being changed, returns the validation contracts
 * the agent MUST run (and SHOULD run) before declaring completion.
 *
 * IMPORTANT: this module does NOT invoke validators. Truth Seeker MCP tools
 * are agent-callable, so the agent invokes them and reports results back via
 * `work_order_check_in('completion', validation_results)`. This module:
 *
 *   1. Looks up applicable contracts for each affected surface
 *   2. Resolves `invoke_args_template` placeholders against the surface row
 *   3. Returns the list of validators to run + how to call each
 *
 * Why this design (not direct invocation):
 *   - The planner is an MCP server; calling another MCP server (Truth Seeker)
 *     from inside one requires MCP-to-MCP plumbing we don't have
 *   - The agent already has Truth Seeker available in its own toolbelt
 *   - This keeps the contract explicit ("you must run these"); the agent
 *     proves it by including validation_results in the next check-in
 *
 * See memory: idea-h-catalog-first (Tier 3 section)
 */

import { sql } from "@/lib/db/client"
import type {
  Surface,
  ValidationContract,
  ValidationTriggerEvent,
} from "./types"

// ============================================================================
// Public API
// ============================================================================

/**
 * One specific validation to run on one specific surface.
 * The agent receives an array of these from `analyze_impact`'s extension
 * or from a dedicated `list_required_validations` MCP tool.
 */
export interface RequiredValidation {
  contract_id: string
  surface_id: string
  surface_canonical_id: string
  surface_kind: string
  validator_tool: string                  // the MCP tool name to invoke
  required: boolean                       // true = block completion on failure
  trigger_event: ValidationTriggerEvent
  invoke_args: Record<string, unknown>    // template resolved against surface row
  description: string | null
}

/**
 * For a single change event (create | modify | delete) on a single surface,
 * return all validations that apply.
 *
 * @param surface  The surface row (already loaded from DB)
 * @param triggerEvent The lifecycle event happening to it
 * @param userId The user context (for picking up user-customized contracts)
 */
export async function getValidationsForChange(
  surface: Surface,
  triggerEvent: ValidationTriggerEvent,
  userId: string,
): Promise<RequiredValidation[]> {
  // Look up contracts that match: this surface_kind + (this trigger OR 'always') +
  // (this user's overrides OR system rows)
  const rows = (await sql`
    SELECT *
    FROM validation_contracts
    WHERE surface_kind = ${surface.kind}
      AND (trigger_event = ${triggerEvent} OR trigger_event = 'always')
      AND (user_id IS NULL OR user_id = ${userId}::uuid)
    ORDER BY user_id NULLS LAST, required DESC
  `) as unknown as ValidationContract[]

  // User-customized contracts win over system ones for the same (kind, tool, trigger)
  const seen = new Set<string>()
  const merged: ValidationContract[] = []
  for (const r of rows) {
    const key = `${r.surface_kind}|${r.validator_tool}|${r.trigger_event}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(r)
  }

  return merged.map((c) => ({
    contract_id: c.id,
    surface_id: surface.id,
    surface_canonical_id: surface.canonical_id,
    surface_kind: surface.kind,
    validator_tool: c.validator_tool,
    required: c.required,
    trigger_event: c.trigger_event,
    invoke_args: resolveTemplate(c.invoke_args_template, surface),
    description: c.description,
  }))
}

/**
 * For a list of surfaces all being changed in the same way (e.g. a work_order
 * completion produces a list of affected surfaces), aggregate their required
 * validations into a single, deduplicated list.
 */
export async function getValidationsForBatch(
  surfaces: Surface[],
  triggerEvent: ValidationTriggerEvent,
  userId: string,
): Promise<RequiredValidation[]> {
  const all: RequiredValidation[] = []
  for (const s of surfaces) {
    all.push(...(await getValidationsForChange(s, triggerEvent, userId)))
  }
  return all
}

/**
 * Given a list of required validations and the validation_results the agent
 * reports back, decide:
 *   - which validators passed
 *   - which failed
 *   - which were skipped
 *   - whether to ALLOW completion (no required failures + all required ran)
 *   - what to tell the agent if completion is blocked
 */
export interface ValidationResultsReport {
  validator_tool: string
  surface_canonical_id: string
  passed: boolean
  notes?: string
}

export interface GateDecision {
  allow_completion: boolean
  block_reason?: string
  required_total: number
  required_passed: number
  required_failed: number
  required_missing: number   // not in agent's report
  advisory_total: number
  advisory_passed: number
  advisory_failed: number
  next_actions: string[]
}

export function evaluateGate(
  required: RequiredValidation[],
  reportedResults: ValidationResultsReport[] | undefined | null,
): GateDecision {
  const requiredOnly = required.filter((r) => r.required)
  const advisoryOnly = required.filter((r) => !r.required)
  const results = reportedResults ?? []

  // Match by (validator_tool, surface_canonical_id)
  const resultIndex = new Map<string, ValidationResultsReport>()
  for (const r of results) {
    resultIndex.set(`${r.validator_tool}|${r.surface_canonical_id}`, r)
  }

  let requiredPassed = 0
  let requiredFailed = 0
  let requiredMissing = 0
  const failedDetails: string[] = []
  const missingDetails: string[] = []

  for (const v of requiredOnly) {
    const key = `${v.validator_tool}|${v.surface_canonical_id}`
    const reported = resultIndex.get(key)
    if (!reported) {
      requiredMissing++
      missingDetails.push(`${v.validator_tool} on ${v.surface_canonical_id}`)
      continue
    }
    if (reported.passed) requiredPassed++
    else {
      requiredFailed++
      failedDetails.push(`${v.validator_tool} on ${v.surface_canonical_id}${reported.notes ? `: ${reported.notes}` : ""}`)
    }
  }

  let advisoryPassed = 0
  let advisoryFailed = 0
  for (const v of advisoryOnly) {
    const key = `${v.validator_tool}|${v.surface_canonical_id}`
    const reported = resultIndex.get(key)
    if (!reported) continue
    if (reported.passed) advisoryPassed++
    else advisoryFailed++
  }

  const blocked = requiredFailed > 0 || requiredMissing > 0
  const decision: GateDecision = {
    allow_completion: !blocked,
    required_total: requiredOnly.length,
    required_passed: requiredPassed,
    required_failed: requiredFailed,
    required_missing: requiredMissing,
    advisory_total: advisoryOnly.length,
    advisory_passed: advisoryPassed,
    advisory_failed: advisoryFailed,
    next_actions: [],
  }

  if (blocked) {
    decision.block_reason = [
      requiredFailed > 0 ? `${requiredFailed} required validator(s) FAILED: ${failedDetails.join("; ")}` : "",
      requiredMissing > 0 ? `${requiredMissing} required validator(s) NOT RUN: ${missingDetails.join("; ")}` : "",
    ].filter(Boolean).join(" | ")

    if (requiredMissing > 0) {
      decision.next_actions.push(
        `Run the missing validator(s): ${missingDetails.join(", ")}. Then call work_order_check_in('completion', { validation_results: [...] }) again.`
      )
    }
    if (requiredFailed > 0) {
      decision.next_actions.push(
        `Fix the failed validator(s): ${failedDetails.join(", ")}. Then re-attempt completion.`
      )
    }
    decision.next_actions.push(
      `Optionally: call record_attempt to capture the failure for prior-art lookup.`
    )
  } else if (advisoryFailed > 0) {
    decision.next_actions.push(
      `Completion allowed. ${advisoryFailed} advisory validator(s) failed (non-blocking) — consider opening a follow-up.`
    )
  } else {
    decision.next_actions.push(
      `Completion allowed. All ${requiredPassed}/${requiredOnly.length} required validators passed.`
    )
  }

  return decision
}

// ============================================================================
// Template resolution
// ============================================================================

/**
 * Resolve "$signature.x.y" and "$location.x" placeholders in invoke_args_template
 * against the actual surface row's signature + location JSONB.
 */
function resolveTemplate(
  template: Record<string, unknown>,
  surface: Surface,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(template)) {
    resolved[k] = resolveValue(v, surface)
  }
  return resolved
}

function resolveValue(value: unknown, surface: Surface): unknown {
  if (typeof value === "string") {
    // Resolve $signature.x.y and $location.x patterns
    return value.replace(/\$(signature|location)\.([\w.]+)/g, (_, source, path) => {
      const root = source === "signature" ? surface.signature : surface.location
      const resolved = resolveJsonPath(root as Record<string, unknown>, path)
      return resolved === undefined ? "" : String(resolved)
    })
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveValue(v, surface))
  }
  if (value && typeof value === "object") {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      obj[k] = resolveValue(v, surface)
    }
    return obj
  }
  return value
}

function resolveJsonPath(root: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".")
  let cur: unknown = root
  for (const p of parts) {
    if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p]
    } else {
      return undefined
    }
  }
  return cur
}
