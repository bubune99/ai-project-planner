/**
 * Work Order Composer — lib/work-orders/compose.ts
 *
 * Exports:
 *   composeFromSpecs    — pure function, no DB (re-exported from compose-pure.ts)
 *   composeFromTemplate — DB-hydrated composition from a feature_template row
 *
 * Algorithm: Kahn's BFS topo-sort.
 *   Edges: step A depends on step B if:
 *     (a) B's title is in A.prerequisites[] (case-insensitive), OR
 *     (b) B.provides[] has overlap with A.requires[] (tag matching)
 *   Cycle detection via residual in-degree after Kahn's pass.
 *   level = max(level of direct prereqs) + 1.
 *   parallel_group = level (same level → concurrent execution OK).
 *   step_order = topological position (level-major, original-order tiebreak).
 */

import { sql } from '@/lib/db/client'
export { composeFromSpecs } from './compose-pure'
export type { StepSpec, ComposedStep, ComposedPlan } from './compose-pure'
import type { ComposedPlan, StepSpec } from './compose-pure'
import { composeFromSpecs } from './compose-pure'

// ============================================================================
// composeFromTemplate — DB-dependent
// ============================================================================

/**
 * Hydrate a ComposedPlan from a feature_template row.
 *
 * Template steps JSONB shape (migration 043):
 *   [{ order?, title, skill_ref?, acceptance?, instructions?,
 *      prerequisites?, provides?, requires?, required_capabilities?, step_type? }]
 *
 * skill_ref is the skill name slug. We resolve it to the latest active version
 * for the requesting user and merge the skill body into step instructions.
 */
export async function composeFromTemplate(
  templateId: string,
  userId: string
): Promise<ComposedPlan> {
  const templateRows = await sql`
    SELECT id, title, name, steps, required_skills, insertion_strategy, parallelism_hint
    FROM feature_templates
    WHERE id = ${templateId}
      AND deleted_at IS NULL
      AND (user_id = ${userId} OR visibility IN ('public'))
  `

  if (templateRows.length === 0) {
    throw new Error(`feature_template ${templateId} not found or not accessible`)
  }

  const template = templateRows[0]
  type RawStep = {
    order?: number
    title: string
    skill_ref?: string
    acceptance?: string[]
    instructions?: string
    default_prompts?: unknown[]
    prerequisites?: string[]
    provides?: string[]
    requires?: string[]
    required_capabilities?: string[]
    step_type?: string
  }
  const rawSteps: RawStep[] = Array.isArray(template.steps) ? (template.steps as RawStep[]) : []

  if (rawSteps.length === 0) {
    return {
      steps: [],
      max_parallelism: 0,
      cycles_detected: false,
      warnings: [`Template "${template.title}" has no steps defined`],
    }
  }

  // Gather unique skill refs and resolve to latest active version
  const skillRefs = [...new Set(
    rawSteps.map(s => s.skill_ref).filter((r): r is string => Boolean(r))
  )]

  type SkillRecord = { id: string; version: number; body: string; provides: string[] }
  const skillMap = new Map<string, SkillRecord>()

  if (skillRefs.length > 0) {
    const skillRows = await sql`
      SELECT DISTINCT ON (name) id, name, version, body, provides
      FROM skills
      WHERE name = ANY(${skillRefs})
        AND status = 'active'
        AND deleted_at IS NULL
        AND (user_id = ${userId} OR visibility IN ('public'))
      ORDER BY name, version DESC
    `
    for (const row of skillRows) {
      skillMap.set(row.name as string, {
        id: row.id as string,
        version: row.version as number,
        body: (row.body as string) ?? '',
        provides: (row.provides as string[]) ?? [],
      })
    }
  }

  // Sort raw steps by declared order
  const sorted = [...rawSteps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const specs: StepSpec[] = sorted.map(raw => {
    const skill = raw.skill_ref ? skillMap.get(raw.skill_ref) : undefined
    return {
      title: raw.title,
      step_type: (raw.step_type as StepSpec['step_type']) ?? 'task',
      source_skill_id: skill?.id,
      source_skill_version: skill?.version,
      prerequisites: raw.prerequisites ?? [],
      provides: raw.provides ?? (skill?.provides ?? []),
      requires: raw.requires ?? [],
      required_capabilities: raw.required_capabilities ?? [],
      instructions: raw.instructions ?? (skill?.body || undefined),
      acceptance_criteria: raw.acceptance ?? [],
    }
  })

  const plan = composeFromSpecs(specs)

  // Warn for unresolved skill refs
  const missing = skillRefs.filter(r => !skillMap.has(r))
  if (missing.length > 0) {
    plan.warnings.push(
      `Skills not resolved (no active version found for user): ${missing.join(', ')}`
    )
  }

  return plan
}
