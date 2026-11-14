/* Run: npx -y tsx@4.23.15 lib/ui/scroll-edges.assert.ts */
import assert from "node:assert/strict"
import { scrollEdges } from "./scroll-edges"

const none = { before: false, after: false }

// Everything fits: no arrows.
assert.deepEqual(scrollEdges(0, 400, 400), none)
assert.deepEqual(scrollEdges(0, 400, 401.5), none, "a sub-pixel overflow is not more to see")

// More to the right at the start, both in the middle, only back at the end.
assert.deepEqual(scrollEdges(0, 400, 900), { before: false, after: true })
assert.deepEqual(scrollEdges(250, 400, 900), { before: true, after: true })
assert.deepEqual(scrollEdges(500, 400, 900), { before: true, after: false })
assert.deepEqual(scrollEdges(499.2, 400, 900), { before: true, after: false }, "a fraction short of the end is the end")
assert.deepEqual(scrollEdges(1, 400, 900), { before: false, after: true }, "a fraction past the start is the start")

// Right-to-left rows report negative positions.
assert.deepEqual(scrollEdges(-250, 400, 900), { before: true, after: true })

// Not laid out yet, or nonsense: no arrows rather than a wrong one.
assert.deepEqual(scrollEdges(0, 0, 0), none)
assert.deepEqual(scrollEdges(Number.NaN, 400, 900), none)

console.log("scroll-edges: 10 checks passed")
