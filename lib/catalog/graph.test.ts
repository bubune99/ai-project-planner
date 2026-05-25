/**
 * Unit tests for lib/catalog/graph.ts
 *
 * Run with: npx tsx lib/catalog/graph.test.ts
 *
 * Tests cover:
 *   - buildConsumersMap: reverse-dep map construction
 *   - detectCircularDependencies: linear chain (no cycle), simple cycle, multi-hop cycle
 *   - findDependents: k-hop BFS, distance ordering
 *   - calculateBlastRadius: direct vs transitive, confidence weighting
 *   - detectChangeConflicts: overlapping dependents, non-overlapping pairs
 *   - diffScanAgainstCurrent: targeted scan never deprecates; full scan deprecates absent surfaces
 */

import {
  buildConsumersMap,
  detectCircularDependencies,
  findDependents,
  calculateBlastRadius,
  detectChangeConflicts,
} from "./graph"
import { diffScanAgainstCurrent } from "./persist"
import type { ScanResult, Surface, SurfaceDependency } from "./types"

// ============================================================================
// Tiny test harness
// ============================================================================

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures.push(`FAIL: ${message}`)
    failed++
  } else {
    passed++
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `FAIL: ${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`
    )
    failed++
  } else {
    passed++
  }
}

// ============================================================================
// Helpers: fake edge constructors
// ============================================================================

type CanonicalDep = { from_canonical_id: string; to_canonical_id: string; confidence?: number }

function edge(from: string, to: string, confidence = 1.0): CanonicalDep {
  return { from_canonical_id: from, to_canonical_id: to, confidence }
}

// ============================================================================
// buildConsumersMap tests
// ============================================================================

function testBuildConsumersMap(): void {
  // A → B, A → C, D → B
  const deps = [edge("A", "B"), edge("A", "C"), edge("D", "B")]
  const map = buildConsumersMap(deps)

  assert(map.has("B"), "B should be in consumers map")
  const bConsumers = map.get("B")!
  assert(bConsumers.includes("A"), "A should be a consumer of B")
  assert(bConsumers.includes("D"), "D should be a consumer of B")
  assert(map.get("C")?.includes("A") ?? false, "A should be a consumer of C")
  assert(!map.has("A"), "A has no consumers")
}

function testBuildConsumersMapEmpty(): void {
  const map = buildConsumersMap([])
  assert(map.size === 0, "empty deps → empty consumers map")
}

// ============================================================================
// detectCircularDependencies tests
// ============================================================================

function testNoCycle(): void {
  // Linear chain: A → B → C (no cycle)
  const deps = [edge("A", "B"), edge("B", "C")]
  const cycles = detectCircularDependencies(deps)
  assert(cycles.length === 0, "linear chain should have no cycles")
}

function testSimpleCycle(): void {
  // A → B → A
  const deps = [edge("A", "B"), edge("B", "A")]
  const cycles = detectCircularDependencies(deps)
  assert(cycles.length === 1, "simple cycle should produce 1 cycle")
  const cycle = cycles[0].cycle
  assert(cycle.includes("A"), "cycle should include A")
  assert(cycle.includes("B"), "cycle should include B")
}

function testMultiHopCycle(): void {
  // A → B → C → A
  const deps = [edge("A", "B"), edge("B", "C"), edge("C", "A")]
  const cycles = detectCircularDependencies(deps)
  assert(cycles.length === 1, "three-node cycle should produce 1 cycle")
  assert(cycles[0].cycle.length === 3, "cycle should have 3 nodes")
}

function testParallelBranchesNoCycle(): void {
  // A → B, A → C, B → D, C → D (diamond, no cycle)
  const deps = [edge("A", "B"), edge("A", "C"), edge("B", "D"), edge("C", "D")]
  const cycles = detectCircularDependencies(deps)
  assert(cycles.length === 0, "diamond graph should have no cycles")
}

function testDisconnectedGraphWithCycle(): void {
  // A → B → A (cycle) and X → Y (no cycle)
  const deps = [edge("A", "B"), edge("B", "A"), edge("X", "Y")]
  const cycles = detectCircularDependencies(deps)
  assert(cycles.length === 1, "only one cycle in disconnected graph")
}

// ============================================================================
// findDependents tests
// ============================================================================

function testFindDependentsDirectOnly(): void {
  // A is consumed by B and C; B is consumed by D
  // edges: B → A, C → A, D → B  (means B reads A, C reads A, D reads B)
  const deps = [edge("B", "A"), edge("C", "A"), edge("D", "B")]
  const results = findDependents("A", deps, 1)
  // At distance 1: B and C depend on A
  const ids = results.map((r) => r.surface_id)
  assert(ids.includes("B"), "B should be a direct dependent of A")
  assert(ids.includes("C"), "C should be a direct dependent of A")
  assert(!ids.includes("D"), "D is 2 hops, should not appear with hops=1")
  assert(results.every((r) => r.distance === 1), "all results should be at distance 1")
}

function testFindDependentsMultiHop(): void {
  // Chain: D reads C, C reads B, B reads A
  const deps = [edge("B", "A"), edge("C", "B"), edge("D", "C")]
  const results = findDependents("A", deps, 3)

  const byId = new Map(results.map((r) => [r.surface_id, r]))
  assert(byId.has("B"), "B should be found at distance 1")
  assert(byId.get("B")?.distance === 1, "B distance should be 1")
  assert(byId.has("C"), "C should be found at distance 2")
  assert(byId.get("C")?.distance === 2, "C distance should be 2")
  assert(byId.has("D"), "D should be found at distance 3")
  assert(byId.get("D")?.distance === 3, "D distance should be 3")

  // Results should be sorted by distance
  assert(
    results[0].distance <= results[results.length - 1].distance,
    "results should be sorted by distance ascending"
  )
}

function testFindDependentsNoDependents(): void {
  // A depends on nothing and nothing depends on A
  const deps = [edge("B", "C")]
  const results = findDependents("A", deps, 2)
  assert(results.length === 0, "isolated surface should have no dependents")
}

function testFindDependentsStopAtHopLimit(): void {
  // Chain: E → D → C → B → A
  const deps = [edge("B", "A"), edge("C", "B"), edge("D", "C"), edge("E", "D")]
  const results2 = findDependents("A", deps, 2)
  const ids2 = results2.map((r) => r.surface_id)
  assert(ids2.includes("B"), "B at distance 1 should be found with hops=2")
  assert(ids2.includes("C"), "C at distance 2 should be found with hops=2")
  assert(!ids2.includes("D"), "D at distance 3 should NOT be found with hops=2")
  assert(!ids2.includes("E"), "E at distance 4 should NOT be found with hops=2")
}

// ============================================================================
// calculateBlastRadius tests
// ============================================================================

function testBlastRadiusSimple(): void {
  // B and C read from A; D reads from B
  const deps = [edge("B", "A"), edge("C", "A"), edge("D", "B")]
  const blast = calculateBlastRadius(["A"], deps)

  assert(blast.direct.includes("B"), "B should be direct dependent")
  assert(blast.direct.includes("C"), "C should be direct dependent")
  assert(blast.transitive.includes("D"), "D should be transitive dependent")
  assert(blast.total === 3, "total should be 3")
  assert(blast.confidence_weighted_score >= 2.0, "weighted score should be at least 2 (2 direct × 1.0)")
}

function testBlastRadiusConfidenceWeighting(): void {
  // B reads A with confidence 1.0 (explicit)
  // C reads A with confidence 0.5 (inferred)
  const deps = [
    { from_canonical_id: "B", to_canonical_id: "A", confidence: 1.0 },
    { from_canonical_id: "C", to_canonical_id: "A", confidence: 0.5 },
  ]
  const blast = calculateBlastRadius(["A"], deps)

  // B and C are both at distance 1 (direct)
  assert(blast.direct.length === 2, "should have 2 direct dependents")
  assert(blast.total === 2, "total should be 2")
  // Score: 2 direct × 1.0 = 2.0 (confidence applies to transitive in our model)
  assert(blast.confidence_weighted_score === 2.0, "score should be 2.0 for 2 direct dependents")
}

function testBlastRadiusEmpty(): void {
  const blast = calculateBlastRadius([], [])
  assert(blast.total === 0, "empty surfaces → zero blast radius")
  assert(blast.confidence_weighted_score === 0, "empty surfaces → zero score")
}

function testBlastRadiusMultipleSurfaces(): void {
  // Changing both A and B; C reads from A; D reads from B; E reads from C
  const deps = [edge("C", "A"), edge("D", "B"), edge("E", "C")]
  const blast = calculateBlastRadius(["A", "B"], deps)
  const allAffected = [...blast.direct, ...blast.transitive]
  assert(allAffected.includes("C"), "C should be affected")
  assert(allAffected.includes("D"), "D should be affected")
  assert(blast.total >= 2, "at least C and D should be affected")
}

// ============================================================================
// detectChangeConflicts tests
// ============================================================================

function testChangeConflictsOverlapping(): void {
  // Both A and B are consumed by C
  // i.e., C depends on A and C depends on B
  const deps = [edge("C", "A"), edge("C", "B")]
  const conflicts = detectChangeConflicts(["A", "B"], deps)
  assert(conflicts.length === 1, "should detect one conflict between A and B")
  const c = conflicts[0]
  assert(
    c.shared_dependents.includes("C"),
    "C should be a shared dependent of A and B"
  )
}

function testChangeConflictsNoOverlap(): void {
  // A is consumed by X; B is consumed by Y — no overlap
  const deps = [edge("X", "A"), edge("Y", "B")]
  const conflicts = detectChangeConflicts(["A", "B"], deps)
  assert(conflicts.length === 0, "no shared dependents → no conflicts")
}

function testChangeConflictsSingleSurface(): void {
  // Can't conflict with yourself
  const conflicts = detectChangeConflicts(["A"], [edge("X", "A")])
  assert(conflicts.length === 0, "single surface can't conflict with itself")
}

// ============================================================================
// diffScanAgainstCurrent tests (from persist.ts)
// ============================================================================

function makeSurface(overrides: Partial<Surface> = {}): Surface {
  return {
    id: "uuid-1",
    canonical_id: "db:test",
    kind: "db_table",
    project_id: null,
    location: { file_path: "lib/db/migrations/001.sql" },
    signature: { columns: [] },
    content_hash: null,
    first_seen_commit_sha: null,
    last_seen_commit_sha: null,
    deprecated_in_commit_sha: null,
    status: "fresh",
    auto_detected_by: "scan_full",
    last_verified_at: null,
    last_verified_method: null,
    user_id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    metadata: {},
    documentation_5wh: {},
    ...overrides,
  }
}

function makeScanResult(
  overrides: Partial<ScanResult> = {}
): ScanResult {
  return {
    scanned_files: [],
    scan_type: "full",
    detected_surfaces: [],
    detected_dependencies: [],
    warnings: [],
    duration_ms: 0,
    ...overrides,
  }
}

function testDiffTargetedNeverDeprecates(): void {
  // Surface exists in DB but is absent from targeted scan → should NOT be deprecated
  const existing = makeSurface({
    id: "uuid-existing",
    canonical_id: "db:old_table",
    status: "fresh",
  })

  const scanResult = makeScanResult({
    scan_type: "targeted",
    detected_surfaces: [], // empty — "old_table" was not scanned
  })

  const diff = diffScanAgainstCurrent({
    scanResult,
    existingSurfaces: [existing],
    existingDependencies: [],
  })

  assert(
    diff.surfacesToDeprecate.length === 0,
    "targeted scan should NEVER deprecate absent surfaces (critical invariant)"
  )
}

function testDiffFullScanDeprecatesAbsent(): void {
  // Full scan: surface in DB but not in scan output → should be deprecated
  const existing = makeSurface({
    id: "uuid-existing",
    canonical_id: "db:removed_table",
    status: "fresh",
  })

  const scanResult = makeScanResult({
    scan_type: "full",
    detected_surfaces: [], // empty — table was removed from codebase
  })

  const diff = diffScanAgainstCurrent({
    scanResult,
    existingSurfaces: [existing],
    existingDependencies: [],
  })

  assert(
    diff.surfacesToDeprecate.includes("uuid-existing"),
    "full scan should deprecate surfaces absent from scan output"
  )
}

function testDiffInsertsNewSurface(): void {
  const scanResult = makeScanResult({
    scan_type: "targeted",
    detected_surfaces: [
      {
        canonical_id: "db:new_table",
        kind: "db_table",
        location: { file_path: "lib/db/migrations/002.sql" },
        signature: { columns: [] },
      },
    ],
  })

  const diff = diffScanAgainstCurrent({
    scanResult,
    existingSurfaces: [],
    existingDependencies: [],
  })

  assert(diff.surfacesToInsert.length === 1, "new surface should be in surfacesToInsert")
  assert(
    diff.surfacesToInsert[0].canonical_id === "db:new_table",
    "inserted surface should have correct canonical_id"
  )
}

function testDiffUpdatesModifiedSurface(): void {
  const { computeContentHash } = require("./hash")
  const oldSig = { columns: [{ name: "id", type: "UUID" }] }
  const newSig = { columns: [{ name: "id", type: "UUID" }, { name: "name", type: "TEXT" }] }

  const existing = makeSurface({
    id: "uuid-123",
    canonical_id: "db:updated_table",
    signature: oldSig,
    content_hash: computeContentHash(oldSig),
  })

  const scanResult = makeScanResult({
    scan_type: "targeted",
    detected_surfaces: [
      {
        canonical_id: "db:updated_table",
        kind: "db_table",
        location: { file_path: "lib/db/migrations/001.sql" },
        signature: newSig, // different from existing
      },
    ],
  })

  const diff = diffScanAgainstCurrent({
    scanResult,
    existingSurfaces: [existing],
    existingDependencies: [],
  })

  assert(diff.surfacesToUpdate.length === 1, "modified surface should be in surfacesToUpdate")
  assert(
    diff.surfacesToUpdate[0].existing_id === "uuid-123",
    "update should reference existing surface UUID"
  )
}

function testDiffUnchangedSurfaceNotReported(): void {
  const { computeContentHash } = require("./hash")
  const sig = { columns: [{ name: "id", type: "UUID" }] }

  const existing = makeSurface({
    id: "uuid-unchanged",
    canonical_id: "db:stable_table",
    signature: sig,
    content_hash: computeContentHash(sig), // same hash as what scanner will produce
  })

  const scanResult = makeScanResult({
    scan_type: "targeted",
    detected_surfaces: [
      {
        canonical_id: "db:stable_table",
        kind: "db_table",
        location: { file_path: "lib/db/migrations/001.sql" },
        signature: sig, // identical — same hash
      },
    ],
  })

  const diff = diffScanAgainstCurrent({
    scanResult,
    existingSurfaces: [existing],
    existingDependencies: [],
  })

  assert(diff.surfacesToInsert.length === 0, "unchanged surface should not be inserted")
  assert(diff.surfacesToUpdate.length === 0, "unchanged surface should not be updated")
  assert(diff.surfacesToDeprecate.length === 0, "unchanged surface should not be deprecated")
}

// ============================================================================
// Run all tests
// ============================================================================

async function main(): Promise<void> {
  console.log("Running catalog graph tests...\n")

  const tests: Array<[string, () => void]> = [
    // buildConsumersMap
    ["buildConsumersMap: basic", testBuildConsumersMap],
    ["buildConsumersMap: empty", testBuildConsumersMapEmpty],
    // detectCircularDependencies
    ["detectCycles: no cycle (linear)", testNoCycle],
    ["detectCycles: simple A→B→A", testSimpleCycle],
    ["detectCycles: three-node A→B→C→A", testMultiHopCycle],
    ["detectCycles: diamond (no cycle)", testParallelBranchesNoCycle],
    ["detectCycles: disconnected graph with one cycle", testDisconnectedGraphWithCycle],
    // findDependents
    ["findDependents: direct only (hops=1)", testFindDependentsDirectOnly],
    ["findDependents: multi-hop chain", testFindDependentsMultiHop],
    ["findDependents: isolated surface", testFindDependentsNoDependents],
    ["findDependents: stop at hop limit", testFindDependentsStopAtHopLimit],
    // calculateBlastRadius
    ["blastRadius: simple direct+transitive", testBlastRadiusSimple],
    ["blastRadius: confidence weighting", testBlastRadiusConfidenceWeighting],
    ["blastRadius: empty inputs", testBlastRadiusEmpty],
    ["blastRadius: multiple changed surfaces", testBlastRadiusMultipleSurfaces],
    // detectChangeConflicts
    ["changeConflicts: overlapping dependents", testChangeConflictsOverlapping],
    ["changeConflicts: no overlap", testChangeConflictsNoOverlap],
    ["changeConflicts: single surface", testChangeConflictsSingleSurface],
    // diffScanAgainstCurrent (persist.ts)
    ["diff: targeted scan NEVER deprecates (invariant)", testDiffTargetedNeverDeprecates],
    ["diff: full scan deprecates absent surfaces", testDiffFullScanDeprecatesAbsent],
    ["diff: inserts new surface", testDiffInsertsNewSurface],
    ["diff: updates modified surface", testDiffUpdatesModifiedSurface],
    ["diff: unchanged surface not reported", testDiffUnchangedSurfaceNotReported],
  ]

  for (const [name, fn] of tests) {
    try {
      fn()
      console.log(`  ✓ ${name}`)
    } catch (e) {
      failures.push(`FAIL (exception): ${name}: ${String(e)}`)
      failed++
      console.log(`  ✗ ${name}: ${String(e)}`)
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log("\nFailures:")
    for (const f of failures) {
      console.log(`  ${f}`)
    }
    process.exit(1)
  } else {
    console.log("All tests passed.")
  }
}

main().catch((e) => {
  console.error("Test runner crashed:", e)
  process.exit(1)
})
