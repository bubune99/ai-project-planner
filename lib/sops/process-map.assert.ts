import assert from "node:assert/strict"
import {
  DIM, addInside, addLane, addLink, addNode, addStage, cellAt, cellFree, checkLayer, crumbs, doorOf, indexAt, isLanes, layerAt, moveLane, moveNode, moveStage, parseLayer, parseMapBlock, place, removeInside, removeLane, removeLink, removeNode, removeStage, reorderNode, reroute,
  renameLane, routeLink, seedMap, setLink, setNode, setStage, splitLink, stripMapBlock, walkMap, updateAt, writeMapBlock, type Layer, type Path,
} from "./process-map"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const m = seedMap()
const link = (l: Layer, from: string, to: string) => l.links.find((e) => e.from === from && e.to === to)!

ok("the starting map reads cleanly at every layer, and every stage opens to a loop", () => {
  assert.deepEqual(checkLayer(m), [])
  assert.ok(isLanes(m))
  assert.equal(m.stages!.length, 7); assert.equal(m.lanes!.length, 6)
  for (const s of m.stages!) { assert.ok(s.inside, s.title); assert.deepEqual(checkLayer(s.inside!), [], s.title); assert.ok(s.inside!.links.some((e) => e.via || e.from === e.to), `${s.title} has no loop`) }
  assert.deepEqual(m.nodes.filter((x) => x.you).map((x) => x.id), ["say", "yours", "taste", "like"])
})

ok("it survives being written into a document and read back, and the words around it are kept", () => {
  const text = writeMapBlock("# How we build\n\nRead this first.", m)
  assert.deepEqual(parseMapBlock(text), m)
  assert.equal(stripMapBlock(text), "# How we build\n\nRead this first.")
  const again = writeMapBlock(text, setNode(m, "say", { title: "Say it" }))
  assert.equal(again.match(/```process-map/g)!.length, 1)          // replaced, not added twice
  assert.equal(parseMapBlock(again)!.nodes[0].title, "Say it")
  assert.equal(parseMapBlock("No map here"), null)
  assert.equal(parseMapBlock("```process-map\n{not json\n```"), null)
})

ok("a map that cannot be drawn is refused with the reason", () => {
  const bad = JSON.parse(JSON.stringify(m))
  bad.nodes[0].lane = 9; bad.nodes.push({ ...bad.nodes[1] }); bad.links.push({ from: "say", to: "nowhere" }); bad.nodes[2].title = " "
  const { errors } = parseLayer(bad)
  assert.ok(errors.some((e) => e.includes("not in a stage and lane that exist")))
  assert.ok(errors.some((e) => e.includes('"draft" is used twice')))
  assert.ok(errors.some((e) => e.includes("joins a step that is not there")))
  assert.ok(errors.some((e) => e.includes("has no title")))
  let deep: Layer = { nodes: [{ id: "a", title: "Bottom" }], links: [] }
  for (let i = 0; i < 6; i++) deep = { nodes: [{ id: "a", title: `Level ${i}`, inside: deep }], links: [] }
  assert.ok(parseLayer(deep).errors.some((e) => e.includes("no deeper than")))
  // Unknown fields never reach the stored map.
  assert.equal("evil" in parseLayer({ nodes: [{ id: "a", title: "A", evil: 1 }], links: [] }).layer.nodes[0], false)
})

ok("you can go in, see where you are, and the way back is always there", () => {
  const p1: Path = [doorOf(m, "stage", "validate")!]
  assert.deepEqual(p1, [{ kind: "stage", id: "validate" }])
  assert.deepEqual(doorOf(m, "node", "look"), { kind: "stage", id: "validate" })   // a step opens its stage's loop
  assert.equal(layerAt(m, p1)!.nodes.length, 5)
  assert.deepEqual(crumbs(m, p1), ["5. Validate"])
  const deeper = updateAt(m, p1, (l) => addInside(l, "node", "b")), p2: Path = [...p1, doorOf(layerAt(deeper, p1)!, "node", "b")!]
  assert.deepEqual(crumbs(deeper, p2), ["5. Validate", "Look at the real thing"])
  assert.equal(layerAt(deeper, p2)!.nodes.length, 2)
  assert.equal(layerAt(deeper, p2.slice(0, -1)), layerAt(deeper, p1))               // one step back is the layer you came from
  assert.equal(layerAt(deeper, []), deeper)                                         // all the way back is the whole map
  assert.equal(doorOf(layerAt(m, p1)!, "node", "b"), null)                          // nothing inside: nothing to open
  assert.equal(layerAt(m, [{ kind: "node", id: "gone" }]), null)
})

ok("steps sit in their stage's column and lane's row; without lanes they run left to right", () => {
  const p = place(m)
  assert.equal(p.say.x, p.draft.x); assert.equal(p.say.y, p.yours.y)
  assert.equal(p.yours.x - p.say.x, DIM.col); assert.equal(p.draft.y - p.say.y, DIM.lane)
  const q = place(m.stages![0].inside!)
  assert.deepEqual([q.a.x, q.b.x, q.c.x], [0, DIM.gap, DIM.gap * 2])
})

ok("lines go forward by the right, loops come back by the side they left, and a way out that skips a box is not a loop", () => {
  const p = place(m), r = (from: string, to: string) => routeLink(p[from], p[to], link(m, from, to), true)
  assert.deepEqual([r("draft", "code").from, r("draft", "code").to, r("draft", "code").loop], ["r", "l", false])
  assert.deepEqual([r("code", "yours").from, r("code", "yours").to], ["t", "b"])
  assert.deepEqual([r("auto", "write").from, r("auto", "write").to, r("auto", "write").loop], ["l", "l", true])
  assert.notEqual(r("yours", "say").offset, r("like", "say").offset)
  const v = m.stages![4].inside!, q = place(v), s = (from: string, to: string) => routeLink(q[from], q[to], link(v, from, to), false)
  assert.equal(s("b", "d").loop, false); assert.equal(s("e", "a").loop, true); assert.ok(s("b", "e").offset > s("b", "d").offset)
  const sc = m.stages![3].inside!, self = routeLink(place(sc).b, place(sc).b, link(sc, "b", "b"), false)
  assert.deepEqual([self.from, self.to, self.loop], ["b", "l", true])
})

ok("editing returns a new map and leaves the old one as it was", () => {
  const before = JSON.stringify(m)
  const a = setNode(m, "say", { title: "Tell us what you want", you: false })
  assert.equal(a.nodes[0].title, "Tell us what you want"); assert.equal("you" in a.nodes[0], false)
  assert.equal(setStage(m, "plan", { title: "1. Planning" }).stages![0].title, "1. Planning")
  assert.equal(renameLane(m, 0, "The owner").lanes![0], "The owner")
  assert.equal(setLink(m, 8, { label: "a real error" }).links[8].label, "a real error")
  assert.equal(removeLink(m, 0).links.length, m.links.length - 1)
  assert.equal(JSON.stringify(m), before)
})

ok("a step can be added only where there is room, and removing one takes its lines with it", () => {
  const free = cellAt(m, { x: DIM.laneLabel + 10, y: DIM.lane * 2 + 10 })!
  assert.deepEqual(free, { stage: "plan", lane: 2 }); assert.equal(cellFree(m, free), true)
  assert.equal(cellFree(m, { stage: "plan", lane: 0 }), false)
  assert.equal(cellAt(m, { x: 20, y: 20 }), null)                                   // over the lane names: not a place
  const { layer, id } = addNode(m, { title: "New step", ...free })
  assert.equal(layer.nodes.length, m.nodes.length + 1); assert.ok(!m.nodes.some((x) => x.id === id))
  const gone = removeNode(m, "look")
  assert.ok(!gone.links.some((e) => e.from === "look" || e.to === "look"))
  assert.ok(checkLayer(gone).some((x) => x.includes('Nothing leads to "Judge a matter of taste"')))   // and the gap is pointed out
  const chain = m.stages![0].inside!, after = addNode(chain, { title: "Check it" }, "a")
  assert.deepEqual(after.layer.nodes.map((x) => x.title).slice(0, 3), ["Say what you want", "Check it", "Draft people and use cases"])
})

ok("a new line that goes back is drawn as a loop without being told to", () => {
  const chain = m.stages![5].inside!
  assert.equal(link(addLink(chain, "c", "a", "again"), "c", "a").via, "bottom")
  assert.equal(link(addLink(chain, "a", "c"), "a", "c").via, "top")                               // jumps over a box: goes over it
  assert.equal(link(addLink(removeLink(chain, 0), "a", "b"), "a", "b").via, undefined)            // to the next box: straight
  assert.equal(routeLink(place(chain).d, place(chain).d, link(addLink(chain, "d", "d", "retry"), "d", "d"), false).loop, true)
  assert.equal(link(addLink(m, "taste", "yours", "rethink"), "taste", "yours").via, "top")        // both yours: over the top
  assert.equal(link(addLink(m, "fix", "write", "redo"), "fix", "write").via, "bottom")
  assert.equal(link(addLink(m, "draft", "say", "ask again"), "draft", "say").via, "left")          // same column, against the flow
  assert.equal(addLink(m, "say", "draft"), m)                                                       // already there: unchanged
  assert.ok(checkLayer(addLink(chain, "c", "a")).some((x) => x.includes("does not say why")))
})

ok("giving a step a layer of its own makes it openable, once", () => {
  const chain = m.stages![1].inside!, one = addInside(chain, "node", "b")
  assert.equal(one.nodes[1].inside!.nodes.length, 2)
  assert.equal(addInside(one, "node", "b").nodes[1].inside, one.nodes[1].inside)   // never overwrites what is inside
  assert.deepEqual(removeInside(one, "node", "b"), chain)                           // and it can be taken away again
  assert.equal(doorOf(removeInside(m, "stage", "plan"), "node", "say"), null)       // a stage without a layer: its steps open nothing
})

ok("lanes can be added, moved and removed, and their steps go with them", () => {
  const added = addLane(m, 1, "Designer")
  assert.deepEqual(added.lanes!.slice(0, 3), ["You", "Designer", "Planning agent"])
  assert.equal(added.nodes.find((x) => x.id === "draft")!.lane, 2)            // the planning agent's step moved down with its lane
  assert.equal(added.nodes.find((x) => x.id === "say")!.lane, 0)
  assert.deepEqual(checkLayer(added), [])
  const moved = moveLane(m, 1, 1)
  assert.deepEqual(moved.lanes!.slice(1, 3), ["Builder agent", "Planning agent"])
  assert.equal(moved.nodes.find((x) => x.id === "draft")!.lane, 2); assert.equal(moved.nodes.find((x) => x.id === "write")!.lane, 1)
  assert.equal(moveLane(m, 0, -1), m)                                          // already at the top
  const gone = removeLane(m, 1)
  assert.equal(gone.lanes!.length, 5); assert.ok(!gone.nodes.some((x) => x.id === "draft")); assert.ok(!gone.links.some((e) => e.from === "draft" || e.to === "draft"))
  assert.equal(gone.nodes.find((x) => x.id === "write")!.lane, 1)
  assert.deepEqual(parseLayer(JSON.parse(JSON.stringify(gone))).errors, [])
})

ok("stages can be added, moved and removed", () => {
  const { layer, id } = addStage(m, 1, "Research")
  assert.deepEqual(layer.stages!.slice(0, 3).map((s) => s.title), ["1. Plan", "Research", "2. Intent"])
  assert.ok(place(layer).code.x - place(m).code.x === DIM.col)                 // everything to the right moved over
  assert.ok(checkLayer(layer).includes('Stage "Research" has no steps'))       // and the empty stage is pointed out
  assert.equal(moveStage(layer, id, -1).stages![0].title, "Research")
  const gone = removeStage(m, "scan")
  assert.ok(!gone.nodes.some((x) => x.stage === "scan")); assert.equal(gone.stages!.length, 6)
  assert.deepEqual(parseLayer(JSON.parse(JSON.stringify(gone))).errors, [])
})

ok("a step dropped somewhere else lands in that place, or stays put when the place is taken", () => {
  assert.equal(moveNode(m, "say", { stage: "plan", lane: 1 }), m)              // taken by "Draft people and use cases"
  const moved = moveNode(m, "taste", { stage: "fix", lane: 0 })
  assert.equal(moved.nodes.find((x) => x.id === "taste")!.stage, "fix")
  assert.deepEqual(parseLayer(JSON.parse(JSON.stringify(moved))).errors, [])
  const chain = m.stages![5].inside!, re = reorderNode(chain, "e", 0)
  assert.deepEqual(re.nodes.map((x) => x.id), ["e", "a", "b", "c", "d"])
  assert.equal(indexAt(chain, DIM.gap * 2 + 40), 2); assert.equal(indexAt(chain, -500), 0); assert.equal(indexAt(chain, 99999), 4)
})

ok("after a move, lines are true to where things are: forward ones plain, backward ones loops", () => {
  const chain = m.stages![5].inside!                                            // a > b > c > d > e, and e back to a ("still wrong")
  const re = reorderNode(chain, "e", 0)                                         // e is now first
  assert.equal(link(re, "e", "a").via, undefined)                               // what was a loop now goes forward
  assert.equal(link(re, "d", "e").via, "bottom")                                // and d to e now goes back: a loop
  assert.equal(link(re, "e", "a").label, "still wrong")                         // the words on a line survive
  assert.deepEqual(reroute(m), m)                                               // nothing moved: nothing changes
  for (const s of m.stages!) assert.deepEqual(reroute(s.inside!), s.inside, s.title)
})

ok("a step can be put in the middle of a line", () => {
  const chain = m.stages![0].inside!, i = chain.links.findIndex((e) => e.from === "b" && e.to === "c"), cut = splitLink(chain, i)
  assert.deepEqual(cut.layer.nodes.map((x) => x.id).slice(1, 4), ["b", cut.id, "c"])
  assert.ok(link(cut.layer, "b", cut.id) && link(cut.layer, cut.id, "c")); assert.equal(cut.layer.links.some((e) => e.from === "b" && e.to === "c"), false)
  assert.equal(link(cut.layer, "c", "b").via, "bottom")                         // the loop that was there still loops
  // On a swim lane: room in the next stage of the same lane is used ...
  const j = m.links.findIndex((e) => e.from === "say" && e.to === "draft"), tight = splitLink(m, j)
  assert.equal(tight.layer.stages!.length, 8)                                   // ... and when there is none, a stage is opened for it
  assert.deepEqual(parseLayer(JSON.parse(JSON.stringify(tight.layer))).errors, [])
  const k = m.links.findIndex((e) => e.from === "taste" && e.to === "like"), roomy = splitLink(m, k), put = roomy.layer.nodes.find((x) => x.id === roomy.id)!
  assert.equal(roomy.layer.stages!.length, 7); assert.deepEqual([put.stage, put.lane], ["fix", 0])   // the free place between them, in their lane
  assert.ok(link(roomy.layer, "taste", roomy.id) && link(roomy.layer, roomy.id, "like"))
  const labeled = splitLink(m, m.links.findIndex((e) => e.from === "look" && e.to === "fix"))
  assert.equal(link(labeled.layer, "look", labeled.id).label, "an error")       // the words stay on the first half
})

ok("the walk's own map reads cleanly at every layer and survives being stored", () => {
  const w = walkMap()
  assert.deepEqual(checkLayer(w), [])
  for (const s of w.stages!) { assert.ok(s.inside, s.title); assert.deepEqual(checkLayer(s.inside!), [], s.title) }
  assert.deepEqual(parseMapBlock(writeMapBlock("", w)), w)
  assert.deepEqual(w.nodes.filter((x) => x.you).map((x) => x.id), ["taste"])      // the owner appears once: for preferences
})

console.log(`\n${n} checks passed`)
