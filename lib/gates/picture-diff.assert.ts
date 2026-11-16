// npx -y tsx@4.23.15 lib/gates/picture-diff.assert.ts
import assert from "node:assert/strict"
import { diffBoxes, sameShape } from "./picture-diff"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const W = 120, H = 60
const blank = (v = 240) => { const p = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < p.length; i += 4) { p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255 } return p }
const paint = (p: Uint8ClampedArray, x0: number, y0: number, w: number, h: number, v: number) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * W + x) * 4; p[i] = p[i + 1] = p[i + 2] = v } return p }
const near = (a: number, b: number) => Math.abs(a - b) < 0.06

t("the same picture has nothing to mark", () => {
  assert.deepEqual(diffBoxes(blank(), blank(), W, H), { verdict: "same", boxes: [], changed: 0 })
})

t("noise from compression is not a change", () => {
  const b = blank(); for (let i = 0; i < b.length; i += 16) b[i] = 246
  assert.equal(diffBoxes(blank(), b, W, H).verdict, "same")
})

t("one changed area is one box, around it", () => {
  const d = diffBoxes(blank(), paint(blank(), 60, 12, 30, 18, 30), W, H)
  assert.equal(d.verdict, "some"); assert.equal(d.boxes.length, 1)
  const b = d.boxes[0]
  assert.ok(b.x <= 60 / W && b.x + b.w >= 90 / W && b.y <= 12 / H && b.y + b.h >= 30 / H, "the box covers the change")
  assert.ok(near(b.x, 54 / W) && b.w < 0.45, "and not much more")
})

t("two areas far apart are two boxes, top to bottom", () => {
  const d = diffBoxes(blank(), paint(paint(blank(), 6, 40, 12, 12, 20), 90, 4, 18, 10, 20), W, H)
  assert.equal(d.boxes.length, 2)
  assert.ok(d.boxes[0].y < d.boxes[1].y)
})

t("two areas close together are one box", () => {
  const d = diffBoxes(blank(), paint(paint(blank(), 20, 20, 10, 10, 20), 36, 20, 10, 10, 20), W, H)
  assert.equal(d.boxes.length, 1)
})

t("when most of it changed, it says so instead of boxing everything", () => {
  const d = diffBoxes(blank(240), blank(20), W, H)
  assert.equal(d.verdict, "most"); assert.equal(d.boxes.length, 0); assert.equal(d.changed, 1)
})

t("at most eight boxes, the largest kept", () => {
  const p = blank(); for (let k = 0; k < 12; k++) paint(p, (k % 6) * 20, Math.floor(k / 6) * 36, 2 + (k === 3 ? 8 : 0), 2 + (k === 3 ? 8 : 0), 0)
  const d = diffBoxes(blank(), p, W, H, { cell: 2 })
  assert.ok(d.boxes.length <= 8)
  assert.ok(d.boxes.some((b) => b.w * W >= 10), "the biggest change is kept")
})

t("only pictures of the same shape are compared", () => {
  assert.equal(sameShape(1600, 900, 800, 450), true)
  assert.equal(sameShape(1600, 900, 1600, 920), true)   // 2.2% off
  assert.equal(sameShape(1600, 900, 440, 900), false)
  assert.equal(sameShape(0, 900, 440, 900), false)
})

console.log(`\n${n} picture-diff checks passed`)
