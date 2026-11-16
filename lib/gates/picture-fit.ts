/**
 * How wide to draw a picture that is much wider than the box it sits in.
 *
 * Shrinking a 3,440-pixel screenshot into a 400-pixel box makes it about a ninth of its size: nothing in it can be
 * read. Such a picture is drawn wider than its box, and the box scrolls sideways. A picture that fits, or nearly
 * fits, is left alone.
 *
 * Pure. Checked in picture-fit.assert.ts.
 */
export function readableWidth(natural: number, box: number): number | null {
  if (!(natural > 0) || !(box > 0)) return null
  // Left alone while shrinking keeps it at 55% of its size or more.
  if (box / natural >= 0.55) return null
  // Otherwise drawn at 55% of its size, never narrower than the box and never wider than 1,400.
  return Math.round(Math.max(box, Math.min(1400, natural * 0.55)))
}
