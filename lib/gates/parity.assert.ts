// npx -y tsx@4.23.15 lib/gates/parity.assert.ts
import assert from "node:assert/strict"
import { compareChecklists, parityLine } from "./parity"
import type { Checklist, Control, Workflow } from "./gate-model"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }

const flow = (name: string, extra: Partial<Workflow> = {}): Workflow => ({ name, steps: [{ do: "Press it", expect: "It opens", there: ["The panel"] }], ...extra })
const C = (num: number, label: string, kind: string, extra: Partial<Control> = {}): Control => ({ n: num, label, kind, x: 0, y: 0, w: 10, h: 10, states: ["Dark", "Light"], workflows: [flow("Press")], ...extra })
const page = (route: string, controls: Control[], menu: Control[] = []): Checklist => ({
  route,
  views: [{ key: "page", name: "Page", w: 100, h: 100, controls }, ...(menu.length ? [{ key: "menu", name: "Menu open", w: 100, h: 100, controls: menu }] : [])],
})

// The same screen in two sibling projects.
const a = page("/cart", [C(1, "Checkout", "Button"), C(2, "Coupon", "Field"), C(3, "Gift note", "Field"), C(4, "Totals", "Card")], [C(5, "Sign out", "Link")])
const b = page("/cart", [C(7, "Checkout", "Button"), C(8, "Coupon", "Field"), C(9, "Totals", "Card"), C(10, "Pay later", "Button")], [C(11, "Sign out", "Link")])

ok("every control lands in exactly one place: same, different, or in one only", () => {
  const p = compareChecklists(a, b)
  assert.deepEqual(p.rows.map((r) => [r.status, r.label]), [["same", "Checkout"], ["same", "Coupon"], ["only", "Gift note"], ["same", "Totals"], ["same", "Sign out"], ["only", "Pay later"]])
  assert.deepEqual({ same: p.same, different: p.different, onlyA: p.onlyA, onlyB: p.onlyB }, { same: 4, different: 0, onlyA: 1, onlyB: 1 })
  assert.equal(p.rows.length, p.same + p.different + p.onlyA + p.onlyB)
  // Which one has it is said, with the number it carries there.
  const gift = p.rows[2], later = p.rows[5]
  assert.ok(gift.status === "only" && gift.side === "a" && gift.a?.n === 3 && gift.b === undefined)
  assert.ok(later.status === "only" && later.side === "b" && later.b?.n === 10 && later.a === undefined)
  // A control in both carries its number on each side.
  assert.deepEqual([p.rows[0].a?.n, p.rows[0].b?.n], [1, 7])
})

ok("where a control sits, its number, and what a scan said about it are not differences", () => {
  const moved = page("/cart", [C(40, "Checkout", "Button", { x: 50, y: 60, w: 30, h: 20, issues: ["it has no name at all"], draft: true, shared: true })])
  const p = compareChecklists(page("/cart", [C(1, "Checkout", "Button")]), moved)
  assert.deepEqual(p.rows.map((r) => r.status), ["same"])
})

ok("a name written with other capitals or spacing is the same control", () => {
  const p = compareChecklists(page("/cart", [C(1, "Check  out now", "Button")]), page("/cart", [C(1, "check out NOW", "button")]))
  assert.deepEqual(p.rows.map((r) => r.status), ["same"])
})

ok("in both but different says what differs", () => {
  const other = page("/cart", [
    C(1, "Checkout", "Button", { states: ["Dark", "Light", "Phone"], workflows: [flow("Press"), flow("Press twice")] }),
    C(2, "Coupon", "Field", { states: ["Dark"], workflows: [flow("Type", { kind: "states" })] }),
    C(3, "Gift note", "Field", { workflows: [flow("Press", { kind: "look", before: "Cart has one item", steps: [{ do: "Press it", expect: "It opens", there: ["The panel"] }, { do: "Press Esc", expect: "It closes", gone: ["The panel"] }] })] }),
    C(4, "Totals", "Card", { workflows: [flow("Press", { steps: [{ do: "Press it", expect: "It opens a drawer", there: ["The panel"] }] })] }),
  ])
  const p = compareChecklists(a, other)
  const row = (label: string) => { const r = p.rows.find((x) => x.label === label)!; assert.equal(r.status, "different", label); return r.status === "different" ? r.differs : [] }

  assert.deepEqual(row("Checkout"), [
    { what: "states", onlyA: [], onlyB: ["Phone"], say: "States only in B: Phone" },
    { what: "workflows", onlyA: [], onlyB: ["Press twice"], say: "Workflows only in B: Press twice" },
  ])
  assert.deepEqual(row("Coupon").map((d) => d.say), ["States only in A: Light", "Workflows only in A: Press", "Workflows only in B: Type"])
  assert.deepEqual(row("Gift note").map((d) => [d.what, d.workflow, d.say]), [
    ["proves", "Press", "\"Press\" proves function in A and look in B"],
    ["before", "Press", "\"Press\" starts from nothing stated in A and from \"Cart has one item\" in B"],
    ["steps", "Press", "\"Press\" has 1 step in A and 2 in B"],
  ])
  assert.deepEqual(row("Totals").map((d) => d.say), ["\"Press\", step 1: A expects \"It opens\", B expects \"It opens a drawer\""])
  assert.equal(p.different, 4)
})

ok("a workflow with no kind is the same as one marked function, and step lists compare by what they hold", () => {
  const one = page("/x", [C(1, "Save", "Button", { workflows: [flow("Press", { steps: [{ do: "Press it", expect: "Saved", there: ["A", "B"], gone: [] }] })] })])
  const two = page("/x", [C(1, "Save", "Button", { workflows: [flow("Press", { kind: "function", steps: [{ do: "Press it", expect: "Saved", there: ["A", "B"] }] })] })])
  assert.deepEqual(compareChecklists(one, two).rows.map((r) => r.status), ["same"])
  const three = page("/x", [C(1, "Save", "Button", { workflows: [flow("Press", { steps: [{ do: "Press it", expect: "Saved", there: ["A"], gone: ["B"] }] })] })])
  const d = compareChecklists(one, three).rows[0]
  assert.ok(d.status === "different")
  assert.deepEqual(d.status === "different" && d.differs.map((x) => x.say), ["\"Press\", step 1: must be there in A: A, B; in B: A", "\"Press\", step 1: must be gone in A: nothing; in B: B"])
})

ok("the same name as another kind of thing is one control that differs in kind, not two controls", () => {
  const p = compareChecklists(page("/x", [C(1, "Status", "Switch")]), page("/x", [C(1, "Status", "Menu")]))
  assert.equal(p.rows.length, 1)
  const r = p.rows[0]
  assert.ok(r.status === "different")
  assert.deepEqual(r.status === "different" && r.differs[0], { what: "kind", a: "Switch", b: "Menu", say: "It is a Switch in A and a Menu in B" })
})

ok("a control is matched within its own view, and two of the same name pair off in order", () => {
  // "Sign out" on the page in one and in the menu in the other is not the same control.
  const p = compareChecklists(page("/x", [C(1, "Sign out", "Link")]), page("/x", [C(1, "Home", "Link")], [C(2, "Sign out", "Link")]))
  assert.deepEqual(p.rows.map((r) => [r.status, r.view, r.label, r.status === "only" ? r.side : ""]), [["only", "page", "Sign out", "a"], ["only", "page", "Home", "b"], ["only", "menu", "Sign out", "b"]])
  // Three rows with a "Remove" each against two: two pair off, one is left over.
  const q = compareChecklists(page("/x", [C(1, "Remove", "Button"), C(2, "Remove", "Button"), C(3, "Remove", "Button")]), page("/x", [C(1, "Remove", "Button"), C(2, "Remove", "Button")]))
  assert.deepEqual(q.rows.map((r) => r.status), ["same", "same", "only"])
  assert.deepEqual([q.same, q.onlyA], [2, 1])
})

ok("a checklist against itself is all the same, and neither one is changed by comparing", () => {
  const before = JSON.stringify([a, b])
  const p = compareChecklists(a, a)
  assert.deepEqual([p.same, p.different, p.onlyA, p.onlyB], [5, 0, 0, 0])
  compareChecklists(a, b)
  assert.equal(JSON.stringify([a, b]), before)
  assert.deepEqual(compareChecklists(page("/x", []), page("/x", [])).rows, [])
})

ok("it says when the two are not the same screen, and sums up in one line", () => {
  assert.equal(compareChecklists(a, b).sameRoute, true)
  assert.equal(compareChecklists(a, page("/basket", [])).sameRoute, false)
  assert.equal(parityLine(compareChecklists(a, b), "Dzidzor", "BYB"), "4 the same; 1 only in Dzidzor (Gift note); 1 only in BYB (Pay later).")
  assert.equal(parityLine(compareChecklists(a, a)), "5 the same.")
  assert.equal(parityLine(compareChecklists(page("/x", [C(1, "Status", "Switch")]), page("/x", [C(1, "Status", "Menu")]))), "1 in both but different (Status).")
  assert.equal(parityLine(compareChecklists(page("/x", []), page("/x", []))), "Neither has any controls.")
})

console.log(`\n${n} checks passed`)
