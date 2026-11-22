/**
 * Run: npx -y tsx@4.23.15 lib/api/error-text.assert.ts
 */
import { detailsForCaller, ownError } from "./error-text"

let failed = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}

class GateError extends Error {}
class FlowError extends Error { constructor(message: string, public status: number) { super(message) } }
class NarrowGateError extends GateError {}

// ownError: only an error of a kind this app wrote for the person is handed back
const gate = new GateError("Send the guide's id")
eq("one of ours is handed back, same object", ownError(gate, GateError) === gate, true)
eq("its sentence is the one written for the person", ownError(gate, GateError)?.message, "Send the guide's id")
eq("a kind made from one of ours counts", ownError(new NarrowGateError("No such check"), GateError)?.message, "No such check")
eq("any of several kinds", (ownError(new FlowError("Someone saved before you", 409), GateError, FlowError) as FlowError | null)?.status, 409)
eq("a database error is not ours", ownError(new Error("column ps.due_date does not exist"), GateError), null)
eq("a library error is not ours", ownError(new TypeError("fetch failed"), GateError, FlowError), null)
eq("one of ours, but not a kind this route named", ownError(new FlowError("x", 400), GateError), null)
eq("something thrown that is not an error", ownError("boom", GateError), null)
eq("nothing thrown", ownError(undefined, GateError), null)
eq("no kinds named means nothing is ours", ownError(gate), null)
eq("naming Error itself lets nothing through", ownError(new Error("relation does not exist"), Error), null)
eq("naming Error itself does not let ours through either", ownError(gate, Error), null)
eq("a look-alike object is not ours", ownError({ message: "Send the guide's id", name: "GateError" }, GateError), null)

// detailsForCaller: what may ride along in the error envelope
eq("a failure on our side sends no details (the production case)", detailsForCaller(500, "column ps.due_date does not exist"), undefined)
eq("503 sends none", detailsForCaller(503, "DATABASE_URL environment variable is missing"), undefined)
eq("an object on a 500 sends none", detailsForCaller(500, { message: "connect ECONNREFUSED" }), undefined)
eq("what was wrong with the request is kept", detailsForCaller(422, [{ field: "why.rationale", problem: "required" }]), [{ field: "why.rationale", problem: "required" }])
eq("a 400 sentence is kept", detailsForCaller(400, "priority must be low, medium or high"), "priority must be low, medium or high")
eq("409 details are kept", detailsForCaller(409, { currentVersion: 4 }), { currentVersion: 4 })
eq("a raw error is never sent, whatever the status", detailsForCaller(400, new Error("syntax error at or near")), undefined)
eq("nothing given, nothing sent", detailsForCaller(400, undefined), undefined)
eq("null is nothing", detailsForCaller(404, null), undefined)
eq("a status that is not a number is treated as ours", detailsForCaller(Number.NaN, "x"), undefined)

console.log(failed ? `\n${failed} FAILED` : "\nall passed")
if (failed) process.exit(1)
