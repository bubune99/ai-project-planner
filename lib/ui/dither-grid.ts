/**
 * The dashboard banner's animated background (owner 2026-11-13): the
 * "sunset/sunrise" Dither Grid from 21st.dev, drawn the way the original
 * draws it, with the sunset colors swapped for grays.
 *
 * How it works: a coarse grid of cells is stretched over the banner. Each
 * cell has a position along a ramp that runs at ANGLE across the grid; a 4x4
 * ordered (Bayer) pattern nudges that position slightly, which is the dither;
 * the cell's color is the palette blended in OKLab at that position. Motion
 * slides the whole ramp back and forth on a sine sweep: exactly 0 at t = 0,
 * never rounded. Pure: time and cell go in, a color comes out. Checked by
 * dither-grid.assert.ts.
 *
 * Kept exactly as the original: the 20 rows, the 78 degree ramp, the dither
 * strength and the motion. With 20 rows the step from one row to the next is
 * about the size of the dither nudge, so rows weave into each other as the
 * ramp slides; that weave is the ripple. One thing differs: the original
 * clamps the ramp at its ends, which leaves flat bands at the top and bottom
 * whenever the slide runs past them. Here the ramp is simply longer than the
 * banner needs, so there is always more gradient to slide into.
 */

export type Rgb = [number, number, number]

/**
 * The ramp in grays (owner 2026-11-13: a grayscale gradient), by position.
 * The banner itself spans 0 to 1; the slide moves it up to SWEEP either way
 * and the dither a little more, so the ramp runs from -0.4 to 1.4 at an even
 * rate. Nothing is ever clamped: every row is its own shade at every moment.
 */
export const PALETTE: readonly { hex: string; at: number }[] = [
  { hex: "#1a1a1a", at: -0.4 },
  { hex: "#343434", at: 0.05 },
  { hex: "#636363", at: 0.5 },
  { hex: "#969696", at: 0.95 },
  // The light end stops at a soft gray: near-white was too bright (owner 2026-11-13).
  { hex: "#b8b8b8", at: 1.4 },
]

export const ANGLE = 78
/** How far the ordered pattern nudges a cell along the ramp: dither 50 in the original (50 / 100 * 0.18). */
export const DITHER = 0.09
const SPEED = 1
const AMOUNT = 0.7
const REVERSE = -1

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function hexToOklab(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex).map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

export function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return lin.map((v) => Math.min(255, Math.max(0, Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055))))) as Rgb
}

export interface Ramp { at: number[]; oklab: Rgb[]; rgb: Rgb[] }

export function buildRamp(palette: readonly { hex: string; at: number }[] = PALETTE): Ramp {
  const sorted = [...palette].sort((a, b) => a.at - b.at)
  return { at: sorted.map((c) => c.at), oklab: sorted.map((c) => hexToOklab(c.hex)), rgb: sorted.map((c) => hexToRgb(c.hex)) }
}

/** The color at position v on the ramp, blended in OKLab between the two nearest stops. */
export function colorAt(ramp: Ramp, v: number): Rgb {
  const { at, oklab, rgb } = ramp
  if (v <= at[0]) return rgb[0]
  if (v >= at[at.length - 1]) return rgb[rgb.length - 1]
  for (let i = 0; i < at.length - 1; i++) {
    if (v < at[i] || v > at[i + 1]) continue
    const f = (v - at[i]) / Math.max(1e-6, at[i + 1] - at[i])
    const a = oklab[i], b = oklab[i + 1]
    return oklabToRgb(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f)
  }
  return rgb[rgb.length - 1]
}

/** The furthest the ramp slides either way. */
export const SWEEP = 0.5 * AMOUNT

/** How far the ramp has slid at `seconds`. A sine sweep, not a wrapping scroll; 0 at the start. */
export function shiftAt(seconds: number): number {
  if (!(seconds > 0)) return 0
  return 0.5 * Math.sin(0.9 * seconds * SPEED * REVERSE) * AMOUNT
}

/** A cell's position on the ramp before the dither nudge: its place along ANGLE, plus the slide. */
export function cellBase(row: number, col: number, rows: number, cols: number, shift: number): number {
  const a = (ANGLE * Math.PI) / 180
  const cx = Math.abs(Math.cos(a)), cy = Math.abs(Math.sin(a)), m = cx + cy || 1
  return ((cols > 1 ? col / (cols - 1) : 0) * cx) / m + ((rows > 1 ? row / (rows - 1) : 0) * cy) / m + shift
}

/** A cell's position on the ramp: its place along ANGLE, the slide, and its ordered-dither nudge. Same as the original, minus the clamp. */
export function cellValue(row: number, col: number, rows: number, cols: number, shift: number): number {
  return cellBase(row, col, rows, cols, shift) + (BAYER[row % 4][col % 4] / 16 - 0.5) * DITHER
}

/** The original's row count. It sets the ripple, so it does not change with the banner's size. */
export const ROWS = 20

/**
 * The grid for a banner of this size: always 20 rows, with cells twice as
 * wide as they are tall (the original's 16 x 20 on its card), and never fewer
 * than the original's 16 columns.
 */
export function gridFor(width: number, height: number): { cols: number; rows: number } {
  const cellHeight = Math.max(1, height) / ROWS
  return { rows: ROWS, cols: Math.max(16, Math.round(width / (cellHeight * 2))) }
}

/** Paint the whole grid into RGBA bytes (one pixel per cell). */
export function paint(data: Uint8ClampedArray | number[], rows: number, cols: number, ramp: Ramp, seconds: number): void {
  const shift = shiftAt(seconds)
  let k = 0
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const [R, G, B] = colorAt(ramp, cellValue(r, c, rows, cols, shift))
    data[k++] = R; data[k++] = G; data[k++] = B; data[k++] = 255
  }
}
