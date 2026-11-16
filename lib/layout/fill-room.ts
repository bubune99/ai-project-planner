/**
 * How tall a scrolling area may be so the page around it does not scroll as well.
 *
 * Owner, 2026-11-16, on the task board: "The scroll bar here is a double bar. We only need one and the double makes it
 * hard or difficult to navigate the page". The board was sized by the window (100vh - 330px) while the page above it was
 * taller than 330px, so the page scrolled and the board scrolled. The room is what is left of the page's own scroller
 * below where the area starts.
 *
 * Pure; checked in fill-room.assert.ts.
 */
export function roomBelow(scrollerHeight: number, topInScroller: number, bottomGap = 16, min = 360): number {
  const room = Math.floor(scrollerHeight - topInScroller - bottomGap)
  return Math.max(min, room)
}
