/**
 * The dashboard banner's animated mesh gradient (owner 2026-11-13): the
 * "Red Blue" Bloom Field from 21st.dev, its shape and motion kept, its colors
 * swapped for the planner's (navy, blue, violet, one warm blob).
 *
 * One radial blob per color, each anchored at its own point and layered over
 * a solid backdrop. Motion: each blob drifts on a slow sine around its
 * anchor. Every offset is exactly 0 at phase 0, so nothing snaps when motion
 * starts, and nothing is rounded, so it never steps. Pure: the phase comes
 * in, a CSS background-image string comes out. Checked by
 * mesh-gradient.assert.ts.
 */

export interface Blob {
  /** r, g, b */
  rgb: [number, number, number]
  /** Anchor, in percent of the element. */
  x: number
  y: number
  /** Where the blob has fully faded, in percent. */
  reach: number
  /** Strength at the center, 0 to 1. */
  alpha: number
}

/** Anchors and reaches are the original's; the colors are ours. */
export const BLOBS: readonly Blob[] = [
  { rgb: [16, 26, 51], x: 66.96, y: 42.71, reach: 56.15, alpha: 1 }, // deep navy (was Abyss)
  { rgb: [82, 123, 176], x: 40.53, y: 70.28, reach: 54.05, alpha: 1 }, // accent blue (was Lapis)
  { rgb: [134, 94, 201], x: 45.87, y: 23.93, reach: 46, alpha: 0.9 }, // violet (was Crimson)
  { rgb: [61, 95, 147], x: 74.13, y: 75.93, reach: 68.75, alpha: 1 }, // mid blue (was Crimson)
  { rgb: [72, 52, 132], x: 10.15, y: 39.91, reach: 61.75, alpha: 1 }, // deep violet (was Indigo)
  { rgb: [106, 75, 176], x: 82.7, y: 24.05, reach: 60, alpha: 1 }, // violet (was Indigo)
  { rgb: [214, 90, 62], x: 38.09, y: 90.99, reach: 64.9, alpha: 0.55 }, // the one warm blob (was Crimson)
]

export const BACKDROP = "#20355b"
export const SPEED = 0.2
const AMOUNT = 0.38
const DRIFT = 14
const SEED = 368204337

/** A fixed phase per blob, from the seed. Never animated: it only spreads the blobs' timing apart. */
export function blobPhase(index: number, salt = 0): number {
  const n = Math.sin((SEED % 9973) + index * 12.9898 + salt * 78.233) * 43758.5453
  return (n - Math.floor(n)) * Math.PI * 2
}

/** Where blob `index` is at phase `ph` (percent). Exactly its anchor at ph = 0. */
export function blobAt(index: number, ph: number): { x: number; y: number } {
  const b = BLOBS[index]
  const p = blobPhase(index), p2 = blobPhase(index, 1)
  return {
    x: b.x + (Math.sin(ph * 0.55 + p) - Math.sin(p)) * DRIFT * AMOUNT,
    y: b.y + (Math.sin(ph * 0.43 + p2) - Math.sin(p2)) * DRIFT * AMOUNT,
  }
}

const stop = (b: Blob, share: number, at: number) => `rgba(${b.rgb[0]}, ${b.rgb[1]}, ${b.rgb[2]}, ${+(b.alpha * share).toFixed(3)}) ${at}%`

/** The layered radial gradients for phase `ph` (elapsed seconds times SPEED). */
export function meshBackground(ph: number): string {
  const layers = BLOBS.map((b, i) => {
    const { x, y } = blobAt(i, ph)
    const r = b.reach
    return `radial-gradient(circle at ${x}% ${y}%, ${stop(b, 1, 0)}, ${stop(b, 0.844, r * 0.25)}, ${stop(b, 0.5, r * 0.5)}, ${stop(b, 0.156, r * 0.75)}, ${stop(b, 0, r)})`
  })
  // A soft vignette on top keeps the edges calm and the text readable.
  return [`radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0) 52%, rgba(0, 0, 0, 0.34) 100%)`, ...layers].join(", ")
}
