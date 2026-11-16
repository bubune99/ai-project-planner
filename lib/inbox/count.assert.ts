// npx -y tsx@4.23.15 lib/inbox/count.assert.ts
import assert from "node:assert/strict"
import { countAfter } from "./count"

assert.equal(countAfter(3, -1), 2)          // one answered
assert.equal(countAfter(0, -1), 0)          // never below nothing
assert.equal(countAfter(2, 1), 3)           // an answer taken back
assert.equal(countAfter(2, 0), 2)
assert.equal(countAfter(Number.NaN, -1), 0)
console.log("5 inbox count checks passed")
