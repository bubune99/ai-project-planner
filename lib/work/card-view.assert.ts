// npx -y tsx@4.23.15 lib/work/card-view.assert.ts
import assert from "node:assert/strict"
import { addPicture, cardPictures, fileUrl, kindLabel, overall, proposalParts, removePicture, stepTree, withoutPictures } from "./card-view"

const A = "https://r2.example.com/a.png", B = "https://r2.example.com/b.png"
// Pictures from the card and from its description, each once; anything not https is ignored.
const md = `Before:\n\n![The board before](${B})\n\n![dup](${A})\n\nAfter text ![x](http://insecure/x.png) ![y](javascript:alert(1))`
const pics = cardPictures({ pictures: [{ url: A, caption: "Kept" }, "nope", { url: "data:image/png;base64,x" }] }, md)
assert.deepEqual(pics, [{ url: A, caption: "Kept" }, { url: B, caption: "The board before" }])
assert.equal(withoutPictures(`One\n\n![p](${A})\n\n\nTwo`), "One\n\n*(Picture below: p)*\n\nTwo")
assert.equal(withoutPictures(`A ![](${A}) ![x](http://bad/x.png)`), "A *(Picture below)*")
// Adding keeps the rest of the card's metadata (the send record), never twice, removing takes one away.
const m = addPicture({ work: { jobId: "j" } }, { url: A, caption: " Board " })
assert.deepEqual(m, { work: { jobId: "j" }, pictures: [{ url: A, caption: "Board" }] })
assert.deepEqual(addPicture(m, { url: A, caption: "again" }), m)
assert.deepEqual(addPicture(m, { url: "http://x", caption: "" }), m)
assert.deepEqual(removePicture(m, A), { work: { jobId: "j" }, pictures: [] })
// An uploaded picture is kept by the planner's own file route (storage is private); other paths are refused.
const own = fileUrl("0b55c011-80a8-4ca7-b458-05b4756b6a03")
assert.equal(own, "/api/documents/0b55c011-80a8-4ca7-b458-05b4756b6a03/file")
assert.deepEqual(addPicture({}, { url: own, caption: "x" }).pictures, [{ url: own, caption: "x" }])
assert.deepEqual(addPicture({}, { url: "/api/admin/x", caption: "x" }).pictures, [])
// A proposal reads as its parts, in the order of a decision; a card that is not one has none.
assert.deepEqual(proposalParts({ proposal: { goal: "G", what: "W", deliverable: "D", proof: "P", why: "Y", useCase: "U" } }).map((p) => p.label + ":" + p.text),
  ["The goal it serves:G (use case: U)", "What it does:W", "What is delivered:D", "How it is proved:P", "Why:Y"])
assert.deepEqual(proposalParts({}), [])
// An initiative shows its tasks and their steps, two levels, with counts; removed ones are left out.
const done = (s: string) => s === "completed"
const all = [
  { id: "t1", title: "Task 1", status: "completed", parent_task_id: "I" },
  { id: "t2", title: "Task 2", status: "pending", parent_task_id: "I" },
  { id: "s1", title: "Step 1", status: "completed", parent_task_id: "t2" },
  { id: "s2", title: "Step 2", status: "pending", parent_task_id: "t2" },
  { id: "s3", title: "Deep", status: "pending", parent_task_id: "s2" },
  { id: "gone", title: "Gone", status: "pending", parent_task_id: "I", deleted_at: "2026-01-01" },
]
const tree = stepTree("I", all, done)
assert.deepEqual(tree.map((r) => `${r.depth}:${r.step.id}:${r.done}/${r.total}`), ["0:t1:0/0", "0:t2:1/2", "1:s1:0/0", "1:s2:0/1"])
assert.deepEqual(overall(tree, 0, done), { done: 1, total: 2, percent: 50 })
assert.deepEqual(overall([], 37.6, done), { done: 0, total: 0, percent: 38 })
assert.equal(kindLabel("initiative"), "Initiative"); assert.equal(kindLabel(null), "Task")
console.log("ok   an opened card shows its pictures, a proposal's parts, its tasks and steps, and how far along it is")
