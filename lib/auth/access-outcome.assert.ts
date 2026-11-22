/**
 * Run: npx -y tsx@4.23.15 lib/auth/access-outcome.assert.ts
 *
 * Proves, with a database that throws and a database that answers with no rows passed in to each
 * access helper: thrown means DatabaseUnavailableError, no rows means no access. No real database.
 */
import { answered, lookedUp, outcomeOf } from "./access-outcome"
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  DatabaseUnavailableError,
  databaseUnavailableResponse,
  isDatabaseUnavailable,
} from "../db/unavailable"
import {
  canPerformAction,
  getProjectAccess,
  getUserRoleForProject,
  verifyCollaboratorAccess,
} from "./collaboration-access"
import {
  getProjectOwnerId,
  userIdForSession,
  validateApiKey,
  verifyOwnership,
  verifyProjectOwnerOnly,
  verifyProjectOwnership,
  verifyProjectWriteAccess,
  verifyStepAccess,
} from "./auth-utils"

let failed = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}

const PROJECT = "ae81c333-3f0e-4a51-9c1e-0d2b6f7a8e90"
const USER = "255d189c-3f0e-4a51-9c1e-0d2b6f7a8e90"

// Three databases. Each counts how often it was asked.
type Fake = ((...a: unknown[]) => Promise<any[]>) & { asked: number }
const fake = (answer: () => Promise<any[]>): any => {
  const f = ((..._a: unknown[]) => { f.asked++; return answer() }) as Fake
  f.asked = 0
  return f
}
const down = () => fake(() => Promise.reject(new Error("connect ETIMEDOUT 10.0.0.1:5432")))
const broken = () => fake(() => { throw new Error('column "accepted_at" does not exist') })
const empty = () => fake(() => Promise.resolve([]))
const rows = (...r: any[]) => fake(() => Promise.resolve(r))

/** What a call came to: its value, or the name of what it threw. */
const result = async (call: () => Promise<unknown>) => {
  try { return { value: await call() } } catch (e) { return { threw: isDatabaseUnavailable(e) ? "DatabaseUnavailableError" : String(e) } }
}
const quiet = console.error
const silently = async <T,>(f: () => Promise<T>): Promise<T> => { console.error = () => {}; try { return await f() } finally { console.error = quiet } }

async function main() {
  // The rule
  eq("ran and found a row: access", outcomeOf({ ran: true, found: true }), "access")
  eq("ran and found nothing: no access", outcomeOf({ ran: true, found: false }), "no-access")
  eq("threw: unknown, never no access", outcomeOf({ ran: false, error: new Error("x") }), "unknown")

  // The wrapper
  const logged: string[] = []
  const log = (m: string, e: unknown) => logged.push(`${m} | ${(e as Error).message}`)
  const thrown = await answered("someHelper", () => Promise.reject(new Error("boom")), log).catch((e) => e)
  eq("a throw becomes the typed error", thrown instanceof DatabaseUnavailableError, true)
  eq("it names the helper", thrown.helper, "someHelper")
  eq("it keeps what was thrown, for the log", (thrown.original as Error).message, "boom")
  eq("the log line names the helper and carries the error", logged.length === 1 && logged[0].includes("someHelper") && logged[0].endsWith("| boom"), true)
  eq("its own message says nothing of the database's text", /boom/.test(thrown.message), false)
  eq("an answer passes through", await answered("h", async () => 7, log), 7)
  let asked = 0
  eq("an id that cannot name a row is no access", await lookedUp("h", "not-a-uuid", false, async () => { asked++; return true }, log), false)
  eq("and the database is not asked", asked, 0)
  eq("a real id is looked up", await lookedUp("h", PROJECT, false, async () => true, log), true)
  eq("a real id with the database down is the typed error", (await result(() => lookedUp("h", PROJECT, false, () => Promise.reject(new Error("down")), log))).threw, "DatabaseUnavailableError")

  // The answer to the caller
  const res = databaseUnavailableResponse(thrown)
  eq("the typed error answers 503", res?.status, 503)
  eq("with Retry-After: 30", res?.headers.get("Retry-After"), "30")
  eq("and the sentence", await res?.json(), { error: DATABASE_UNAVAILABLE_MESSAGE })
  eq("the sentence, word for word", DATABASE_UNAVAILABLE_MESSAGE, "The planner cannot reach its database right now. Try again in a minute.")
  eq("any other error is left to the route's own catch", databaseUnavailableResponse(new Error("Failed to parse body")), null)
  eq("known by name too (a second copy of the module)", isDatabaseUnavailable({ name: "DatabaseUnavailableError" }), true)
  eq("nothing is not it", isDatabaseUnavailable(null), false)

  // Every helper, against each database
  const helpers: [string, (db: any) => Promise<unknown>, unknown][] = [
    ["verifyProjectOwnership", (db) => verifyProjectOwnership(PROJECT, USER, db), false],
    ["verifyProjectWriteAccess", (db) => verifyProjectWriteAccess(PROJECT, USER, db), false],
    ["verifyProjectOwnerOnly", (db) => verifyProjectOwnerOnly(PROJECT, USER, db), false],
    ["verifyOwnership(documents)", (db) => verifyOwnership("documents", PROJECT, USER, db), false],
    ["verifyStepAccess", (db) => verifyStepAccess(PROJECT, USER, db), false],
    ["getProjectOwnerId", (db) => getProjectOwnerId(PROJECT, db), null],
    ["getProjectAccess", (db) => getProjectAccess(PROJECT, USER, db), null],
    ["verifyCollaboratorAccess", (db) => verifyCollaboratorAccess(PROJECT, USER, undefined, db), false],
    ["verifyCollaboratorAccess(editor)", (db) => verifyCollaboratorAccess(PROJECT, USER, "editor", db), false],
    ["canPerformAction(write)", (db) => canPerformAction(PROJECT, USER, "write", db), false],
    ["getUserRoleForProject", (db) => getUserRoleForProject(PROJECT, USER, db), null],
    ["validateApiKey", (db) => validateApiKey("aipp_0123456789abcdef", db), null],
    ["userIdForSession", (db) => userIdForSession("stack-user-1", db), null],
  ]
  for (const [name, call, noAccess] of helpers) {
    eq(`${name}: database down -> typed error`, (await silently(() => result(() => call(down())))).threw, "DatabaseUnavailableError")
    eq(`${name}: broken query -> typed error`, (await silently(() => result(() => call(broken())))).threw, "DatabaseUnavailableError")
    if (name !== "userIdForSession") eq(`${name}: no rows -> no access`, await result(() => call(empty())), { value: noAccess })
  }

  // Rows that are there still mean what they meant
  eq("owner row: may read", await verifyProjectOwnership(PROJECT, USER, rows({ "?column?": 1 })), true)
  eq("owner row: owner access", (await getProjectAccess(PROJECT, USER, rows({ "?column?": 1 })))?.role, "owner")
  // not the owner (first query empty), a viewer on the second
  const viewer = () => { let n = 0; return fake(() => Promise.resolve(n++ === 0 ? [] : [{ role: "viewer" }])) }
  eq("viewer: may read", await verifyProjectOwnership(PROJECT, USER, viewer()), true)
  eq("viewer: may not write", await verifyProjectWriteAccess(PROJECT, USER, viewer()), false)
  eq("viewer: role is viewer", await getUserRoleForProject(PROJECT, USER, viewer()), "viewer")
  eq("a key row: the key's user", (await validateApiKey("aipp_0123456789abcdef", rows({ id: "k1", user_id: USER, scopes: ["read"] })))?.userId, USER)
  eq("a session's user row: that user", await userIdForSession("stack-user-1", rows({ id: USER })), USER)

  // An id that cannot name a row: no access, and the database is never asked
  for (const [name, call] of [
    ["verifyProjectOwnership", (db: any) => verifyProjectOwnership("not-a-uuid", USER, db)],
    ["verifyProjectWriteAccess", (db: any) => verifyProjectWriteAccess("not-a-uuid", USER, db)],
    ["verifyProjectOwnerOnly", (db: any) => verifyProjectOwnerOnly("not-a-uuid", USER, db)],
    ["verifyStepAccess", (db: any) => verifyStepAccess("255d189c", USER, db)],
    ["getProjectAccess", (db: any) => getProjectAccess("", USER, db)],
  ] as [string, (db: any) => Promise<unknown>][]) {
    const db = down()
    const got = await result(() => call(db))
    eq(`${name}: malformed id -> no access, not an outage`, [got.value === false || got.value === null, db.asked], [true, 0])
  }
  eq("a table that is not on the list: no access, database not asked", await result(() => verifyOwnership("users", PROJECT, USER, down())), { value: false })
  eq("a key that is not ours: no access, database not asked", await result(() => validateApiKey("sk_live_x", down())), { value: null })

  console.log(failed === 0 ? "\nall passed" : `\n${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}
main()
