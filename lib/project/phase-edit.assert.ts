import assert from "node:assert/strict"
import { phaseStrip } from "./phase-strip"
import {
  addPhase, checkName, headingTitle, invertWrites, movePhase, outsidePhaseFor, phaseLabel, planWrites, readPhases,
  removePhase, renamePhase, type EditPhase, type PhaseCard, type PhaseWrite,
} from "./phase-edit"

let n = 0
const ok = (f: () => void) => { f(); n++ }
const must = (r: { ok: true; phases: EditPhase[] } | { ok: false; error: string }): EditPhase[] => {
  if (!r.ok) throw new Error("expected the edit to be allowed: " + r.error)
  return r.phases
}
const refused = (r: { ok: boolean; error?: string }) => { assert.equal(r.ok, false); assert.ok((r as { error: string }).error.length > 5) }

// What a save does to the cards, so a plan can be checked by reading the strip afterwards.
function apply(cards: PhaseCard[], writes: PhaseWrite[], ids: Record<string, string> = {}): PhaseCard[] {
  let out = cards.map((c) => ({ ...c }))
  for (const w of writes) {
    if (w.kind === "patch") out = out.map((c) => (c.id === w.id ? { ...c, ...(w.phase !== undefined ? { phase: w.phase } : {}), ...(w.title !== undefined ? { title: w.title } : {}) } : c))
    else if (w.kind === "create") out = [...out, { id: ids[w.key] ?? "made-" + w.key, title: w.title, phase: w.phase }]
    else out = out.filter((c) => c.id !== w.id)
  }
  return out
}
const names = (cards: PhaseCard[]) => phaseStrip(cards).phases.map((p) => `${p.number} ${p.name}`)

// The planner's own shape: a heading card per phase, tasks inside some, most cards outside any phase.
const cards: PhaseCard[] = [
  { id: "h1", title: "Phase 1 — Foundation", phase: "1" },
  { id: "h2", title: "Phase 2 — View Fixes", phase: "2" },
  { id: "t2a", title: "Fix the calendar", phase: "2" },
  { id: "t2b", title: "Fix the board", phase: "2" },
  { id: "h3", title: "Phase 3: Dashboard", phase: "3" },
  { id: "x1", title: "Loose card", phase: "ideation" },
  { id: "x2", title: "Another", phase: "" },
]
const OUT = "ideation"
const before = readPhases(cards)

// Reading: same phases, names and order as the strip; outside cards are not phases.
ok(() => assert.deepEqual(before.map((p) => `${p.number} ${phaseLabel(p)}`), names(cards)))
ok(() => assert.deepEqual(before.map((p) => p.headingId), ["h1", "h2", "h3"]))
ok(() => assert.deepEqual(before[1].cardIds, ["h2", "t2a", "t2b"]))
ok(() => assert.deepEqual(readPhases([]), []))
ok(() => assert.deepEqual(readPhases([{ id: "a", title: "Write the API", phase: "4" }]).map((p) => [p.name, p.headingId, phaseLabel(p)]), [["", null, "Phase 4"]]))

// Where a card goes when its phase is removed: what the create route gives a card made with no phase.
ok(() => assert.equal(outsidePhaseFor("ideation"), "ideation"))
ok(() => assert.equal(outsidePhaseFor(""), "planning"))
ok(() => assert.equal(outsidePhaseFor(null), "planning"))
ok(() => assert.equal(outsidePhaseFor("3"), "planning"))

// Names: not empty, not a repeat (whatever the case or spacing), one line, not too long.
ok(() => assert.ok(checkName(before, "  ")))
ok(() => assert.ok(checkName(before, "foundation ")))
ok(() => assert.ok(checkName(before, "x".repeat(81))))
ok(() => assert.equal(checkName(before, "Launch"), null))
ok(() => assert.equal(checkName(before, "Foundation", "1"), null))
ok(() => assert.ok(checkName(readPhases([{ id: "a", title: "t", phase: "4" }]), "phase 4")))

// Every edit returns a new list and leaves the one it was given alone.
const frozen = JSON.stringify(before)

// Add at the end.
const added = must(addPhase(before, " Launch "))
ok(() => assert.deepEqual(added.map((p) => `${p.number} ${p.name}`), ["1 Foundation", "2 View Fixes", "3 Dashboard", "4 Launch"]))
ok(() => assert.notEqual(added, before))
const addWrites = planWrites(cards, before, added, OUT)
ok(() => assert.deepEqual(addWrites, [{ kind: "create", key: added[3].key, title: "Phase 4 — Launch", phase: "4" }]))
ok(() => assert.deepEqual(names(apply(cards, addWrites)), ["1 Foundation", "2 View Fixes", "3 Dashboard", "4 Launch"]))

// Add between two: the later ones move down one, cards and headings with them, and the new card is made last.
const between = must(addPhase(before, "Design", 1))
ok(() => assert.deepEqual(between.map((p) => `${p.number} ${p.name}`), ["1 Foundation", "2 Design", "3 View Fixes", "4 Dashboard"]))
const betweenWrites = planWrites(cards, before, between, OUT)
ok(() => assert.equal(betweenWrites[betweenWrites.length - 1].kind, "create"))
ok(() => assert.deepEqual(betweenWrites.filter((w) => w.kind === "patch").map((w) => w.kind === "patch" && w.id).sort(), ["h2", "h3", "t2a", "t2b"]))
const afterBetween = apply(cards, betweenWrites)
ok(() => assert.deepEqual(names(afterBetween), ["1 Foundation", "2 Design", "3 View Fixes", "4 Dashboard"]))
ok(() => assert.deepEqual(readPhases(afterBetween)[2].cardIds.sort(), ["h2", "t2a", "t2b"]))
ok(() => assert.equal(afterBetween.find((c) => c.id === "h3")?.title, "Phase 4 — Dashboard"))
ok(() => assert.equal(afterBetween.find((c) => c.id === "t2a")?.title, "Fix the calendar"))
// Add first of all, in a project with no phases.
ok(() => assert.deepEqual(planWrites([], [], must(addPhase([], "Start")), OUT), [{ kind: "create", key: must(addPhase([], "Start"))[0].key, title: "Phase 1 — Start", phase: "1" }]))
ok(() => refused(addPhase(before, "")))
ok(() => refused(addPhase(before, "View fixes")))
ok(() => refused(addPhase(before, "Launch", 9)))
ok(() => refused(addPhase(before, "Launch", -1)))

// Rename: only the heading card's title changes; a heading written with a colon is rewritten in the usual form.
const renamed = must(renamePhase(before, "3", "Dashboard Completion"))
ok(() => assert.deepEqual(planWrites(cards, before, renamed, OUT), [{ kind: "patch", id: "h3", title: "Phase 3 — Dashboard Completion" }]))
ok(() => assert.deepEqual(planWrites(cards, before, must(renamePhase(before, "3", "Dashboard")), OUT), []))
ok(() => refused(renamePhase(before, "3", "Foundation")))
ok(() => refused(renamePhase(before, "3", " ")))
ok(() => refused(renamePhase(before, "nope", "X")))
// Renaming a phase that has no heading card makes one, in that phase.
const bare: PhaseCard[] = [{ id: "a", title: "Write the API", phase: "4" }]
const bareRenamed = must(renamePhase(readPhases(bare), "4", "Launch"))
ok(() => assert.deepEqual(planWrites(bare, readPhases(bare), bareRenamed, OUT), [{ kind: "create", key: "4", title: "Phase 4 — Launch", phase: "4" }]))
ok(() => assert.deepEqual(names(apply(bare, planWrites(bare, readPhases(bare), bareRenamed, OUT))), ["4 Launch"]))

// Move: the phase takes the new place, numbers stay 1 to n, every card of every phase that moved goes with it.
const moved = must(movePhase(before, "3", 0))
ok(() => assert.deepEqual(moved.map((p) => `${p.number} ${p.name}`), ["1 Dashboard", "2 Foundation", "3 View Fixes"]))
const afterMove = apply(cards, planWrites(cards, before, moved, OUT))
ok(() => assert.deepEqual(names(afterMove), ["1 Dashboard", "2 Foundation", "3 View Fixes"]))
ok(() => assert.deepEqual(readPhases(afterMove)[2].cardIds.sort(), ["h2", "t2a", "t2b"]))
ok(() => assert.equal(afterMove.filter((c) => c.id.startsWith("x")).every((c, i) => c.phase === cards.filter((k) => k.id.startsWith("x"))[i].phase), true))
ok(() => assert.deepEqual(planWrites(cards, before, must(movePhase(before, "2", 1)), OUT), []))
ok(() => refused(movePhase(before, "2", 3)))
ok(() => refused(movePhase(before, "2", -1)))
ok(() => refused(movePhase(before, "nope", 0)))
// Numbers with gaps are closed by a move, add or remove, and left alone by a rename.
const gappy: PhaseCard[] = [{ id: "a", title: "Phase 2 — A", phase: "2" }, { id: "b", title: "Phase 9 — B", phase: "9" }, { id: "c", title: "Phase 10 — C", phase: "10" }]
ok(() => assert.deepEqual(readPhases(gappy).map((p) => p.number), [2, 9, 10]))
ok(() => assert.deepEqual(must(renamePhase(readPhases(gappy), "9", "Bee")).map((p) => p.number), [2, 9, 10]))
ok(() => assert.deepEqual(names(apply(gappy, planWrites(gappy, readPhases(gappy), must(movePhase(readPhases(gappy), "10", 0)), OUT))), ["1 C", "2 A", "3 B"]))

// Remove: no card is deleted and none is left behind. Every card of the phase goes outside any phase, the heading
// card keeps the phase's name without its number, and later phases close the gap.
const removed = must(removePhase(before, "2"))
ok(() => assert.deepEqual(removed.map((p) => `${p.number} ${p.name}`), ["1 Foundation", "2 Dashboard"]))
const removeWrites = planWrites(cards, before, removed, OUT)
ok(() => assert.equal(removeWrites.some((w) => w.kind !== "patch"), false))
const afterRemove = apply(cards, removeWrites)
ok(() => assert.equal(afterRemove.length, cards.length))
ok(() => assert.deepEqual(["h2", "t2a", "t2b"].map((id) => afterRemove.find((c) => c.id === id)?.phase), [OUT, OUT, OUT]))
ok(() => assert.equal(afterRemove.find((c) => c.id === "h2")?.title, "View Fixes"))
ok(() => assert.deepEqual(names(afterRemove), ["1 Foundation", "2 Dashboard"]))
ok(() => assert.equal(phaseStrip(afterRemove).outside, 5))
ok(() => refused(removePhase(before, "nope")))
// The place removed cards go is never a number and never empty, or they would land in a phase or be refused.
ok(() => assert.throws(() => planWrites(cards, before, removed, "2")))
ok(() => assert.throws(() => planWrites(cards, before, removed, " ")))

// Undo: the opposite writes, last first, put every card back exactly; a card the change made is deleted.
ok(() => assert.deepEqual(apply(afterRemove, invertWrites(removeWrites, cards)), cards))
ok(() => assert.deepEqual(apply(afterMove, invertWrites(planWrites(cards, before, moved, OUT), cards)), cards))
ok(() => assert.deepEqual(apply(apply(cards, planWrites(cards, before, renamed, OUT)), invertWrites(planWrites(cards, before, renamed, OUT), cards)), cards))
const madeId = { [between[1].key]: "real-9" }
const undoBetween = invertWrites(betweenWrites, cards, madeId)
ok(() => assert.deepEqual(undoBetween[0], { kind: "delete", id: "real-9" }))
ok(() => assert.deepEqual(apply(apply(cards, betweenWrites, madeId), undoBetween), cards))
// A card that was never made (the save stopped before it) is not deleted by guesswork.
ok(() => assert.equal(invertWrites(betweenWrites, cards, {}).some((w) => w.kind === "delete"), false))
// Undo only touches what the change touched: a card made elsewhere meanwhile is left alone.
ok(() => assert.equal(invertWrites(removeWrites, cards).every((w) => w.kind === "patch" && ["h2", "t2a", "t2b", "h3"].includes(w.id)), true))

ok(() => assert.equal(headingTitle(3, "Launch"), "Phase 3 — Launch"))
ok(() => assert.equal(JSON.stringify(before), frozen))

console.log(`phase-edit: ${n} checks passed`)
