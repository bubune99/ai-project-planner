// npx -y tsx@4.23.15 lib/db/text-array.assert.ts
import assert from "node:assert/strict"
import { textArray } from "./text-array"

assert.deepEqual(textArray(undefined), [])
assert.deepEqual(textArray(null), [])
assert.deepEqual(textArray("[]"), [], "JSON text is not a list")
assert.deepEqual(textArray([]), [])
assert.deepEqual(textArray(["a", " b ", "", 3, null, { x: 1 }]), ["a", "b", "3"])
assert.ok(Array.isArray(textArray(["x"])), "an array, never a string")
console.log("4 text-array checks passed")
