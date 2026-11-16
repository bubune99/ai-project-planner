// npx -y tsx@4.23.15 lib/inbox/pictures.assert.ts
import assert from "node:assert/strict"
import { MAX_PICTURES, pictureKey, pictureLayout, pictureType, readPictures, storedPictures } from "./pictures"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
const JPG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ=="
const WEBP = Buffer.from("RIFF\x24\x00\x00\x00WEBPVP8 ", "latin1").toString("base64")

t("the kind of picture is read from its bytes", () => {
  assert.equal(pictureType(PNG), "png")
  assert.equal(pictureType(JPG), "jpeg")
  assert.equal(pictureType(WEBP), "webp")
  assert.equal(pictureType(Buffer.from("<svg onload=alert(1)>").toString("base64")), null)
  assert.equal(pictureType(Buffer.from("GIF89a").toString("base64")), null)
})

t("no pictures is fine; a question needs none", () => {
  assert.deepEqual(readPictures(undefined), { ok: true, value: [] })
  assert.deepEqual(readPictures([]), { ok: true, value: [] })
})

t("a picture is accepted with or without a data: prefix, with its caption", () => {
  const r = readPictures([{ base64: `data:image/png;base64,${PNG}`, caption: "  The Tasks tab at 440 wide  " }, JPG])
  assert.ok(r.ok)
  if (r.ok) { assert.equal(r.value.length, 2); assert.equal(r.value[0].type, "png"); assert.equal(r.value[0].caption, "The Tasks tab at 440 wide"); assert.equal(r.value[1].caption, null); assert.equal(r.value[0].bytes, 70) }
})

t("what is not a picture, too many, or too large is refused with the reason", () => {
  const bad = (raw: unknown, re: RegExp) => { const r = readPictures(raw); assert.equal(r.ok, false); if (!r.ok) assert.match(r.error, re) }
  bad("x", /list/)
  bad(Array(MAX_PICTURES + 1).fill(PNG), /at most 4/)
  bad([{ caption: "none" }], /no base64/)
  bad([Buffer.from("<svg/>").toString("base64")], /PNG, JPEG or WebP/)
  bad(["iVBORw0KGgo not base64 !!"], /not base64/)
  bad(["iVBORw0KGgo" + "A".repeat(2_100_000)], /over 1.5 MB/)
  const big = "iVBORw0KGgo" + "A".repeat(1_500_000)
  bad([big, big, big], /together are over 3 MB/)
})

t("stored pictures are read back; anything that is not ours is left out", () => {
  assert.deepEqual(storedPictures({ images: [{ key: "inbox/u1/q-1.png", caption: "A" }, { key: "gates/other.png" }, { key: 4 }, null] }), [{ key: "inbox/u1/q-1.png", caption: "A", option: null, current: false }])
  assert.deepEqual(storedPictures({ images: [{ key: "inbox/u1/q-2.png", option: "Two rows", current: false }] }), [{ key: "inbox/u1/q-2.png", caption: null, option: "Two rows", current: false }])
  assert.deepEqual(storedPictures({}), [])
  assert.deepEqual(storedPictures(null), [])
  assert.equal(pictureKey("u1", "q", 0, "jpeg"), "inbox/u1/q-1.jpg")
})

t("a picture can stand for one option, or show how it is now", () => {
  const opts = ["Two rows", "One row", "Leave it"]
  const r = readPictures([{ base64: PNG, current: true }, { base64: PNG, option: "Two rows" }, { base64: JPG, option: " One row " }], opts)
  assert.ok(r.ok)
  if (r.ok) { assert.equal(r.value[0].current, true); assert.equal(r.value[0].option, null); assert.equal(r.value[1].option, "Two rows"); assert.equal(r.value[2].option, "One row") }
  const bad = (raw: unknown, re: RegExp) => { const x = readPictures(raw, opts); assert.equal(x.ok, false); if (!x.ok) assert.match(x.error, re) }
  bad([{ base64: PNG, option: "Three rows" }], /not one of the options/)
  bad([{ base64: PNG, option: "One row" }, { base64: PNG, option: "One row" }], /two pictures are for/)
  bad([{ base64: PNG, option: "One row", current: true }], /both an option and how it is now/)
  bad([{ base64: PNG, current: true }, { base64: PNG, current: true }], /only one picture/)
})

t("the card lays out: how it is now, then the options in their order, then the rest", () => {
  const pics = [{ k: "ctx" }, { k: "b", option: "B" }, { k: "now", current: true }, { k: "a", option: "A" }, { k: "gone", option: "Z" }]
  const l = pictureLayout(pics, ["A", "B", "C"])
  assert.equal(l.current?.k, "now")
  assert.deepEqual(l.choices.map((c) => [c.option, c.picture.k]), [["A", "a"], ["B", "b"]])
  assert.deepEqual(l.context.map((p) => p.k), ["ctx", "gone"])
})

console.log(`\n${n} inbox picture checks passed`)
