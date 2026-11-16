// npx -y tsx@4.23.15 lib/people/flow-layout.assert.ts
import assert from "node:assert/strict"
import { flowLayout, perRowFor } from "./flow-layout"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }

t("steps run left to right, then turn and come back", () => {
  const { boxes } = flowLayout(7, { perRow: 3 })
  assert.deepEqual(boxes.map((b) => [b.row, b.col]), [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [2, 0]])
})

t("every join is between neighbors, and leaves and arrives on the facing sides", () => {
  const { boxes, joins } = flowLayout(7, { perRow: 3 })
  assert.equal(joins.length, 6)
  for (const j of joins) { const a = boxes[j.from], b = boxes[j.to]; assert.equal(Math.abs(a.row - b.row) + Math.abs(a.col - b.col), 1) }
  assert.deepEqual(joins.map((j) => j.out + j.into), ["rl", "rl", "bt", "lr", "lr", "bt"])
})

t("no two steps share a place, and the drawing's size is what the steps take up", () => {
  const { boxes, width, height } = flowLayout(10, { perRow: 4, w: 280, h: 250, gapX: 70, gapY: 70 })
  assert.equal(new Set(boxes.map((b) => `${b.x},${b.y}`)).size, 10)
  assert.equal(width, 4 * 280 + 3 * 70)
  assert.equal(height, 3 * 250 + 2 * 70)
})

t("one step, no steps, and a single column all hold", () => {
  assert.deepEqual(flowLayout(0), { boxes: [], joins: [], width: 0, height: 0 })
  assert.equal(flowLayout(1).joins.length, 0)
  assert.deepEqual(flowLayout(3, { perRow: 1 }).joins.map((j) => j.out + j.into), ["bt", "bt"])
})

t("how many fit across follows the room: one on a phone, more on a wide screen", () => {
  assert.equal(perRowFor(380), 1)
  assert.equal(perRowFor(700), 2)
  assert.equal(perRowFor(1400), 4)
  assert.equal(perRowFor(0), 1)
})

console.log(`\n${n} flow-layout checks passed`)
