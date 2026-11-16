/**
 * What changed between a before and an after picture, as a few boxes.
 *
 * Owner, 2026-11-16: "is there a way that we can get a highlight of the changes before and after in the images so
 * that I am not playing where is waldo?" Both pictures are drawn at the same small size, split into cells, and a cell
 * whose colors moved more than a little counts as changed. Touching changed cells become one box. Boxes are given as
 * fractions of the picture, so they can be laid over it at any size.
 *
 * Pure: pixels in, boxes out. Checked in picture-diff.assert.ts.
 */
export interface Box { x: number; y: number; w: number; h: number }
export interface Diff {
  /** "same": nothing changed; "some": boxes mark it; "most": most of it changed, boxes would not help; "shape": the pictures are not the same shape. */
  verdict: "same" | "some" | "most" | "shape"
  boxes: Box[]
  /** Share of the picture that changed, 0 to 1. */
  changed: number
}

/** May two pictures be compared cell by cell? Only when they have the same shape (within 3%). */
export function sameShape(aw: number, ah: number, bw: number, bh: number): boolean {
  if (!(aw > 0 && ah > 0 && bw > 0 && bh > 0)) return false
  return Math.abs(aw / ah - bw / bh) / (aw / ah) <= 0.03
}

/**
 * Compare two RGBA pixel arrays of the same width and height.
 * cell: size of a cell in pixels; level: how far (0 to 255, the mean over red, green and blue) a cell must move to count.
 */
export function diffBoxes(a: ArrayLike<number>, b: ArrayLike<number>, width: number, height: number, { cell = 6, level = 16, most = 0.6, max = 8 } = {}): Diff {
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell)
  const hot = new Uint8Array(cols * rows)
  let hotCount = 0
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let sum = 0, n = 0
    for (let y = r * cell; y < Math.min(height, (r + 1) * cell); y++) for (let x = c * cell; x < Math.min(width, (c + 1) * cell); x++) {
      const i = (y * width + x) * 4
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3
    }
    if (n && sum / n > level) { hot[r * cols + c] = 1; hotCount++ }
  }
  const changed = hotCount / (cols * rows || 1)
  if (!hotCount) return { verdict: "same", boxes: [], changed: 0 }
  if (changed >= most) return { verdict: "most", boxes: [], changed }
  // Touching changed cells (including corners, and across a one-cell gap) are one change.
  const seen = new Uint8Array(cols * rows)
  let boxes: { c0: number; r0: number; c1: number; r1: number; n: number }[] = []
  for (let i = 0; i < hot.length; i++) {
    if (!hot[i] || seen[i]) continue
    const stack = [i]; seen[i] = 1
    let c0 = cols, r0 = rows, c1 = -1, r1 = -1, n = 0
    while (stack.length) {
      const k = stack.pop()!, r = Math.floor(k / cols), c = k % cols
      n++; if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue
        const j = rr * cols + cc
        if (hot[j] && !seen[j]) { seen[j] = 1; stack.push(j) }
      }
    }
    boxes.push({ c0, r0, c1, r1, n })
  }
  // Boxes that overlap once padded by a cell are one change.
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j]
      if (p.c0 - 1 <= q.c1 + 1 && q.c0 - 1 <= p.c1 + 1 && p.r0 - 1 <= q.r1 + 1 && q.r0 - 1 <= p.r1 + 1) {
        boxes[i] = { c0: Math.min(p.c0, q.c0), r0: Math.min(p.r0, q.r0), c1: Math.max(p.c1, q.c1), r1: Math.max(p.r1, q.r1), n: p.n + q.n }
        boxes.splice(j, 1); merged = true; break outer
      }
    }
  }
  boxes = boxes.sort((p, q) => q.n - p.n).slice(0, max)
  const pad = 1
  return {
    verdict: "some",
    changed,
    boxes: boxes
      .sort((p, q) => p.r0 - q.r0 || p.c0 - q.c0)
      .map((p) => {
        const x0 = Math.max(0, (p.c0 - pad) * cell), y0 = Math.max(0, (p.r0 - pad) * cell)
        const x1 = Math.min(width, (p.c1 + 1 + pad) * cell), y1 = Math.min(height, (p.r1 + 1 + pad) * cell)
        return { x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height }
      }),
  }
}
