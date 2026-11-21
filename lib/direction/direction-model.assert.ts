// Run: npx -y tsx@4.23.15 lib/direction/direction-model.assert.ts
import assert from "node:assert/strict"
import { AREAS, KINDS, agentRefusals, answer, describeChanges, emptyDoc, guidanceFor, modeOf, parseDoc, propose, removeUpcoming, setMode, setNote, tree, waitingCount, KIND_BY_ID } from "./direction-model"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`ok ${n} ${name}`) }
const T = "2026-11-21T18:00:00.000Z"

ok("every kind sits in a known area, ids are unique, and every area has kinds", () => {
  assert.equal(new Set(KINDS.map((k) => k.id)).size, KINDS.length)
  for (const k of KINDS) assert.ok(AREAS.some((a) => a.id === k.area), k.id)
  for (const a of AREAS) assert.ok(KINDS.some((k) => k.area === a.id), a.id)
  for (const k of KINDS) if (k.locked) assert.equal(k.defaultMode, k.id === "product.errors" ? "ai" : "ask", k.id)
})

ok("a locked kind cannot be moved off its mode", () => {
  assert.throws(() => setMode(emptyDoc(), "data.migration.prod", "ai"), /fixed at Ask me first/)
  assert.throws(() => setMode(emptyDoc(), "people.send", "tell"), /fixed at Ask me first/)
  const { errors } = parseDoc({ choices: { "money.payments": { mode: "ai" } } })
  assert.match(errors[0], /fixed at Ask me first/)
})

ok("errors are never put to the owner, even if a stored mode says otherwise", () => {
  const k = KIND_BY_ID.get("product.errors")!
  assert.equal(modeOf(emptyDoc(), k), "ai")
  assert.equal(modeOf({ choices: { "product.errors": { mode: "ask" } }, upcoming: [] }, k), "ai")
  assert.throws(() => setMode(emptyDoc(), "product.errors", "ask"), /fixed at AI decides/)
})

ok("changing a mode keeps only what differs from the default, and back again removes it", () => {
  let d = setMode(emptyDoc(), "stack.library", "ask")
  assert.deepEqual(d.choices, { "stack.library": { mode: "ask" } })
  d = setMode(d, "stack.library", "tell")
  assert.deepEqual(d.choices, {})
  d = setNote(setMode(d, "design.layout", "ask"), "design.layout", "  Keep the sidebar narrow  ")
  assert.deepEqual(d.choices["design.layout"], { mode: "ask", note: "Keep the sidebar narrow" })
  d = setMode(d, "design.layout", "tell")
  assert.deepEqual(d.choices["design.layout"], { note: "Keep the sidebar narrow" })
})

ok("edits never change the document they were given", () => {
  const a = emptyDoc(), b = setMode(a, "stack.library", "ai")
  assert.deepEqual(a, emptyDoc())
  assert.notEqual(a, b)
})

ok("the tree counts what asks the owner per area", () => {
  const t = tree(setMode(emptyDoc(), "stack.library", "ask"))
  const stack = t.find((x) => x.area === "stack")!
  assert.equal(stack.asks, 2)  // library (changed) + provider (default ask)
  assert.equal(stack.kinds.find((k) => k.id === "stack.library")!.changed, true)
})

ok("a decision on an ask kind waits; on any other kind it is taken and told", () => {
  let d = emptyDoc()
  const w = propose(d, { id: "u1", kindId: "stack.provider", title: "Move file storage to Blob", aiPath: "Stay on R2", at: T })
  assert.equal(w.entry.status, "waiting")
  d = w.doc
  const t = propose(d, { id: "u2", kindId: "stack.library", title: "Use date-fns for ranges", aiPath: "Already in package.json", at: T })
  assert.equal(t.entry.status, "taken")
  assert.equal(waitingCount(t.doc), 1)
  assert.deepEqual(t.doc.upcoming.map((u) => u.id), ["u2", "u1"])
})

ok("a redirect needs the direction; an approval does not", () => {
  const d = propose(emptyDoc(), { id: "u1", kindId: "design.redesign", title: "Redesign the board", aiPath: "Lanes by status", at: T }).doc
  assert.throws(() => answer(d, "u1", { approve: false, at: T }), /which way to go/)
  const r = answer(d, "u1", { approve: false, note: "Keep columns, add swimlanes by person", at: T })
  assert.equal(r.upcoming[0].status, "redirected")
  assert.equal(answer(d, "u1", { approve: true, at: T }).upcoming[0].status, "approved")
  assert.throws(() => answer(d, "gone", { approve: true, at: T }), /no longer listed/)
})

ok("guidance tells the agent whether it must ask, and carries the owner's direction and past answers", () => {
  let d = setNote(emptyDoc(), "design.redesign", "Dense layouts, use the full width")
  d = answer(propose(d, { id: "u1", kindId: "design.redesign", title: "Redesign Money", aiPath: "Cards", at: T }).doc, "u1", { approve: false, note: "Tables, not cards", at: T })
  const g = guidanceFor(d, "design.redesign")
  assert.equal(g.mustAsk, true)
  assert.equal(g.ownerDirection, "Dense layouts, use the full width")
  assert.deepEqual(g.precedents, [{ title: "Redesign Money", status: "redirected", ownerNote: "Tables, not cards" }])
  assert.match(g.next, /Do not act/)
  assert.equal(guidanceFor(emptyDoc(), "product.errors").mustAsk, false)
  assert.match(guidanceFor(emptyDoc(), "shipping.fix").next, /record what you decided/)
  assert.throws(() => guidanceFor(emptyDoc(), "nope"), /Known: access.stricter/)
})

ok("parsing drops unknown kinds and keeps a valid document whole", () => {
  const good = propose(setNote(setMode(emptyDoc(), "stack.library", "ask"), "data.sample", "Use names from the Bible"), { id: "u1", kindId: "stack.library", title: "x", aiPath: "y", at: T }).doc
  const { doc, errors } = parseDoc(JSON.parse(JSON.stringify({ ...good, choices: { ...good.choices, "made.up": { mode: "ai" } } })))
  assert.deepEqual(errors, [])
  assert.deepEqual(doc, good)
  assert.deepEqual(parseDoc(null), { doc: emptyDoc(), errors: [] })
  assert.match(parseDoc({ upcoming: [{ id: "a", kindId: "stack.library", title: "t", aiPath: "p", status: "redirected" }] }).errors[0], /redirect needs/)
})

ok("the record says what changed in plain words", () => {
  const a = emptyDoc()
  let b = setNote(setMode(a, "stack.library", "ask"), "stack.library", "Ask before adding UI kits")
  b = propose(b, { id: "u1", kindId: "stack.library", title: "Add zod", aiPath: "It validates input", at: T }).doc
  assert.deepEqual(describeChanges(a, b), [
    `"Adding a library or service": AI decides, tells me to Ask me first`,
    `"Adding a library or service": direction set to "Ask before adding UI kits"`,
    `Waiting for you: "Add zod"`,
  ])
  const c = answer(b, "u1", { approve: true, at: T })
  assert.deepEqual(describeChanges(b, c), [`Approved: "Add zod"`])
  assert.deepEqual(describeChanges(c, removeUpcoming(c, "u1")), [`Removed: "Add zod"`])
  assert.deepEqual(describeChanges(c, c), [])
})

ok("an agent may propose and take decisions, but never set a mode, a direction or an answer", () => {
  const base = propose(emptyDoc(), { id: "u1", kindId: "design.redesign", title: "Redesign the board", aiPath: "Lanes", at: T }).doc
  assert.deepEqual(agentRefusals(base, propose(base, { id: "u2", kindId: "stack.library", title: "x", aiPath: "y", at: T }).doc), [])
  assert.deepEqual(agentRefusals(base, removeUpcoming(base, "u1")), [])
  assert.match(agentRefusals(base, setMode(base, "stack.library", "ai"))[0], /only the owner sets how/)
  assert.match(agentRefusals(base, setNote(base, "stack.library", "x"))[0], /only the owner sets the direction/)
  const answered = answer(base, "u1", { approve: true, at: T })
  assert.match(agentRefusals(base, answered)[0], /only the owner answers/)
  assert.match(agentRefusals(answered, removeUpcoming(answered, "u1"))[0], /stays on the record/)
})

console.log(`${n} checks passed`)
