/**
 * Unit tests for lib/mcp/entity-envelope.ts
 *
 * Run with: npx tsx lib/mcp/entity-envelope.test.ts
 *
 * Why these cases: `get_5wh({entity_type:'decision'})` failed in production with
 * a raw `column "user_id" does not exist`, because the tool mapped decisions to
 * architecture_decisions (the ADR table — no user_id) instead of
 * mlp_why_decisions (where create_decision/list_decisions actually write). The
 * same inline map also assumed every table has a user_id column, which is false
 * for work_order_steps. These tests pin the mapping and the ownership rules so a
 * new entity type cannot be half-registered again.
 *
 * The `table` parameter of audit_5wh(scope:'tables') reaches a SQL identifier
 * position, so the allowlist is tested against injection payloads too.
 */

import {
  ENTITY_ENVELOPE_SOURCES,
  KNOWN_ENVELOPE_ENTITY_TYPES,
  AUDITABLE_ENVELOPE_TABLES,
  isAuditableEnvelopeTable,
} from "./entity-envelope"

let passed = 0
let failed = 0
const failures: string[] = []

function ok(condition: boolean, message: string): void {
  if (condition) {
    passed++
  } else {
    failures.push(`FAIL: ${message}`)
    failed++
  }
}

function eq(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failures.push(`FAIL: ${message}\n  expected: ${e}\n  actual:   ${a}`)
    failed++
  } else {
    passed++
  }
}

// ── The regression that started this ──────────────────────────────────────────

eq(ENTITY_ENVELOPE_SOURCES.decision.table, "mlp_why_decisions",
  "decision resolves to the table create_decision writes to")

eq(ENTITY_ENVELOPE_SOURCES.decision.ownership, { via: "column", column: "user_id" },
  "decision is owned directly by user_id")

eq(ENTITY_ENVELOPE_SOURCES.adr.table, "architecture_decisions",
  "ADRs stay reachable under their own entity_type")

eq(ENTITY_ENVELOPE_SOURCES.adr.ownership,
  { via: "parent", table: "projects", foreignKey: "project_id", column: "user_id" },
  "ADRs are owned through their project, not a user_id column they lack")

// ── The second table that has no user_id ──────────────────────────────────────

eq(ENTITY_ENVELOPE_SOURCES.work_order_step.ownership,
  { via: "parent", table: "work_orders", foreignKey: "work_order_id", column: "user_id" },
  "work_order_step is owned through its parent work_order")

// ── Every registered source is structurally complete ──────────────────────────

for (const [type, source] of Object.entries(ENTITY_ENVELOPE_SOURCES)) {
  ok(typeof source.table === "string" && source.table.length > 0, `${type}: has a table`)
  ok(/^[a-z_][a-z0-9_]*$/.test(source.table), `${type}: table is a bare identifier`)
  if (source.ownership.via === "parent") {
    ok(source.ownership.table !== source.table, `${type}: parent table differs from child`)
    ok(source.ownership.foreignKey.length > 0, `${type}: parent join has a foreign key`)
  } else {
    ok(source.ownership.column.length > 0, `${type}: owner column named`)
  }
}

ok(KNOWN_ENVELOPE_ENTITY_TYPES.includes("decision"), "known types advertise 'decision'")
ok(KNOWN_ENVELOPE_ENTITY_TYPES.includes("adr"), "known types advertise 'adr'")

// ── Auditable-table allowlist ─────────────────────────────────────────────────

ok(AUDITABLE_ENVELOPE_TABLES.includes("mlp_why_decisions"),
  "decisions are now counted in envelope coverage audits")

ok(!AUDITABLE_ENVELOPE_TABLES.includes("work_order_steps"),
  "parent-owned tables are excluded rather than miscounted by a user_id filter")

ok(!AUDITABLE_ENVELOPE_TABLES.includes("architecture_decisions"),
  "ADRs are excluded from the user_id-filtered coverage query")

const sorted = [...AUDITABLE_ENVELOPE_TABLES].sort()
eq(AUDITABLE_ENVELOPE_TABLES, sorted, "allowlist is stably ordered")

ok(new Set(AUDITABLE_ENVELOPE_TABLES).size === AUDITABLE_ENVELOPE_TABLES.length,
  "allowlist has no duplicates")

// ── Injection payloads must never pass the allowlist ──────────────────────────

const INJECTION_PAYLOADS = [
  "todos; DROP TABLE todos",
  "todos --",
  "todos WHERE 1=1",
  "(SELECT 1)",
  "pg_shadow",
  "public.todos",
  "TODOS",
  "todos ",
  " todos",
  "",
  "*",
  "todos/*x*/",
  "'todos'",
]

for (const payload of INJECTION_PAYLOADS) {
  ok(!isAuditableEnvelopeTable(payload), `rejects injection payload: ${JSON.stringify(payload)}`)
}

for (const table of AUDITABLE_ENVELOPE_TABLES) {
  ok(isAuditableEnvelopeTable(table), `accepts allowlisted table: ${table}`)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
} else {
  console.log("All tests passed.")
}
