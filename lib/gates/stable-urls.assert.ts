// npx -y tsx@4.23.15 lib/gates/stable-urls.assert.ts
import assert from "node:assert/strict"
import { KEEP_MS, stableUrls } from "./stable-urls"

const pic = (key: string, url: string, capturedAt = "2026-11-14T03:00:00Z") => ({ kind: "view", key, url, capturedAt })
let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }

t("the same picture keeps its first address across reloads", () => {
  const a = stableUrls([pic("page@1", "https://x/a?sig=1")], {}, 0)
  const b = stableUrls([pic("page@1", "https://x/a?sig=2")], a.kept, 6000)
  assert.equal(b.images[0].url, "https://x/a?sig=1")
  const c = stableUrls([pic("page@1", "https://x/a?sig=3")], b.kept, 12000)
  assert.equal(c.images[0].url, "https://x/a?sig=1")
})

t("a retaken picture takes its new address", () => {
  const a = stableUrls([pic("page@1", "https://x/a?sig=1")], {}, 0)
  const b = stableUrls([pic("page@1", "https://x/b?sig=2", "2026-11-15T01:00:00Z")], a.kept, 6000)
  assert.equal(b.images[0].url, "https://x/b?sig=2")
})

t("an address is replaced before it can expire", () => {
  const a = stableUrls([pic("page@1", "https://x/a?sig=1")], {}, 0)
  const b = stableUrls([pic("page@1", "https://x/a?sig=9")], a.kept, KEEP_MS + 1)
  assert.equal(b.images[0].url, "https://x/a?sig=9")
  const c = stableUrls([pic("page@1", "https://x/a?sig=10")], b.kept, KEEP_MS + 6000)
  assert.equal(c.images[0].url, "https://x/a?sig=9")
})

t("pictures are told apart by kind and key, and gone ones are forgotten", () => {
  const a = stableUrls([pic("page@1", "u1"), { kind: "evidence", key: "page@1", url: "e1", capturedAt: "t" }], {}, 0)
  const b = stableUrls([{ kind: "evidence", key: "page@1", url: "e2", capturedAt: "t" }], a.kept, 1000)
  assert.equal(b.images[0].url, "e1")
  assert.equal(Object.keys(b.kept).length, 1)
})

t("an unchanged picture is the same object, so nothing redraws", () => {
  const first = pic("page@1", "u1")
  const a = stableUrls([first], {}, 0)
  assert.equal(a.images[0], first)
})

console.log(`\n${n} stable-urls checks passed`)
