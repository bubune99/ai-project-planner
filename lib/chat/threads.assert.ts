import assert from "node:assert/strict"
import { MAX_THREADS, NEW_TITLE, addThread, closeDecision, closeThread, deriveStatus, fromSaved, newThread, openSaved, revealStart, tabWindow, titleFrom, toSaved, type Thread } from "./threads"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const id = (k: number) => `00000000-0000-4000-8000-00000000000${k}`
const done = (k: number, title = `T${k}`): Thread => ({ id: id(k), title, status: "done" })

ok("status follows the stream", () => {
  assert.equal(deriveStatus("submitted", 1), "thinking")
  assert.equal(deriveStatus("streaming", 2), "thinking")
  assert.equal(deriveStatus("error", 2), "error")
  assert.equal(deriveStatus("ready", 0), "idle")
  assert.equal(deriveStatus("ready", 2), "done")
})

ok("a tab is named after the first question, shortened", () => {
  assert.equal(titleFrom("  What   changed?  "), "What changed?")
  assert.equal(titleFrom("x".repeat(60)).length, 28)
  assert.ok(titleFrom("x".repeat(60)).endsWith("…"))
  assert.equal(titleFrom("   "), NEW_TITLE)
})

ok("opening is capped and never duplicates", () => {
  let ts: Thread[] = []
  for (let k = 1; k <= MAX_THREADS; k++) { const r = addThread(ts, newThread(id(k))); assert.ok(r.ok); if (r.ok) ts = r.threads }
  assert.equal(ts.length, MAX_THREADS)
  const full = addThread(ts, newThread(id(9)))
  assert.equal(full.ok, false)
  const again = addThread(ts, newThread(id(1)))
  assert.ok(again.ok && again.threads.length === MAX_THREADS)
})

ok("a saved conversation replaces an unused new chat, otherwise gets its own tab", () => {
  const fresh = newThread(id(1))
  const a = openSaved([fresh], fresh.id, id(2), "Old one")
  assert.ok(a.ok && a.threads.length === 1 && a.threads[0].id === id(2) && a.threads[0].title === "Old one" && !a.threads[0].fresh)
  const b = openSaved([done(1)], id(1), id(2), "Old one")
  assert.ok(b.ok && b.threads.length === 2)
  const c = openSaved([done(1), done(2)], id(1), id(2), "x")
  assert.ok(c.ok && c.threads.length === 2)
})

ok("closing: a working tab asks first, the only tab resets, others close", () => {
  assert.equal(closeDecision({ status: "thinking", count: 3 }), "confirm")
  assert.equal(closeDecision({ status: "thinking", count: 3, confirmed: true }), "close")
  assert.equal(closeDecision({ status: "done", count: 1 }), "reset")
  assert.equal(closeDecision({ status: "thinking", count: 1, confirmed: true }), "reset")
  assert.equal(closeDecision({ status: "idle", count: 2 }), "close")
})

ok("closing the active tab activates its left neighbor", () => {
  const ts = [done(1), done(2), done(3)]
  assert.equal(closeThread(ts, id(2), id(2)).activeId, id(1))
  assert.equal(closeThread(ts, id(1), id(1)).activeId, id(2))
  assert.equal(closeThread(ts, id(3), id(1)).activeId, id(1))
  assert.equal(closeThread(ts, id(9), id(1)).threads.length, 3)
})

ok("tabs all show when they fit; otherwise a window with arrows", () => {
  assert.deepEqual(tabWindow({ width: 0, count: 4 }), { start: 0, end: 4, hidden: 0, overflow: false, canPrev: false, canNext: false })
  assert.equal(tabWindow({ width: 500, count: 4 }).overflow, false) // 120 + 3*96 + 32 = 440
  const w = tabWindow({ width: 300, count: 4 }) // room 300-32-90 = 178 -> 1 tab
  assert.deepEqual([w.start, w.end, w.hidden, w.overflow, w.canPrev, w.canNext], [0, 1, 3, true, false, true])
  const last = tabWindow({ width: 300, count: 4, start: 99 })
  assert.deepEqual([last.start, last.end, last.canNext, last.canPrev], [3, 4, false, true])
  assert.equal(tabWindow({ width: 60, count: 2 }).end - tabWindow({ width: 60, count: 2 }).start, 1)
})

ok("the active tab scrolls into the window", () => {
  assert.equal(revealStart({ start: 0, end: 2 }, 3), 2)
  assert.equal(revealStart({ start: 2, end: 4 }, 0), 0)
  assert.equal(revealStart({ start: 1, end: 3 }, 2), 1)
})

ok("saved tabs round-trip; bad data is dropped", () => {
  const ts: Thread[] = [{ ...done(1), status: "thinking" }, newThread(id(2))]
  const back = fromSaved(JSON.parse(JSON.stringify(toSaved(ts, id(2)))))
  assert.deepEqual(back.threads.map((t) => [t.id, t.status, !!t.fresh]), [[id(1), "done", false], [id(2), "idle", true]])
  assert.equal(back.activeId, id(2))
  assert.deepEqual(fromSaved(null), { threads: [], activeId: null })
  assert.deepEqual(fromSaved({ threads: [{ id: "nope" }, { id: id(1), title: 7 }, { id: id(1) }], activeId: "x" }).threads.map((t) => [t.id, t.title]), [[id(1), NEW_TITLE]])
  assert.equal(fromSaved({ threads: Array.from({ length: 9 }, (_, k) => ({ id: id(k), title: "t" })) }).threads.length, MAX_THREADS)
})

console.log(`\n${n} checks passed`)
