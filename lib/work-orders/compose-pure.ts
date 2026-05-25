/**
 * Pure topo-sort composer — no DB imports.
 * Extracted so tests can run without Next.js / @/lib/db/client.
 *
 * compose.ts re-exports everything from here and adds the DB-dependent
 * composeFromTemplate on top.
 */

// ============================================================================
// Types
// ============================================================================

export type StepSpec = {
  title: string
  description?: string
  step_type?: 'task' | 'checkpoint' | 'gate' | 'protocol_check' | 'verification'
  source_skill_id?: string
  source_skill_version?: number
  prerequisites?: string[]
  provides?: string[]
  requires?: string[]
  instructions?: string
  acceptance_criteria?: string[]
  step_references?: Array<{ kind: string; id: string; label?: string; url?: string }>
  expected_artifacts?: string[]
  required_capabilities?: string[]
}

export type ComposedStep = StepSpec & {
  step_order: number
  level: number
  parallel_group: number | null
  prerequisite_indices: number[]
}

export type ComposedPlan = {
  steps: ComposedStep[]
  max_parallelism: number
  cycles_detected: boolean
  warnings: string[]
}

// ============================================================================
// Core: composeFromSpecs
// ============================================================================

export function composeFromSpecs(specs: StepSpec[]): ComposedPlan {
  const warnings: string[] = []

  if (specs.length === 0) {
    return { steps: [], max_parallelism: 0, cycles_detected: false, warnings }
  }

  const n = specs.length

  // Build adjacency (predecessor) list
  const predecessorOf: Set<number>[] = Array.from({ length: n }, () => new Set<number>())

  for (let i = 0; i < n; i++) {
    const spec = specs[i]
    const prereqTitles = (spec.prerequisites ?? []).map(p => p.toLowerCase().trim())
    const requiresTags = new Set(spec.requires ?? [])

    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const candidate = specs[j]

      // (a) title match
      if (prereqTitles.includes(candidate.title.toLowerCase().trim())) {
        predecessorOf[i].add(j)
        continue
      }

      // (b) provides/requires tag intersection
      const candidateProvides = candidate.provides ?? []
      if (candidateProvides.some(tag => requiresTags.has(tag))) {
        predecessorOf[i].add(j)
      }
    }
  }

  // Kahn's BFS topo-sort
  const inDegree = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    inDegree[i] = predecessorOf[i].size
  }

  const successorOf: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (const dep of predecessorOf[i]) {
      successorOf[dep].push(i)
    }
  }

  const queue: number[] = []
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i)
  }

  const level = new Array(n).fill(0)
  const topoOrder: number[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    topoOrder.push(current)
    for (const successor of successorOf[current]) {
      inDegree[successor]--
      level[successor] = Math.max(level[successor], level[current] + 1)
      if (inDegree[successor] === 0) {
        queue.push(successor)
      }
    }
  }

  // Cycle detection
  let cyclesDetected = false
  if (topoOrder.length < n) {
    cyclesDetected = true
    const stuck: string[] = []
    for (let i = 0; i < n; i++) {
      if (!topoOrder.includes(i)) {
        stuck.push(`"${specs[i].title}"`)
        topoOrder.push(i)
      }
    }
    warnings.push(
      `Cycle detected among steps: ${stuck.join(', ')}. These steps have been appended after all acyclic steps.`
    )
  }

  // Sort level-major, original-order tiebreak
  topoOrder.sort((a, b) => {
    const d = level[a] - level[b]
    return d !== 0 ? d : a - b
  })

  const steps: ComposedStep[] = topoOrder.map((originalIdx, orderPos) => {
    const spec = specs[originalIdx]
    return {
      ...spec,
      step_order: orderPos,
      level: level[originalIdx],
      parallel_group: level[originalIdx],
      prerequisite_indices: Array.from(predecessorOf[originalIdx]).sort(),
      prerequisites: spec.prerequisites ?? [],
      provides: spec.provides ?? [],
      requires: spec.requires ?? [],
      acceptance_criteria: spec.acceptance_criteria ?? [],
      step_references: spec.step_references ?? [],
      expected_artifacts: spec.expected_artifacts ?? [],
      required_capabilities: spec.required_capabilities ?? [],
      step_type: spec.step_type ?? 'task',
    }
  })

  const levelCounts = new Map<number, number>()
  for (const s of steps) {
    levelCounts.set(s.level, (levelCounts.get(s.level) ?? 0) + 1)
  }
  const maxParallelism = steps.length === 0 ? 0 : Math.max(...levelCounts.values())

  return { steps, max_parallelism: maxParallelism, cycles_detected: cyclesDetected, warnings }
}
