import { briefingLine } from "./briefing"
let pass = 0, fail = 0
const eq = (m: string, a: unknown, b: unknown) => { a === b ? pass++ : (fail++, console.log("FAIL", m, a, b)) }
eq("all three", briefingLine({ dueToday: 2, overdue: 1, open: 9 }), "2 due today · 1 overdue · 9 open")
eq("only open", briefingLine({ dueToday: 0, overdue: 0, open: 4 }), "4 open")
eq("nothing", briefingLine({ dueToday: 0, overdue: 0, open: 0 }), "Nothing open. A clear day.")
eq("missing", briefingLine(null), null)
eq("garbage", briefingLine({ dueToday: NaN, overdue: 0, open: 0 }), null)
console.log(`briefing.assert: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
