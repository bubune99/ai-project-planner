import assert from "node:assert/strict"
import { DEFAULT_PREFS, noticeFor, parsePrefs } from "./notify-model"

// Preferences: defaults when nothing is stored; only booleans for known kinds are taken.
assert.deepEqual(parsePrefs(null), DEFAULT_PREFS)
assert.deepEqual(parsePrefs({ question: false, change: "no", other: true }), { question: false, change: true })
assert.deepEqual(parsePrefs([false]), DEFAULT_PREFS)

// A question opens the project it is about (where it can be answered in place), or the inbox when it has none.
const q = noticeFor("question", { id: "q1", text: "  May it be switched\n to test keys?  ", projectId: "p1", projectName: "BYB Society" })
assert.deepEqual(q, { title: "BYB Society: a question for you", body: "May it be switched to test keys?", url: "/project/p1", tag: "question-q1" })
assert.equal(noticeFor("question", { id: "q2", text: "x" }).url, "/inbox")
assert.equal(noticeFor("question", { id: "q2", text: "x" }).title, "A question for you")

// A change opens the Changes tab. Long text is cut with an ellipsis, never mid-space.
const c = noticeFor("change", { id: "c1", text: "word ".repeat(80), projectId: "p1", projectName: "BYB Society" })
assert.equal(c.url, "/project/p1?tab=changes")
assert.equal(c.tag, "change-c1")
assert.ok(c.body.length <= 180 && c.body.endsWith("…") && !c.body.includes(" …"))
console.log("notify-model: 9 checks pass")
