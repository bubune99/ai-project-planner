/**
 * Where the steps of a use case sit when it is drawn as a flow.
 *
 * Owner, 2026-11-16: "people and flows also needs the same react flow ability for visualization ... along with the
 * pictures that are there". A use case is a run of steps in order. Drawn left to right it would be one very long
 * line, so it turns at the end of each row and comes back, like a path: step 4 sits under step 3, not back at the
 * far left, and every join is short.
 *
 * Pure. Checked in flow-layout.assert.ts.
 */
export type Side = "t" | "r" | "b" | "l"
export interface Placed { index: number; x: number; y: number; row: number; col: number }
export interface Join { from: number; to: number; out: Side; into: Side }
export interface LayoutOptions { perRow?: number; w?: number; h?: number; gapX?: number; gapY?: number }

/** How many steps fit across, for the room there is. Never fewer than one. */
export function perRowFor(width: number, w = 280, gapX = 70): number {
  return Math.max(1, Math.floor((Math.max(0, width) + gapX) / (w + gapX)))
}

export function flowLayout(count: number, { perRow = 4, w = 280, h = 250, gapX = 70, gapY = 70 }: LayoutOptions = {}): { boxes: Placed[]; joins: Join[]; width: number; height: number } {
  const n = Math.max(0, Math.floor(count)), per = Math.max(1, Math.floor(perRow))
  const boxes: Placed[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per), k = i % per
    const col = row % 2 === 0 ? k : per - 1 - k          // odd rows run right to left
    boxes.push({ index: i, x: col * (w + gapX), y: row * (h + gapY), row, col })
  }
  const joins: Join[] = []
  for (let i = 0; i + 1 < n; i++) {
    const a = boxes[i], b = boxes[i + 1]
    joins.push(a.row !== b.row ? { from: i, to: i + 1, out: "b", into: "t" } : b.col > a.col ? { from: i, to: i + 1, out: "r", into: "l" } : { from: i, to: i + 1, out: "l", into: "r" })
  }
  const cols = Math.min(per, n), rows = Math.ceil(n / per)
  return { boxes, joins, width: cols ? cols * w + (cols - 1) * gapX : 0, height: rows ? rows * h + (rows - 1) * gapY : 0 }
}
