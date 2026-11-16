// npx -y tsx@4.23.15 lib/shell/pull-refresh.assert.ts
import assert from "node:assert/strict"
import { mayPull, onRelease, pullArmed, pullIntent, pullOffset, PULL_MAX, PULL_THRESHOLD, type PullStart } from "./pull-refresh"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const top: PullStart = { atTop: true, inScrollPanel: false, overlayOpen: false, onDraggable: false, inField: false, busy: false }

t("a pull begins only at the very top of the page", () => {
  assert.equal(mayPull(top), true)
  assert.equal(mayPull({ ...top, atTop: false }), false)
})

t("never inside a scrolling panel, an open dialog, a drag or a text field, or while refreshing", () => {
  for (const k of ["inScrollPanel", "overlayOpen", "onDraggable", "inField", "busy"] as const) assert.equal(mayPull({ ...top, [k]: true }), false, k)
})

t("a sideways swipe, an upward swipe and a tap are left to the page", () => {
  assert.equal(pullIntent(2, 3), "wait")
  assert.equal(pullIntent(30, 10), "leave")        // a board swiped sideways
  assert.equal(pullIntent(0, -20), "leave")
  assert.equal(pullIntent(10, 14), "leave")        // a diagonal is not a pull
  assert.equal(pullIntent(4, 20), "pull")
})

t("the indicator follows the finger, then resists, and stops", () => {
  assert.equal(pullOffset(-10), 0)
  assert.equal(pullOffset(40), 40)
  assert.equal(pullOffset(PULL_THRESHOLD), PULL_THRESHOLD)
  assert.equal(pullOffset(122), 92)
  assert.equal(pullOffset(900), PULL_MAX)
})

t("letting go refreshes only past the threshold", () => {
  assert.equal(pullArmed(71), false)
  assert.equal(pullArmed(72), true)
  assert.equal(onRelease({ dy: 50, unsavedTyping: false, warnedAt: null, now: 0 }), "nothing")
  assert.equal(onRelease({ dy: 90, unsavedTyping: false, warnedAt: null, now: 0 }), "refresh")
})

t("typing that is not saved is warned about once; a second pull within 8 seconds refreshes", () => {
  assert.equal(onRelease({ dy: 90, unsavedTyping: true, warnedAt: null, now: 1000 }), "warn")
  assert.equal(onRelease({ dy: 90, unsavedTyping: true, warnedAt: 1000, now: 5000 }), "refresh")
  assert.equal(onRelease({ dy: 90, unsavedTyping: true, warnedAt: 1000, now: 20000 }), "warn")
  assert.equal(onRelease({ dy: 10, unsavedTyping: true, warnedAt: 1000, now: 2000 }), "nothing")
})

console.log(`\n${n} pull-refresh checks passed`)
