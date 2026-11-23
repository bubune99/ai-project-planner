// npx -y tsx@4.23.15 lib/inbox/count.assert.ts
import assert from "node:assert/strict"
import { countAfter, reuseRead, SHARED_READ_MS } from "./count"

assert.equal(countAfter(3, -1), 2)          // one answered
assert.equal(countAfter(0, -1), 0)          // never below nothing
assert.equal(countAfter(2, 1), 3)           // an answer taken back
assert.equal(countAfter(2, 0), 2)
assert.equal(countAfter(Number.NaN, -1), 0)
assert.equal(reuseRead(null, 1000, false), false)                       // nothing read yet
assert.equal(reuseRead({ at: 1000 }, 1000 + SHARED_READ_MS - 1, false), true) // one read serves the page
assert.equal(reuseRead({ at: 1000 }, 1000 + SHARED_READ_MS, false), false)     // then it is read again
assert.equal(reuseRead({ at: 1000 }, 1200, true), false)                       // a reload after a press always reads
assert.equal(reuseRead({ at: 5000 }, 1000, false), false)                      // a clock that went back reads again
console.log("10 inbox count checks passed")
