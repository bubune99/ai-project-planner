import assert from "node:assert/strict"
import { DITHER, PALETTE, ROWS, SWEEP, buildRamp, cellBase, cellValue, colorAt, gridFor, hexToOklab, hexToRgb, oklabToRgb, paint, shiftAt } from "./dither-grid"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`)
const ramp = buildRamp()

ok("hex to OKLab and back returns the same color", () => {
  for (const { hex } of PALETTE) assert.deepEqual(oklabToRgb(...hexToOklab(hex)), hexToRgb(hex))
})

ok("the palette is gray and only gets lighter", () => {
  for (const { hex } of PALETTE) { const [r, g, b] = hexToRgb(hex); assert.ok(r === g && g === b, hex) }
  let last = -1
  for (let v = -0.4; v <= 1.4; v += 0.01) {
    const [r, g, b] = colorAt(ramp, v)
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 2)
    assert.ok(r >= last); last = r
  }
})

ok("the motion is the original's: 0.5 * sin(0.9 t * -1) * 0.7, from 0, unrounded", () => {
  assert.equal(shiftAt(0), 0)
  for (const t of [0.1, 1, 2.5, 7.3, 40]) near(shiftAt(t), 0.5 * Math.sin(0.9 * t * -1) * 0.7, 1e-12)
  near(SWEEP, 0.35)
  assert.notEqual(shiftAt(1.234), Math.round(shiftAt(1.234) * 1000) / 1000)
})

ok("a cell's position is the original's (place along 78 degrees + slide + dither nudge), not scaled", () => {
  // Sliding the ramp by x moves every cell by exactly x: full speed, nothing squeezed.
  for (const [r, c] of [[0, 0], [7, 30], [19, 113]]) near(cellValue(r, c, 20, 114, 0.2) - cellValue(r, c, 20, 114, 0), 0.2, 1e-12)
  // Corner to corner the ramp covers exactly 0 to 1.
  near(cellBase(0, 0, 20, 114, 0), 0); near(cellBase(19, 113, 20, 114, 0), 1)
  // The dither is the original's strength: dither 50 -> 0.09, so a nudge of at most 0.045 either way.
  assert.equal(DITHER, 0.09)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) assert.ok(Math.abs(cellValue(r, c, 20, 114, 0) - cellBase(r, c, 20, 114, 0)) <= 0.045)
})

ok("the ripple: with 20 rows the step between rows is about the dither nudge, so rows weave", () => {
  assert.equal(ROWS, 20)
  const step = cellBase(1, 0, 20, 114, 0) - cellBase(0, 0, 20, 114, 0)
  assert.ok(step > DITHER * 0.3 && step < DITHER, `row step ${step} vs dither ${DITHER}`)
  // So in about half the neighboring row pairs, some cell in the upper row is lighter than some cell in the lower one.
  const row = (r: number) => Array.from({ length: 8 }, (_, c) => cellValue(r, c, 20, 114, 0))
  let weaving = 0
  for (let r = 0; r < 19; r++) if (Math.max(...row(r)) > Math.min(...row(r + 1))) weaving++
  // The 4x4 pattern makes two of every four row pairs weave: about half.
  assert.ok(weaving >= 8 && weaving <= 12, `${weaving} of 19 row pairs weave`)
})

ok("nothing is ever clamped: the ramp is longer than the banner can reach", () => {
  const lo = PALETTE[0].at, hi = PALETTE[PALETTE.length - 1].at
  for (const shift of [-SWEEP, 0, SWEEP]) for (let r = 0; r < 20; r++) for (let c = 0; c < 114; c += 3) {
    const v = cellValue(r, c, 20, 114, shift)
    assert.ok(v > lo && v < hi, `v=${v}`)
  }
})

ok("no flat areas: at any moment every row has texture and is lighter than the row above", () => {
  const rows = 20, cols = 114
  for (const t of [0, 0.6, 1.2, 1.75, 2.4, 3.1, 3.9, 5.2, 6.4, 8.8]) {
    const data = new Array<number>(rows * cols * 4)
    paint(data, rows, cols, ramp, t)
    const row = (r: number) => Array.from({ length: cols }, (_, c) => data[(r * cols + c) * 4])
    const mean = (r: number) => row(r).reduce((a, b) => a + b, 0) / cols
    for (let r = 0; r < rows; r++) {
      assert.ok(new Set(row(r)).size >= 3, `row ${r} at t=${t} is flat`)
      // Lighter than the row above, always. (Every fourth pair is close: the dither pattern's own
      // rows differ in average, which is part of the weave. Close is fine; equal or darker is not.)
      if (r > 0) assert.ok(mean(r) - mean(r - 1) > 0.3, `rows ${r - 1} and ${r} at t=${t} are the same shade`)
    }
  }
})

ok("the grid is always 20 rows, cells twice as wide as tall, at least 16 columns", () => {
  const g = gridFor(2280, 198)
  assert.equal(g.rows, 20)
  near(2280 / g.cols, (198 / 20) * 2, 0.5)
  assert.equal(gridFor(200, 400).cols, 16)
})

ok("painting fills every cell with an opaque gray", () => {
  const rows = 20, cols = 30, data = new Array<number>(rows * cols * 4).fill(-1)
  paint(data, rows, cols, ramp, 0)
  assert.ok(data.every((v) => v >= 0 && v <= 255))
  assert.equal(data[3], 255)
})

console.log(`\n${n} checks passed`)
