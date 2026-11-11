/**
 * Executed checks for lib/flows/flow-model.ts.
 * Run: npx -y tsx@4.23.15 lib/flows/flow-model.assert.ts
 */
import assert from "node:assert/strict"
import {
  parseFlowBlock,
  writeFlowBlock,
  validateFlow,
  nextStepId,
  branchFlow,
  diffFlows,
  mergeFlow,
  flowDecisionIds,
  checkTransitions,
  framesToExpire,
  type Flow,
  type Frame,
} from "./flow-model"

let passed = 0
const ok = (name: string, fn: () => void) => {
  fn()
  passed++
  console.log(`ok  ${name}`)
}

const group: Flow = {
  id: "byb.group-order",
  version: 1,
  status: "settled",
  actors: ["organizer", "member", "store-owner", "system"],
  steps: [
    { id: "G1", actor: "organizer", screen: "/customize", transitions: [{ trigger: "Edit design", to: "G2" }] },
    {
      id: "G2", actor: "organizer", screen: "done sheet",
      transitions: [
        { trigger: "I'll enter them", to: "G3", condition: "no fields" },
        { trigger: "I'll enter them", to: "G4", condition: "has fields" },
        { trigger: "Send a link", to: "G5" },
      ],
      decisions: ["d-who-pays"],
    },
    { id: "G3", actor: "organizer", screen: "sizes", transitions: [{ trigger: "Save sizes to project", to: "G8" }, { trigger: "Cancel", to: "G2" }] },
    { id: "G4", actor: "organizer", screen: "roster", transitions: [{ trigger: "Save to project", to: "G8" }] },
    { id: "G5", actor: "organizer", screen: "share", transitions: [{ trigger: "Copy link", to: "G8" }], decisions: ["d-who-pays", "d-lock"] },
    { id: "G6", actor: "member", screen: "/options/:id/join", transitions: [{ trigger: "Join the order", to: "G6" }] },
    { id: "G8", actor: "organizer", screen: "panel", transitions: [] },
  ],
}

const doc = `# Flow\n\nProse here.\n\n\`\`\`flow\n${JSON.stringify(group)}\n\`\`\`\n\nMore prose.`

ok("parses the flow block out of a document", () => {
  const f = parseFlowBlock(doc)
  assert.equal(f?.id, "byb.group-order")
  assert.equal(f?.steps.length, 7)
  assert.equal(parseFlowBlock("# no flow here"), null)
})

ok("writes the block back in place and keeps the prose", () => {
  const changed = { ...group, version: 2 }
  const out = writeFlowBlock(doc, changed)
  assert.ok(out.includes("Prose here.") && out.includes("More prose."))
  assert.equal(parseFlowBlock(out)?.version, 2)
  assert.equal((out.match(/```flow/g) ?? []).length, 1)
  assert.equal(parseFlowBlock(writeFlowBlock("# empty", group))?.id, "byb.group-order")
})

ok("a valid flow has no errors", () => {
  assert.deepEqual(validateFlow(group).filter((i) => i.level === "error"), [])
})

ok("catches transitions to unknown steps, bad ids, wrong prefix, unknown actors", () => {
  const bad: Flow = structuredClone(group)
  bad.steps[0].transitions.push({ trigger: "Oops", to: "G99" })
  bad.steps.push({ id: "P1", actor: "organizer", screen: "x", transitions: [] })
  bad.steps.push({ id: "g7", actor: "stranger", screen: "x", transitions: [] })
  const msgs = validateFlow(bad).filter((i) => i.level === "error").map((i) => `${i.where}: ${i.message}`)
  assert.ok(msgs.some((m) => m.includes("unknown step G99")))
  assert.ok(msgs.some((m) => m.startsWith("P1") && m.includes("prefix G")))
  assert.ok(msgs.some((m) => m.startsWith("g7") && m.includes("letter prefix")))
  assert.ok(msgs.some((m) => m.includes(`actor "stranger"`)))
})

ok("unanswered decisions and missing rules warn before settling", () => {
  const w = validateFlow({ ...group, steps: group.steps.map((s) => (s.id === "G5" ? { ...s, rules: { money: "locked" } } : s)) }, { openDecisionIds: ["d-lock"] })
  assert.ok(w.some((i) => i.level === "warning" && i.message.includes("1 decision")))
  assert.ok(w.some((i) => i.where === "G5" && i.message.includes("permissions, notifications, edge_cases")))
  assert.deepEqual(validateFlow({ ...group, status: "draft" }, { openDecisionIds: ["d-lock"] }).filter((i) => i.level === "warning" && i.where === "flow"), [])
})

ok("next step id skips retired ids", () => {
  assert.equal(nextStepId(group), "G9")
  assert.equal(nextStepId({ ...group, retired: ["G12"] }), "G13")
})

ok("branch, diff and merge (refund-at-close rejected, lock-price merged)", () => {
  const b = branchFlow(group, "lock-price")
  assert.equal(b.branch, "lock-price")
  assert.equal(b.status, "draft")
  b.steps = b.steps.filter((s) => s.id !== "G4")
  b.steps.find((s) => s.id === "G2")!.transitions = b.steps.find((s) => s.id === "G2")!.transitions.filter((t) => t.to !== "G4")
  b.steps.find((s) => s.id === "G5")!.rules = { money: "price locked before sharing" }
  b.steps.push({ id: "G9", actor: "organizer", screen: "review", transitions: [] })
  const d = diffFlows(group, b)
  assert.deepEqual(d.added, ["G9"])
  assert.deepEqual(d.removed, ["G4"])
  assert.deepEqual(d.changed.map((c) => c.id).sort(), ["G2", "G5"])
  const merged = mergeFlow(group, b)
  assert.equal(merged.version, 2)
  assert.equal(merged.branch, undefined)
  assert.deepEqual(merged.retired, ["G4"])
  assert.equal(nextStepId(merged), "G10")
  assert.ok(validateFlow({ ...merged, steps: [...merged.steps, { id: "G4", actor: "organizer", screen: "x", transitions: [] }] }).some((i) => i.message.includes("retired")))
  assert.equal(group.steps.length, 7, "main is never mutated")
  assert.throws(() => branchFlow(group, "Bad Key"))
  assert.throws(() => mergeFlow(group, { ...b, id: "byb.other" }))
})

ok("collects decision ids once, in step order", () => {
  assert.deepEqual(flowDecisionIds(group), ["d-who-pays", "d-lock"])
})

ok("button check: pass, wrong destination, dead button, not in flow, not found", () => {
  const r = checkTransitions(group, [
    { step: "G2", trigger: "I'll enter them", landedOn: "G4" },
    { step: "G2", trigger: "Send a link", landedOn: "G8" },
    { step: "G3", trigger: "Save sizes to project", landedOn: null },
    { step: "G3", trigger: "Mystery", landedOn: "G1" },
  ])
  const by = (s: string, t: string) => r.find((x) => x.step === s && x.trigger === t)!
  assert.equal(by("G2", "I'll enter them").ok, true)
  assert.equal(by("G2", "Send a link").problem, "wrong destination")
  assert.equal(by("G3", "Save sizes to project").problem, "dead button")
  assert.equal(by("G3", "Mystery").problem, "not in flow")
  assert.equal(by("G3", "Cancel").problem, "not found on screen")
  assert.equal(r.filter((x) => x.step === "G1").length, 0, "steps not walked are not reported")
})

ok("screenshot retention follows the owner's rule", () => {
  const now = new Date("2026-12-31T00:00:00Z")
  const f = (id: string, extra: Partial<Frame>): Frame => ({ id, step: "G3", kind: "screenshot", env: "staging", capturedAt: "2026-11-01T00:00:00Z", ...extra })
  const frames: Frame[] = [
    f("old-pass", { passed: true, capturedAt: "2026-11-01T00:00:00Z" }),
    f("latest-pass", { passed: true, capturedAt: "2026-11-20T00:00:00Z" }),
    f("prod-pass", { passed: true, env: "prod", capturedAt: "2026-10-01T00:00:00Z" }),
    f("open-fail", { passed: false, openFinding: true }),
    f("fixed-long-ago", { passed: false, findingResolvedAt: "2026-12-01T00:00:00Z" }),
    f("fixed-recently", { passed: false, findingResolvedAt: "2026-12-25T00:00:00Z" }),
    f("pinned", { pinned: true }),
    f("recent", { capturedAt: "2026-12-20T00:00:00Z" }),
    { id: "mock", step: "G3", kind: "mockup", capturedAt: "2026-01-01T00:00:00Z" },
  ]
  assert.deepEqual(framesToExpire(frames, now).sort(), ["fixed-long-ago", "old-pass"])
})

console.log(`\n${passed} checks passed`)
