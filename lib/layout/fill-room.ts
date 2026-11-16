/**
 * How tall the task board is, so that one scrollbar moves the page.
 *
 * Owner, 2026-11-16, on the task board: "The scroll bar here is a double bar. We only need one and the double makes it
 * hard or difficult to navigate the page". The page's <main> is the one scroller; the board is as tall as the room
 * <main> shows (less a small gap), so scrolling the page down brings the whole board into view and nothing else
 * scrolls beside it. The board's own vertical bar is hidden.
 *
 * Pure; checked in fill-room.assert.ts.
 */
export function boardHeight(scrollerHeight: number, bottomGap = 16, min = 360): number {
  return Math.max(min, Math.floor(scrollerHeight - bottomGap))
}
