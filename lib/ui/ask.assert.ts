/* Run: npx -y tsx@4.23.15 lib/ui/ask.assert.ts */

import assert from "node:assert/strict"
import { createAsker, textAnswer } from "./ask"

let passed = 0
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log(`ok  ${name}`) }

async function main() {
  await ok("nothing is asked until a screen asks", () => { assert.equal(createAsker().current(), null) })

  await ok("going ahead resolves true and clears the question", async () => {
    const a = createAsker()
    const answer = a.confirm({ title: "Delete?", confirm: "Delete" })
    const q = a.current()
    assert.equal(q?.title, "Delete?")
    a.settle(q!.id, "")
    assert.equal(await answer, true)
    assert.equal(a.current(), null)
  })

  await ok("cancel, Esc and pressing outside (null) resolve false", async () => {
    const a = createAsker()
    const answer = a.confirm({ title: "Delete?", confirm: "Delete" })
    a.settle(a.current()!.id, null)
    assert.equal(await answer, false)
  })

  await ok("a second question waits its turn, and each gets its own answer", async () => {
    const a = createAsker()
    const first = a.confirm({ title: "One?", confirm: "Go" })
    const second = a.confirm({ title: "Two?", confirm: "Go" })
    assert.equal(a.current()?.title, "One?")
    a.settle(a.current()!.id, null)
    assert.equal(a.current()?.title, "Two?")
    a.settle(a.current()!.id, "")
    assert.deepEqual([await first, await second], [false, true])
  })

  await ok("an answer for a question no longer on screen is ignored", async () => {
    const a = createAsker()
    const first = a.confirm({ title: "One?", confirm: "Go" })
    const id = a.current()!.id
    a.settle(id, "")
    const second = a.confirm({ title: "Two?", confirm: "Go" })
    a.settle(id, "")
    assert.equal(a.current()?.title, "Two?")
    a.settle(a.current()!.id, null)
    assert.deepEqual([await first, await second], [true, false])
  })

  await ok("a text question resolves to what was typed, trimmed; cancel is null", async () => {
    const a = createAsker()
    const why = a.text({ title: "Close?", confirm: "Close card", field: { label: "Why", required: true } })
    a.settle(a.current()!.id, "  duplicate of another card ")
    assert.equal(await why, "duplicate of another card")
    const none = a.text({ title: "Close?", confirm: "Close card", field: { label: "Why", required: true } })
    a.settle(a.current()!.id, null)
    assert.equal(await none, null)
  })

  await ok("a required answer left blank keeps the question open", () => {
    const a = createAsker()
    void a.text({ title: "Close?", confirm: "Close card", field: { label: "Why", required: true } })
    const id = a.current()!.id
    a.settle(id, "   ")
    assert.equal(a.current()?.id, id)
  })

  await ok("an optional answer may be blank", async () => {
    const a = createAsker()
    const why = a.text({ title: "Not now?", confirm: "Set aside", field: { label: "Why", required: false } })
    a.settle(a.current()!.id, " ")
    assert.equal(await why, "")
  })

  await ok("listeners hear a question arrive and leave, and can stop listening", () => {
    const a = createAsker()
    let heard = 0
    const stop = a.subscribe(() => { heard++ })
    void a.confirm({ title: "One?", confirm: "Go" })
    a.settle(a.current()!.id, null)
    assert.equal(heard, 2)
    stop()
    void a.confirm({ title: "Two?", confirm: "Go" })
    assert.equal(heard, 2)
  })

  await ok("textAnswer", () => {
    assert.equal(textAnswer(" a ", true), "a")
    assert.equal(textAnswer("  ", true), null)
    assert.equal(textAnswer("  ", false), "")
  })

  console.log(`\n${passed} passed`)
}

main().catch((e) => { console.error(e); process.exit(1) })
