/*
 * Which sides of a sideways-scrolling row have more to see. Pure, so the rule
 * can be checked without a screen (scroll-edges.assert.ts).
 */

export interface ScrollEdges {
  /** There is content before what is shown (the row has been scrolled). */
  before: boolean
  /** There is content after what is shown. */
  after: boolean
}

/** Sub-pixel layouts report positions a fraction off; within this many pixels counts as the end. */
const SLACK = 2

export function scrollEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): ScrollEdges {
  const values = [scrollLeft, clientWidth, scrollWidth]
  if (values.some((v) => !Number.isFinite(v)) || clientWidth <= 0) return { before: false, after: false }
  const hidden = scrollWidth - clientWidth
  if (hidden <= SLACK) return { before: false, after: false }
  // A right-to-left row reports a negative scrollLeft; distance from the start is what matters.
  const from = Math.abs(scrollLeft)
  return { before: from > SLACK, after: from < hidden - SLACK }
}
