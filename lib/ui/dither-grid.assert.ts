import assert from "node:assert/strict"
import { DITHER, PALETTE, buildRamp, cellBase, cellValue, centers, colorAt, gridFor, hexToOklab, hexToRgb, oklabToRgb, paint, shiftAt } from "./dither-grid"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`)
const ramp = buildRamp()

ok("colors sit at the middle of their bands (the original's positions 0, 33, 67, 100, 100)", () => {
  const c = centers(PALETTE.map((p) => p.pos))
  ;[0.0825, 0.3325, 0.6675, 0.9175, 1].forEach((v, i) => near(c[i], v, 1e-9))
})

ok("hex to OKLab and back returns the same color", () => {
  for (const { hex } of PALETTE) assert.deepEqual(oklabToRgb(...hexToOklab(hex)), hexToRgb(hex))
})

ok("the ramp starts at the first color, ends at the last, and blends between", () => {
  assert.deepEqual(colorAt(ramp, 0), hexToRgb("#20355b"))
  assert.deepEqual(colorAt(ramp, 0.0825), hexToRgb("#20355b"))
  assert.deepEqual(colorAt(ramp, 0.3325), hexToRgb("#527bb0"))
  assert.deepEqual(colorAt(ramp, 1), hexToRgb("#5a687c"))
  const mid = colorAt(ramp, (0.0825 + 0.3325) / 2)
  assert.ok(mid[2] > 0x5b && mid[2] < 0xb0)
})

ok("motion starts at exactly 0, is a sweep within +/- 0.35, and is not rounded", () => {
  assert.equal(shiftAt(0), 0)
  for (let t = 0; t < 60; t += 0.37) assert.ok(Math.abs(shiftAt(t)) <= 0.35 + 1e-12)
  assert.ok(Math.abs(shiftAt(0.001)) < 0.001)
  assert.notEqual(shiftAt(1.234), Math.round(shiftAt(1.234) * 1000) / 1000)
})

ok("the ramp runs mostly down the grid, a little across", () => {
  const rows = 6, cols = 60
  const down = cellBase(5, 0, rows, cols, 0) - cellBase(0, 0, rows, cols, 0)
  const across = cellBase(0, 59, rows, cols, 0) - cellBase(0, 0, rows, cols, 0)
  near(down + across, 1, 1e-9)
  assert.ok(down > across * 4 && across > 0)
})

ok("the dither only nudges: at most half its strength either way", () => {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const nudge = cellValue(r, c, 9, 9, 0.2) - cellBase(r, c, 9, 9, 0.2)
    // Skip cells the 0..1 clamp cut short.
    if (cellBase(r, c, 9, 9, 0.2) > 0.05 && cellBase(r, c, 9, 9, 0.2) < 0.95) assert.ok(Math.abs(nudge) <= DITHER / 2 + 1e-12)
  }
})

ok("a wide banner gets square, coarse cells", () => {
  const g = gridFor(2280, 172)
  assert.equal(g.rows, 6)
  near(2280 / g.cols, 172 / g.rows, 1.5)
  assert.equal(gridFor(320, 2000).rows, 20)
  assert.equal(gridFor(900, 60).rows, 4)
})

ok("painting fills every cell with an opaque color, dark at the top and lighter below", () => {
  const rows = 6, cols = 20, data = new Array<number>(rows * cols * 4).fill(-1)
  paint(data, rows, cols, ramp, 0)
  assert.ok(data.every((v) => v >= 0 && v <= 255))
  assert.equal(data[3], 255)
  const sum = (i: number) => data[i] + data[i + 1] + data[i + 2]
  assert.ok(sum(0) < sum((rows - 2) * cols * 4))
})

console.log(`\n${n} checks passed`)
