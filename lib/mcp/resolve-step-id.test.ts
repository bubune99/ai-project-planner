/**
 * Unit tests for lib/mcp/resolve-step-id.ts
 *
 * Run with: npx tsx --test lib/mcp/resolve-step-id.test.ts
 *
 * Why: add_task_comment rejected the 8-character id gates prints ("0f9af3f9")
 * with a raw Postgres uuid error. Short ids must resolve within the caller's
 * own projects, and every failure must say what to do next.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { classifyStepId, pickStep, resolveStepId } from "./resolve-step-id"

const FULL = "0f9af3f9-1600-4e71-97ad-205fe54eaabf"

test("a full id passes through unchanged (lower-cased), with no lookup", async () => {
  assert.deepEqual(classifyStepId(FULL.toUpperCase()), { kind: "uuid", id: FULL })
  const sql = async () => { throw new Error("must not query") }
  assert.equal(await resolveStepId(sql as never, "u1", FULL), FULL)
})

test("the 8-character form gates prints is a prefix; partial ids with dashes too", () => {
  assert.deepEqual(classifyStepId("0f9af3f9"), { kind: "prefix", prefix: "0f9af3f9" })
  assert.deepEqual(classifyStepId("0f9af3f9-1600"), { kind: "prefix", prefix: "0f9af3f9-1600" })
})

test("too short or not hex is refused with a reason", () => {
  assert.equal(classifyStepId("0f9a").kind, "invalid")
  assert.match((classifyStepId("0f9a") as { reason: string }).reason, /at least 6/)
  assert.equal(classifyStepId("drop table").kind, "invalid")
  assert.equal(classifyStepId("0f9af3%").kind, "invalid")
})

test("one match resolves; none and several say what to do", () => {
  assert.deepEqual(pickStep("0f9af3f9", [{ id: FULL, title: "A7" }]), { id: FULL })
  assert.match((pickStep("abcdef", []) as { error: string }).error, /No task starting with "abcdef"/)
  const many = pickStep("0f9af3", [{ id: FULL, title: "A7" }, { id: "0f9af3aa-0000-4000-8000-000000000000", title: "B" }])
  assert.match((many as { error: string }).error, /matches 2 tasks: .*A7.*Give more/)
})

test("the prefix query is scoped to the caller and asks for a prefix match", async () => {
  let seen: unknown[] = []
  const sql = async (_s: TemplateStringsArray, ...v: unknown[]) => { seen = v; return [{ id: FULL, title: "A7" }] }
  assert.equal(await resolveStepId(sql as never, "user-9", "0f9af3f9"), FULL)
  assert.equal(seen[0], "0f9af3f9%")
  assert.ok(seen.includes("user-9"))
})
