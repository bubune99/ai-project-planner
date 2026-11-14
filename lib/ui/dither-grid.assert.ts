import assert from "node:assert/strict"
import { DITHER, PALETTE, SWEEP, buildRamp, cellBase, cellValue, centers, colorAt, gridFor, hexToOklab, hexToRgb, oklabToRgb, paint, shiftAt } from "./dither-grid"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`)
const ramp = buildRamp()

ok("colors sit at the middle of their bands (the original's positions 0, 33, 67, 100)", () => {
  const c = centers(PALETTE.map((p) => p.pos))
  ;[0.0825, 0.3325, 0.6675, 0.9175].forEach((v, i) => near(c[i], v, 1e-9))
})

ok("hex to OKLab and back returns the same color", () => {
  for (const { hex } of PALETTE) assert.deepEqual(oklabToRgb(...hexToOklab(hex)), hexToRgb(hex))
})

ok("the ramp starts at the first color, ends at the last, and blends between", () => {
  const sorted = [...PALETTE].sort((x, y) => x.pos - y.pos)
  assert.deepEqual(colorAt(ramp, 0), hexToRgb(sorted[0].hex))
  assert.deepEqual(colorAt(ramp, 0.0825), hexToRgb(sorted[0].hex))
  assert.deepEqual(colorAt(ramp, 0.3325), hexToRgb(sorted[1].hex))
  assert.deepEqual(colorAt(ramp, 1), hexToRgb(sorted[sorted.length - 1].hex))
  const mid = colorAt(ramp, (0.0825 + 0.3325) / 2)
  assert.ok(mid[2] > hexToRgb(sorted[0].hex)[2] && mid[2] < hexToRgb(sorted[1].hex)[2])
})

ok("the palette is gray: no color has a hue", () => {
  for (const { hex } of PALETTE) { const [r, g, b] = hexToRgb(hex); assert.ok(r === g && g === b, hex) }
  // Blends between grays stay gray too.
  for (let v = 0; v <= 1; v += 0.05) { const [r, g, b] = colorAt(ramp, v); assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 2) }
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

ok("the ramp only gets lighter", () => {
  let last = -1
  for (let v = 0.0825; v <= 0.9175; v += 0.01) { const g = colorAt(ramp, v)[0]; assert.ok(g >= last); last = g }
})

ok("nothing is ever clamped: every cell stays between the first and last color, slide and nudge included", () => {
  const lo = ramp.centers[0], hi = ramp.centers[ramp.centers.length - 1]
  for (const shift of [-SWEEP, -0.2, 0, 0.2, SWEEP]) for (let r = 0; r < 7; r++) for (let c = 0; c < 81; c += 5) {
    const v = cellValue(r, c, 7, 81, shift, ramp)
    assert.ok(v >= lo - 1e-12 && v <= hi + 1e-12)
  }
  // The dither spreads neighbors apart by its strength, scaled with the rest.
  const vals = [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => cellValue(r, c, 400, 400, 0, ramp)))
  const spread = Math.max(...vals) - Math.min(...vals)
  assert.ok(spread > 0.05 && spread < DITHER)
})

ok("no flat areas: at any moment every row is its own shade and every row has texture", () => {
  const rows = 7, cols = 81
  for (const t of [0, 0.6, 1.2, 1.75, 2.4, 3.1, 3.9, 5.2, 6.4, 8.8]) {
    const data = new Array<number>(rows * cols * 4)
    paint(data, rows, cols, ramp, t)
    const row = (r: number) => Array.from({ length: cols }, (_, c) => data[(r * cols + c) * 4])
    const mean = (r: number) => row(r).reduce((a, b) => a + b, 0) / cols
    for (let r = 0; r < rows; r++) {
      // Texture: a row is never one flat color.
      assert.ok(new Set(row(r)).size >= 3, `row ${r} at t=${t} is flat`)
      // Gradient: neighboring rows are different shades.
      if (r > 0) assert.ok(Math.abs(mean(r) - mean(r - 1)) >= 1, `rows ${r - 1} and ${r} at t=${t} are the same shade`)
    }
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
