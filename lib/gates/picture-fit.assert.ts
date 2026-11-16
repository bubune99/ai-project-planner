// npx -y tsx@4.23.15 lib/gates/picture-fit.assert.ts
import assert from "node:assert/strict"
import { readableWidth } from "./picture-fit"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }

t("a picture that fits, or nearly fits, is left alone", () => {
  assert.equal(readableWidth(820, 400 * 1.2), null)       // 58% of its size
  assert.equal(readableWidth(400, 400), null)
  assert.equal(readableWidth(300, 400), null)
})

t("a whole-window picture on a phone is drawn at a readable size, to be swiped sideways", () => {
  // The owner's case: 3,440 wide in a box about 400 wide would be shrunk to 12%.
  assert.equal(readableWidth(3440, 400), 1400)
  assert.equal(readableWidth(1600, 400), 880)
  assert.equal(readableWidth(820, 400), 451)
})

t("on a wide screen a wide picture is never drawn narrower than its box", () => {
  assert.equal(readableWidth(3440, 1500), 1500)
  assert.equal(readableWidth(2900, 700), 1400)
})

t("a picture that has not loaded gives no width", () => {
  assert.equal(readableWidth(0, 400), null)
  assert.equal(readableWidth(1000, 0), null)
})

console.log(`\n${n} picture-fit checks passed`)
