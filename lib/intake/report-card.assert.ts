import assert from "node:assert/strict"
import { reportCard, reportTitle, reportKind } from "./report-card"

let n = 0
const ok = (f: () => void) => { f(); n++ }
const P = "53a685c5-cee3-4a28-8552-dc19b4117188"
const base = { id: "r1", source: "ai-project-planner", comment: "These phases tell me nothing of what they are", route: "/project/x", url: "https://p/project/x" }

// Something wrong goes to the planner's Up next, high.
ok(() => { const c = reportCard(base)!; assert.equal(c.projectId, P); assert.equal(c.status, "pending"); assert.equal(c.priority, "high"); assert.deepEqual(c.tags, ["report", "fix"]) })
// A wish goes to Requests.
ok(() => { const c = reportCard({ ...base, kind: "wish" })!; assert.equal(c.status, "requested"); assert.deepEqual(c.tags, ["report", "request"]) })
// His words are kept, quoted, with the page and the report id.
ok(() => { const d = reportCard(base)!.description; assert.match(d, /> These phases tell me nothing/); assert.match(d, /Page: \/project\/x/); assert.match(d, /Report r1\./) })
// The title is his own when given, else his first sentence.
ok(() => assert.equal(reportCard({ ...base, title: "Phases unclear" })!.title, "Phases unclear"))
ok(() => assert.equal(reportTitle(null, "The button is cut off. Also the menu jumps."), "The button is cut off."))
ok(() => { const t = reportTitle("", "word ".repeat(60)); assert.ok(t.length <= 91); assert.ok(t.endsWith("…")) })
// An app the planner does not track makes no card.
ok(() => assert.equal(reportCard({ ...base, source: "unknown" }), null))
ok(() => assert.equal(reportCard({ ...base, source: null }), null))
// An empty report makes no card.
ok(() => assert.equal(reportCard({ ...base, comment: "   " }), null))
// Anything but "wish" is treated as something wrong (the safe default: it gets fixed).
ok(() => { assert.equal(reportKind(undefined), "wrong"); assert.equal(reportKind("other"), "wrong"); assert.equal(reportKind("wish"), "wish") })
// What he pointed at is shown in words; a data picture is not pasted into the card.
ok(() => { const d = reportCard({ ...base, picked: "the Priority field", screenshot: "data:image/png;base64,AAAA" })!.description; assert.match(d, /He pointed at: the Priority field/); assert.match(d, /Picture: kept with the report/); assert.doesNotMatch(d, /base64/) })
// No doubled blank lines when parts are missing.
ok(() => assert.doesNotMatch(reportCard({ id: "r2", source: "ai-project-planner", comment: "x" })!.description, /\n\n\n/))

console.log(`${n} passed, 0 failed`)
