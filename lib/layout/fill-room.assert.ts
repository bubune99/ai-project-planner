// npx -y tsx@4.23.15 lib/layout/fill-room.assert.ts
import assert from "node:assert/strict"
import { roomBelow } from "./fill-room"
// A 1305-tall page whose board starts 420 down: the board takes the rest, so the page itself does not scroll.
assert.equal(roomBelow(1305, 420), 869)
assert.equal(420 + roomBelow(1305, 420) + 16, 1305)
// A short screen still gets a usable board; then, and only then, the page scrolls a little too.
assert.equal(roomBelow(700, 500), 360)
assert.equal(roomBelow(894, 380.6), 497)
console.log("ok   the board takes the room left below it, never less than 360")
