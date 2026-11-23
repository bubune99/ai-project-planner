import assert from "node:assert/strict"
import { cardIdPrefix, plainToolError } from "./plain-errors"

const short = plainToolError('invalid input syntax for type uuid: "2dd7fa3a"')
assert.match(short, /^"2dd7fa3a" is not a full id\./)
assert.match(short, /find_cards/)
assert.equal(plainToolError("Card not found"), "Card not found", "other messages pass through unchanged")
assert.equal(plainToolError('invalid input syntax for type integer: "x"'), 'invalid input syntax for type integer: "x"')

assert.equal(cardIdPrefix("2dd7fa3a"), "2dd7fa3a")
assert.equal(cardIdPrefix("2DD7FA3A-32ef"), "2dd7fa3a-32ef")
assert.equal(cardIdPrefix("2dd7fa3a-32ef-455f-8e6b-4936836d52d2"), "2dd7fa3a-32ef-455f-8e6b-4936836d52d2")
assert.equal(cardIdPrefix("2dd7fa3"), null, "fewer than 8 characters is too vague")
assert.equal(cardIdPrefix("nope"), null)
assert.equal(cardIdPrefix("2dd7fa3a%"), null, "no pattern characters reach a LIKE")
assert.equal(cardIdPrefix("2dd7fa3a-32ef-455f-8e6b-4936836d52d2x"), null, "longer than an id")

console.log("plain-errors: 10 checks passed")
