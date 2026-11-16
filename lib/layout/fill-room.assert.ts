// npx -y tsx@4.23.15 lib/layout/fill-room.assert.ts
import assert from "node:assert/strict"
import { boardHeight } from "./fill-room"
// A page area 1238 tall: the board fills it once scrolled to, leaving a small gap.
assert.equal(boardHeight(1238), 1222)
// A short phone screen still gets a usable board.
assert.equal(boardHeight(300), 360)
assert.equal(boardHeight(780.5), 764)
console.log("ok   the board is as tall as the page area shows, never less than 360")
