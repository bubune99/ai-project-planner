/**
 * Smoke tests for compose.ts — run with:
 *   npx tsx lib/work-orders/compose.test.ts
 *
 * Tests:
 *   1. Empty input
 *   2. Linear chain  A → B → C
 *   3. Parallel branches root → [A, B, C] → join
 *   4. Cycle detection  A → B → A
 *   5. Provides / requires tag resolution
 *   6. Mixed prerequisites + requires
 */

import { composeFromSpecs, type StepSpec } from './compose-pure'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${label}`)
    failed++
  }
}

function assertEq<T>(actual: T, expected: T, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${label}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

// ============================================================================
// Test 1: Empty input
// ============================================================================
console.log('\nTest 1: Empty input')
{
  const plan = composeFromSpecs([])
  assertEq(plan.steps.length, 0, 'no steps')
  assertEq(plan.max_parallelism, 0, 'max_parallelism = 0')
  assertEq(plan.cycles_detected, false, 'no cycles')
  assertEq(plan.warnings.length, 0, 'no warnings')
}

// ============================================================================
// Test 2: Linear chain  A → B → C  (via title prerequisites)
// ============================================================================
console.log('\nTest 2: Linear chain A → B → C')
{
  const specs: StepSpec[] = [
    { title: 'A', provides: [], requires: [] },
    { title: 'B', prerequisites: ['A'] },
    { title: 'C', prerequisites: ['B'] },
  ]
  const plan = composeFromSpecs(specs)
  assertEq(plan.cycles_detected, false, 'no cycles')
  assertEq(plan.steps.length, 3, '3 steps')

  const byTitle = Object.fromEntries(plan.steps.map(s => [s.title, s]))
  assertEq(byTitle['A'].level, 0, 'A is level 0')
  assertEq(byTitle['B'].level, 1, 'B is level 1')
  assertEq(byTitle['C'].level, 2, 'C is level 2')
  assertEq(byTitle['A'].step_order, 0, 'A is first')
  assertEq(byTitle['B'].step_order, 1, 'B is second')
  assertEq(byTitle['C'].step_order, 2, 'C is third')
  assertEq(plan.max_parallelism, 1, 'max_parallelism = 1 (no parallel steps)')
}

// ============================================================================
// Test 3: Parallel branches  root → [A, B, C] → join
// ============================================================================
console.log('\nTest 3: Parallel branches root → [A, B, C] → join')
{
  const specs: StepSpec[] = [
    { title: 'Root' },
    { title: 'Branch-A', prerequisites: ['Root'] },
    { title: 'Branch-B', prerequisites: ['Root'] },
    { title: 'Branch-C', prerequisites: ['Root'] },
    { title: 'Join', prerequisites: ['Branch-A', 'Branch-B', 'Branch-C'] },
  ]
  const plan = composeFromSpecs(specs)
  assertEq(plan.cycles_detected, false, 'no cycles')

  const byTitle = Object.fromEntries(plan.steps.map(s => [s.title, s]))
  assertEq(byTitle['Root'].level, 0, 'Root level 0')
  assertEq(byTitle['Branch-A'].level, 1, 'Branch-A level 1')
  assertEq(byTitle['Branch-B'].level, 1, 'Branch-B level 1')
  assertEq(byTitle['Branch-C'].level, 1, 'Branch-C level 1')
  assertEq(byTitle['Join'].level, 2, 'Join level 2')
  assertEq(plan.max_parallelism, 3, 'max_parallelism = 3 (three parallel branches)')

  // All branches should have the same parallel_group
  assertEq(byTitle['Branch-A'].parallel_group, byTitle['Branch-B'].parallel_group, 'A/B same group')
  assertEq(byTitle['Branch-B'].parallel_group, byTitle['Branch-C'].parallel_group, 'B/C same group')
}

// ============================================================================
// Test 4: Cycle detection  A → B → A
// ============================================================================
console.log('\nTest 4: Cycle detection A → B → A')
{
  const specs: StepSpec[] = [
    { title: 'A', prerequisites: ['B'] },
    { title: 'B', prerequisites: ['A'] },
  ]
  const plan = composeFromSpecs(specs)
  assert(plan.cycles_detected, 'cycle detected')
  assertEq(plan.steps.length, 2, 'still produces 2 steps (best-effort)')
  assert(plan.warnings.length > 0, 'warning emitted')
  console.log(`    warning: ${plan.warnings[0]}`)
}

// ============================================================================
// Test 5: Provides / requires tag resolution
// ============================================================================
console.log('\nTest 5: Provides/requires tag resolution')
{
  const specs: StepSpec[] = [
    { title: 'DB Migration', provides: ['database-schema'] },
    { title: 'API Layer', provides: ['rest-api'], requires: ['database-schema'] },
    { title: 'Frontend', requires: ['rest-api'] },
  ]
  const plan = composeFromSpecs(specs)
  assertEq(plan.cycles_detected, false, 'no cycles')

  const byTitle = Object.fromEntries(plan.steps.map(s => [s.title, s]))
  assertEq(byTitle['DB Migration'].level, 0, 'DB Migration level 0')
  assertEq(byTitle['API Layer'].level, 1, 'API Layer level 1')
  assertEq(byTitle['Frontend'].level, 2, 'Frontend level 2')
}

// ============================================================================
// Test 6: Mixed prerequisites (title) + requires (tags)
// ============================================================================
console.log('\nTest 6: Mixed title prerequisites + tag requires')
{
  const specs: StepSpec[] = [
    { title: 'Auth Setup', provides: ['auth-middleware'] },
    { title: 'Schema', provides: ['db-schema'] },
    // depends on Auth Setup via title, AND on something providing db-schema via tags
    { title: 'User API', prerequisites: ['Auth Setup'], requires: ['db-schema'] },
  ]
  const plan = composeFromSpecs(specs)
  assertEq(plan.cycles_detected, false, 'no cycles')

  const userApi = plan.steps.find(s => s.title === 'User API')!
  assert(userApi.level >= 1, 'User API is at level >= 1')
  assert(userApi.prerequisite_indices.length === 2, 'User API has 2 prerequisites (both sources)')
}

// ============================================================================
// Test 7: Single step with no deps
// ============================================================================
console.log('\nTest 7: Single step')
{
  const plan = composeFromSpecs([{ title: 'Solo' }])
  assertEq(plan.steps.length, 1, '1 step')
  assertEq(plan.steps[0].level, 0, 'level 0')
  assertEq(plan.steps[0].step_order, 0, 'order 0')
  assertEq(plan.max_parallelism, 1, 'max_parallelism = 1')
}

// ============================================================================
// Test 8: Sample 4-step plan (hypothetical template)
// ============================================================================
console.log('\nTest 8: Hypothetical 4-step template plan')
{
  const specs: StepSpec[] = [
    {
      title: 'Design DB schema',
      step_type: 'task',
      provides: ['schema-ready'],
      acceptance_criteria: ['schema migration applied', 'all tables verified'],
    },
    {
      title: 'Implement API endpoints',
      step_type: 'task',
      requires: ['schema-ready'],
      provides: ['api-ready'],
      acceptance_criteria: ['GET /api/resource returns 200', 'POST /api/resource creates record'],
    },
    {
      title: 'Write unit tests',
      step_type: 'verification',
      requires: ['api-ready'],
      provides: ['tests-passing'],
      acceptance_criteria: ['coverage >= 80%'],
    },
    {
      title: 'Gate: review + approve',
      step_type: 'gate',
      requires: ['tests-passing'],
      acceptance_criteria: ['PR reviewed', 'CI green'],
    },
  ]
  const plan = composeFromSpecs(specs)
  assertEq(plan.cycles_detected, false, 'no cycles')
  assertEq(plan.steps.length, 4, '4 steps')
  assertEq(plan.max_parallelism, 1, 'fully sequential = max_parallelism 1')

  console.log('\n  --- Sample ComposedPlan (4-step template) ---')
  for (const s of plan.steps) {
    console.log(`  [${s.step_order}] level=${s.level} group=${s.parallel_group} "${s.title}" (${s.step_type}) prereq_indices=[${s.prerequisite_indices}]`)
  }
}

// ============================================================================
// Results
// ============================================================================
console.log(`\n${'='.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('All tests passed.')
}
