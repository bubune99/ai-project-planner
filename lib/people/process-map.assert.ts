import assert from "node:assert/strict"
import { DIM, LANES, buildProcessMap, checkMap, placeSteps, placeSub, routeLink, type MapNumbers } from "./process-map"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const numbers: MapNumbers = { answered: 3, questions: 9, rules: 16, items: 75, confirmed: 3, dismissed: 3, waiting: 20, taste: 1, secondLook: 0, cleared: 2, total: 162 }
const m = buildProcessMap(numbers)

ok("the map is sound: no two boxes in one place, no line to nowhere, every stage opens to a loop", () => {
  assert.deepEqual(checkMap(m), [])
  assert.equal(m.stages.length, 7)
  assert.equal(m.lanes.length, 6)
})

ok("a broken map is caught", () => {
  const twoInOnePlace = { ...m, steps: [...m.steps, { ...m.steps[0], id: "dup" }] }
  assert.ok(checkMap(twoInOnePlace).some((x) => x.includes("same place")))
  const lineToNowhere = { ...m, links: [...m.links, { from: "say", to: "nope" }] }
  assert.ok(checkMap(lineToNowhere).some((x) => x.includes("not there")))
  const backwardsNotALoop = { ...m, links: [...m.links, { from: "like", to: "say" }] }
  assert.ok(checkMap(backwardsNotALoop).some((x) => x.includes("not drawn as a loop")))
  const unreachable = { ...m, links: m.links.filter((e) => e.to !== "map") }
  assert.ok(checkMap(unreachable).some((x) => x.includes('Nothing leads to "Map the page"')))
})

ok("the numbers on the map are the ones passed in, never made up", () => {
  const text = JSON.stringify(m)
  for (const want of ["3 of 9 answered", "against 16 rules", "75 items", "3 confirmed, 3 dismissed, 20 waiting", "2 of 162"]) assert.ok(text.includes(want), want)
  assert.equal(buildProcessMap({ ...numbers, cleared: 162 }).stages[6].sub, "Passed")
  // Nothing checked yet is not "Passed".
  assert.equal(buildProcessMap({ ...numbers, cleared: 0, total: 0 }).stages[6].sub, "0 of 0 checks cleared")
})

ok("only your steps are in your lane, and every lane but the unbuilt planner agent's does real work", () => {
  assert.equal(LANES[0], "You")
  assert.deepEqual(m.steps.filter((s) => s.lane === 0).map((s) => s.id), ["say", "yours", "taste", "like"])
  assert.deepEqual(m.steps.filter((s) => s.todo).map((s) => s.id), ["draft"])
})

ok("steps sit in their stage's column and their lane's row", () => {
  const p = placeSteps(m)
  assert.equal(p.say.x, p.draft.x)                       // same stage, same column
  assert.equal(p.say.y, p.yours.y)                       // same lane, same row
  assert.equal(p.yours.x - p.say.x, DIM.col)             // next stage, next column
  assert.equal(p.draft.y - p.say.y, DIM.lane)            // next lane, next row
  assert.ok(p.say.x >= DIM.laneLabel)                    // clear of the lane names
})

ok("lines leave forward by the right, or straight up and down inside a column", () => {
  const p = placeSteps(m), r = (from: string, to: string) => routeLink(p[from], p[to], m.links.find((e) => e.from === from && e.to === to)!, false)
  assert.deepEqual([r("draft", "code").from, r("draft", "code").to], ["r", "l"])
  assert.deepEqual([r("say", "draft").from, r("say", "draft").to], ["b", "t"])      // down a lane
  assert.deepEqual([r("code", "yours").from, r("code", "yours").to], ["t", "b"])    // up to you
  assert.equal(r("draft", "code").loop, false)
})

ok("loops come back by the side they left, and the two over the top do not share a height", () => {
  const p = placeSteps(m), r = (from: string, to: string) => routeLink(p[from], p[to], m.links.find((e) => e.from === from && e.to === to)!, false)
  assert.deepEqual([r("auto", "write").from, r("auto", "write").to, r("auto", "write").loop], ["l", "l", true])
  assert.deepEqual([r("cleared", "look").from, r("cleared", "look").to], ["b", "b"])
  assert.notEqual(r("yours", "say").offset, r("like", "say").offset)
  assert.ok(r("like", "say").offset < DIM.header - 74)   // stays under the stage headers
})

ok("inside a stage: a loop to itself is drawn, a way out that skips a box is not called a loop, longer loops stand further off", () => {
  const v = m.subs.validate, p = placeSub(v), r = (from: string, to: string) => routeLink(p[from], p[to], v.edges.find((e) => e.from === from && e.to === to)!, true)
  assert.equal(r("b", "d").loop, false)
  assert.equal(r("e", "a").loop, true)
  assert.ok(r("b", "e").offset > r("b", "d").offset)
  const s = m.subs.scan, self = routeLink(placeSub(s).b, placeSub(s).b, s.edges.find((e) => e.from === "b" && e.to === "b")!, true)
  assert.deepEqual([self.from, self.to, self.loop], ["b", "l", true])
})

console.log(`\n${n} checks passed`)
