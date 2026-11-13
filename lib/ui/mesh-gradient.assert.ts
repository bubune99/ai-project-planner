import assert from "node:assert/strict"
import { BLOBS, blobAt, blobPhase, meshBackground } from "./mesh-gradient"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }

ok("at the start every blob is exactly on its anchor (no snap)", () => {
  BLOBS.forEach((b, i) => assert.deepEqual(blobAt(i, 0), { x: b.x, y: b.y }))
})

ok("motion is continuous: a tiny step in time is a tiny step in place", () => {
  for (let i = 0; i < BLOBS.length; i++) {
    for (const ph of [0, 1.3, 7.9, 42]) {
      const a = blobAt(i, ph), b = blobAt(i, ph + 0.001)
      assert.ok(Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01)
    }
  }
})

ok("values are not rounded, so the drift never steps", () => {
  const { x } = blobAt(0, 3.21)
  assert.notEqual(x, Math.round(x * 10) / 10)
  assert.match(meshBackground(3.21), /circle at \d+\.\d{4,}% \d+\.\d{4,}%/)
})

ok("each blob stays near its anchor", () => {
  for (let i = 0; i < BLOBS.length; i++) for (let ph = 0; ph < 200; ph += 0.7) {
    const p = blobAt(i, ph)
    assert.ok(Math.abs(p.x - BLOBS[i].x) <= 14 * 0.38 * 2 + 1e-9 && Math.abs(p.y - BLOBS[i].y) <= 14 * 0.38 * 2 + 1e-9)
  }
})

ok("blobs have different, fixed phases", () => {
  const phases = BLOBS.map((_, i) => blobPhase(i))
  assert.equal(new Set(phases.map((p) => p.toFixed(6))).size, BLOBS.length)
  assert.deepEqual(phases, BLOBS.map((_, i) => blobPhase(i)))
})

ok("one layer per blob plus the vignette", () => {
  assert.equal(meshBackground(0).split("radial-gradient(").length - 1, BLOBS.length + 1)
})

console.log(`\n${n} checks passed`)
