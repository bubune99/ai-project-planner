// npx -y tsx@4.23.15 lib/net/shared-get.assert.ts
import assert from "node:assert/strict"
import { getJsonShared, reuseGet, SHARED_GET_MS } from "./shared-get"

assert.equal(reuseGet(undefined, 1000, false), false, "nothing read yet")
assert.equal(reuseGet({ at: 1000 }, 1000 + SHARED_GET_MS - 1, false), true, "one read serves the page")
assert.equal(reuseGet({ at: 1000 }, 1000 + SHARED_GET_MS, false), false, "then it is read again")
assert.equal(reuseGet({ at: 1000 }, 1100, true), false, "a reload always reads")
assert.equal(reuseGet({ at: 5000 }, 1000, false), false, "a clock that went back reads again")

// Run it against a counted fetch: three callers at once make one request, each gets its own copy.
let calls = 0
globalThis.fetch = (async (url: string) => {
  calls++
  await new Promise((r) => setTimeout(r, 20))
  if (url.endsWith("/bad")) return new Response(JSON.stringify({ error: { message: "nope" } }), { status: 500 })
  return new Response(JSON.stringify({ data: [3, 1, 2] }), { status: 200 })
}) as typeof fetch

;(async () => {
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => getJsonShared<{ data: number[] }>("/api/x")))
  assert.equal(calls, 1, "three callers at once, one request")
  a.data.sort()
  assert.deepEqual(b.data, [3, 1, 2], "one caller sorting its copy does not reach another")
  assert.notEqual(a, c)
  await getJsonShared("/api/x")
  assert.equal(calls, 1, "a read in the last moment is reused")
  await getJsonShared("/api/x", true)
  assert.equal(calls, 2, "a reload reads again")
  await assert.rejects(getJsonShared("/api/bad"), /nope/, "the server's message comes through")
  await assert.rejects(getJsonShared("/api/bad"), /nope/, "a failed read is not kept")
  assert.equal(calls, 4)
  console.log("shared-get: 12 checks passed")
})()
