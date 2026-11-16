/**
 * Where each ring of a ringed graph sits.
 *
 * The knowledge graph draws each kind of thing on its own circle. The circles were a fixed 160 pixels apart starting
 * at 220, with the largest kind on the smallest circle, so 18 boxes about 220 pixels wide shared a circle that had
 * room for six and were drawn on top of each other. A ring is now at least large enough for its boxes to sit side by
 * side, and never closer to the ring inside it than `step`.
 *
 * Pure. Checked in ring-layout.assert.ts.
 */
export interface RingOptions { base?: number; step?: number; spacing?: number }

/** The radius of each ring, innermost first, for the number of boxes on each. */
export function ringRadii(counts: number[], { base = 220, step = 160, spacing = 250 }: RingOptions = {}): number[] {
  const out: number[] = []
  for (let i = 0; i < counts.length; i++) {
    const fits = (Math.max(counts[i], 0) * spacing) / (2 * Math.PI)
    const least = i === 0 ? base : out[i - 1] + step
    out.push(Math.ceil(Math.max(least, fits)))
  }
  return out
}

/** The kinds in ring order: fewest boxes innermost, so the small circles hold the small groups. Ties keep name order. */
export function ringOrder(byKind: Record<string, number>): string[] {
  return Object.keys(byKind).sort((a, b) => byKind[a] - byKind[b] || a.localeCompare(b))
}

/** The distance along the circle between neighbors on a ring: at least `spacing` when the ring was sized by ringRadii. */
export function gapOnRing(radius: number, count: number): number {
  return count <= 1 ? Infinity : (2 * Math.PI * radius) / count
}
