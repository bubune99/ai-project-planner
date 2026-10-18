import { allowedAgentIds } from "./agent-access"
let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, m: string) => { JSON.stringify(a) === JSON.stringify(b) ? pass++ : (fail++, console.log("FAIL", m, a, b)) }
eq(allowedAgentIds("u1", {}).length, 3, "env unset: everyone sees all")
eq(allowedAgentIds("u1", { PLANNER_ADMIN_USER_IDS: "u1" }).length, 3, "admin sees all")
eq(allowedAgentIds("u2", { PLANNER_ADMIN_USER_IDS: "u1" }), ["jarvis"], "non-admin gets JARVIS only")
eq(allowedAgentIds(null, { PLANNER_ADMIN_USER_IDS: "u1" }), ["jarvis"], "no user gets JARVIS only")
console.log(`agent-access.assert: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
