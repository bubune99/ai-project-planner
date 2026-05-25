/**
 * Catalog graph functions — Idea H Wave 1.
 *
 * Port of Memory-Agent's buildExportRelations (the 25-line reverse-dep gem,
 * module-relationship-analyzer.ts:662-685) and detectCircularDependencies
 * (619-657) — adapted for the planner's SurfaceDependency edge model.
 *
 * NET-NEW additions (MA doesn't have these):
 *   - findDependents: k-hop BFS over the reverse-dep map
 *   - calculateBlastRadius: confidence-weighted impact score
 *   - detectChangeConflicts: pairs of surfaces whose dependents overlap
 *
 * All pure functions — no DB calls, no side effects.
 * The caller fetches Surface + SurfaceDependency rows from the DB and passes
 * them in. Results are used to answer impact questions.
 *
 * Edge model note:
 *   SurfaceDependency uses surface_id UUIDs at the DB layer, but the graph
 *   functions here operate on canonical_ids (human-readable stable addresses).
 *   The caller must resolve UUIDs → canonical_ids before calling these functions.
 *   This keeps the graph layer pure and testable without a DB.
 */

import type { SurfaceDependency } from "./types"

// ============================================================================
// Ported from MA: buildExportRelations (the 25-line gem)
// Adapted: MA worked on module IDs; here we work on canonical_ids.
// ============================================================================

/**
 * Build a reverse-dependency (consumers) map.
 *
 * For each canonical_id that appears as a dependency target (to_canonical_id),
 * collect the set of canonical_ids that depend on it (from_canonical_id).
 *
 * Example:
 *   deps: [{ from: "route:GET /api/skills", to: "db:skills", kind: "reads_from" }]
 *   result: Map { "db:skills" → ["route:GET /api/skills"] }
 *
 * This is the data structure behind every "what breaks if I change X?" query.
 * O(n) in number of edges.
 */
export function buildConsumersMap(
  deps: ReadonlyArray<Pick<SurfaceDependency, "from_surface_id" | "to_surface_id">> |
       ReadonlyArray<{ from_canonical_id: string; to_canonical_id: string }>
): Map<string, string[]> {
  const map = new Map<string, string[]>()

  for (const dep of deps) {
    // Support both UUID-based (DB rows) and canonical_id-based (scan output)
    const from = "from_canonical_id" in dep ? dep.from_canonical_id : dep.from_surface_id
    const to = "to_canonical_id" in dep ? dep.to_canonical_id : dep.to_surface_id

    if (!map.has(to)) {
      map.set(to, [])
    }
    map.get(to)!.push(from)
  }

  return map
}

// ============================================================================
// Ported from MA: detectCircularDependencies (DFS-based cycle detection)
// Adapted: operates on canonical_ids; returns cycle paths instead of
// mutating edge records in place (pure function).
// ============================================================================

/**
 * Detect circular dependency chains in the surface graph.
 *
 * Uses depth-first search with a recursion stack (the classic algorithm).
 * Returns every distinct cycle found as an ordered list of canonical_ids.
 *
 * Edge direction: from → to (if A imports B, edge is A→B).
 * A cycle A→B→C→A means: A depends on B, B depends on C, C depends on A.
 *
 * O(V + E) where V = unique surface ids, E = number of dependency edges.
 */
export function detectCircularDependencies(
  deps: ReadonlyArray<Pick<SurfaceDependency, "from_surface_id" | "to_surface_id">> |
       ReadonlyArray<{ from_canonical_id: string; to_canonical_id: string }>
): Array<{ cycle: string[] }> {
  // Build adjacency list
  const graph = new Map<string, Set<string>>()

  for (const dep of deps) {
    const from = "from_canonical_id" in dep ? dep.from_canonical_id : dep.from_surface_id
    const to = "to_canonical_id" in dep ? dep.to_canonical_id : dep.to_surface_id

    if (!graph.has(from)) graph.set(from, new Set())
    graph.get(from)!.add(to)
  }

  const visited = new Set<string>()
  const recursionStack: string[] = []
  const recursionSet = new Set<string>()
  const cycles: Array<{ cycle: string[] }> = []
  // Track cycles already emitted (by their canonical string) to avoid duplicates
  const emittedCycles = new Set<string>()

  function dfs(node: string): void {
    visited.add(node)
    recursionStack.push(node)
    recursionSet.add(node)

    const neighbors = graph.get(node) ?? new Set<string>()
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor)
      } else if (recursionSet.has(neighbor)) {
        // Found a back edge — extract the cycle
        const cycleStart = recursionStack.indexOf(neighbor)
        if (cycleStart !== -1) {
          const cycle = recursionStack.slice(cycleStart)
          // Normalize: rotate so smallest element is first (canonical form)
          const normalizedCycle = normalizeCycle(cycle)
          const key = normalizedCycle.join("→")
          if (!emittedCycles.has(key)) {
            emittedCycles.add(key)
            cycles.push({ cycle: normalizedCycle })
          }
        }
      }
    }

    recursionStack.pop()
    recursionSet.delete(node)
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node)
    }
  }

  return cycles
}

/** Normalize a cycle: rotate so the lexicographically smallest element is first. */
function normalizeCycle(cycle: string[]): string[] {
  if (cycle.length === 0) return cycle
  let minIdx = 0
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[minIdx]) minIdx = i
  }
  return [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)]
}

// ============================================================================
// NET-NEW: findDependents — k-hop BFS
// ============================================================================

export interface DependentResult {
  /** The canonical_id of the surface that depends (transitively) on the start */
  surface_id: string
  /** The chain of intermediate surface_ids from start → this surface */
  via: string[]
  /** 1 = direct, 2 = one-hop away, etc. */
  distance: number
}

/**
 * Find all surfaces that depend on startSurfaceId within k hops.
 *
 * Uses BFS over the reverse-dependency (consumers) graph.
 * Distance 1 = direct consumers of startSurfaceId.
 * Distance 2 = consumers of consumers.
 * etc.
 *
 * Returns results sorted by distance ascending (closest first).
 *
 * Example use: "what surfaces would break if I change db:skills?"
 */
export function findDependents(
  startSurfaceId: string,
  deps: ReadonlyArray<Pick<SurfaceDependency, "from_surface_id" | "to_surface_id">> |
       ReadonlyArray<{ from_canonical_id: string; to_canonical_id: string }>,
  hops: 1 | 2 | 3 = 2
): DependentResult[] {
  const consumersMap = buildConsumersMap(deps)
  const results: DependentResult[] = []
  const visited = new Set<string>()
  visited.add(startSurfaceId)

  // BFS queue: [surfaceId, via-path, distance]
  type QueueItem = [string, string[], number]
  const queue: QueueItem[] = [[startSurfaceId, [], 0]]

  while (queue.length > 0) {
    const [current, via, distance] = queue.shift()!

    if (distance >= hops) continue

    const consumers = consumersMap.get(current) ?? []
    for (const consumer of consumers) {
      if (visited.has(consumer)) continue
      visited.add(consumer)

      const newVia = [...via, current]
      results.push({
        surface_id: consumer,
        via: newVia,
        distance: distance + 1,
      })

      queue.push([consumer, newVia, distance + 1])
    }
  }

  return results.sort((a, b) => a.distance - b.distance)
}

// ============================================================================
// NET-NEW: calculateBlastRadius
// ============================================================================

export interface BlastRadius {
  /** Surfaces at distance 1 */
  direct: string[]
  /** Surfaces at distance 2+ */
  transitive: string[]
  /** Total unique affected surfaces */
  total: number
  /**
   * Confidence-weighted impact score.
   * direct * 1.0 + transitive * avg-confidence
   *
   * Higher = scarier change. Used to prioritize review effort.
   */
  confidence_weighted_score: number
}

/**
 * Calculate the blast radius for a set of surfaces being changed.
 *
 * Collects all dependents at distance 1 (direct) and distance 2-3 (transitive),
 * deduplicates across the input set, and computes a weighted impact score.
 *
 * The confidence parameter on deps is used for the weighted score:
 * an inferred edge (confidence=0.7) contributes less to the score than
 * a declared edge (confidence=1.0).
 */
export function calculateBlastRadius(
  surfaceIds: string[],
  deps: ReadonlyArray<Pick<SurfaceDependency, "from_surface_id" | "to_surface_id" | "confidence">> |
       ReadonlyArray<{ from_canonical_id: string; to_canonical_id: string; confidence?: number }>
): BlastRadius {
  if (surfaceIds.length === 0) {
    return { direct: [], transitive: [], total: 0, confidence_weighted_score: 0 }
  }

  // Build confidence map: from→to → confidence
  const confidenceMap = new Map<string, number>()
  for (const dep of deps) {
    const from = "from_canonical_id" in dep ? dep.from_canonical_id : dep.from_surface_id
    const to = "to_canonical_id" in dep ? dep.to_canonical_id : dep.to_surface_id
    const conf = dep.confidence ?? 1.0
    confidenceMap.set(`${from}→${to}`, conf)
  }

  const directSet = new Set<string>()
  const transitiveSet = new Set<string>()
  const startSet = new Set(surfaceIds)

  for (const surfaceId of surfaceIds) {
    const dependents = findDependents(surfaceId, deps, 3)

    for (const dep of dependents) {
      if (startSet.has(dep.surface_id)) continue // don't count surfaces being changed
      if (dep.distance === 1) {
        directSet.add(dep.surface_id)
      } else {
        transitiveSet.add(dep.surface_id)
      }
    }
  }

  // Remove any transitive that is already direct
  for (const id of directSet) {
    transitiveSet.delete(id)
  }

  // Compute weighted score
  // Direct: each surface counts 1.0 (explicit dep)
  // Transitive: each surface counts average confidence of edges in its shortest path
  let weightedScore = directSet.size * 1.0

  for (const id of transitiveSet) {
    // Best-effort: look up confidence from deps (1-hop from any changed surface to this)
    // For multi-hop, we average — this is a heuristic, not exact
    let totalConf = 0
    let confCount = 0
    for (const surfaceId of surfaceIds) {
      const key = `${surfaceId}→${id}`
      if (confidenceMap.has(key)) {
        totalConf += confidenceMap.get(key)!
        confCount++
      }
    }
    const avgConf = confCount > 0 ? totalConf / confCount : 0.7 // default inferred
    weightedScore += avgConf
  }

  return {
    direct: Array.from(directSet),
    transitive: Array.from(transitiveSet),
    total: directSet.size + transitiveSet.size,
    confidence_weighted_score: Math.round(weightedScore * 100) / 100,
  }
}

// ============================================================================
// NET-NEW: detectChangeConflicts
// ============================================================================

export interface ChangeConflict {
  /** The two surfaces that, if changed concurrently, risk interfering */
  pair: [string, string]
  /** The shared downstream surfaces that would be affected by both */
  shared_dependents: string[]
}

/**
 * Detect pairs of surfaces from surfaceIds whose dependent sets overlap.
 *
 * Overlapping dependents = concurrent changes to these two surfaces could
 * produce conflicting states in the same downstream consumer.
 *
 * Example: surface A and surface B both affect "route:GET /api/dashboard".
 * Changing A and B in the same PR without coordination risks inconsistency
 * in the dashboard route.
 *
 * O(n² * k) where n = surfaceIds.length, k = average dependent count.
 * Intended for small surfaceIds sets (a PR diff, not the whole catalog).
 */
export function detectChangeConflicts(
  surfaceIds: string[],
  deps: ReadonlyArray<Pick<SurfaceDependency, "from_surface_id" | "to_surface_id">> |
       ReadonlyArray<{ from_canonical_id: string; to_canonical_id: string }>
): ChangeConflict[] {
  if (surfaceIds.length < 2) return []

  const conflicts: ChangeConflict[] = []

  // Compute dependent sets for each surface (including itself for overlap detection)
  const dependentSets = new Map<string, Set<string>>()
  for (const id of surfaceIds) {
    const dependents = findDependents(id, deps, 3)
    dependentSets.set(id, new Set(dependents.map((d) => d.surface_id)))
  }

  // Compare every pair
  for (let i = 0; i < surfaceIds.length; i++) {
    for (let j = i + 1; j < surfaceIds.length; j++) {
      const a = surfaceIds[i]
      const b = surfaceIds[j]
      const aSet = dependentSets.get(a) ?? new Set<string>()
      const bSet = dependentSets.get(b) ?? new Set<string>()

      const shared: string[] = []
      for (const id of aSet) {
        if (bSet.has(id)) shared.push(id)
      }

      if (shared.length > 0) {
        conflicts.push({ pair: [a, b], shared_dependents: shared })
      }
    }
  }

  return conflicts
}
