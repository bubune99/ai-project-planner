/**
 * Run: npx -y tsx@4.23.15 lib/api/id-casts.assert.ts
 *
 * Two parts: the reading rule against small made-up routes, then every route file under app/api.
 * See id-casts.ts for what the rule can and cannot tell.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { castName, uncheckedCasts } from "./id-casts"

let failed = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}
const problems = (source: string, safe: string[] = []) => uncheckedCasts(source, safe).map((f) => `${f.name}: ${f.problem}`)

// ---------------------------------------------------------------- the reading rule

const asItWas = `
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const projectId = new URL(request.url).searchParams.get('projectId')
    const rows = await sql\`
      SELECT * FROM skills
      WHERE user_id = \${auth.userId}
        AND (\${projectId}::uuid IS NULL OR project_id = \${projectId})
    \`
    return successResponse(rows)
  } catch (error) {
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load skills', 500)
  }
}
`
eq("a query-string id cast with no check", problems(asItWas), ["projectId: not checked"])

const mended = asItWas.replace(
  "const rows",
  "if (projectId !== null && !isUuid(projectId)) return errorResponse(ErrorCodes.VALIDATION_ERROR, notAnId('projectId'), 400)\n    const rows",
)
eq("checked first: clean", problems(mended), [])
eq("the older pattern test counts", problems(asItWas.replace("const rows", "if (projectId !== null && !UUID.test(projectId)) return bad()\n    const rows")), [])
eq("checking a different name does not count", problems(asItWas.replace("const rows", "if (!isUuid(clientId)) return bad()\n    const rows")), ["projectId: not checked"])
eq(
  "a check after the cast does not count",
  problems(asItWas.replace("return successResponse", "if (!isUuid(projectId)) return bad()\n    return successResponse")),
  ["projectId: not checked"],
)
eq(
  "a check in another function does not count",
  problems("export async function GET() {\n  if (!isUuid(taskId)) return bad()\n}\n\nexport async function POST() {\n  await sql`SELECT f(${taskId}::uuid)`\n}\n"),
  ["taskId: not checked"],
)
eq(
  "a check in the same function, after an earlier one closed, counts",
  problems("export async function GET() {\n  return 1\n}\n\nexport async function POST() {\n  if (!isUuid(taskId)) return bad()\n  await sql`SELECT f(${taskId}::uuid)`\n}\n"),
  [],
)
eq("the name inside `x || null`", castName("projectId || null"), "projectId")
eq("a dotted name is taken whole", castName("auth.userId"), "auth.userId")
eq("a call on a list is about the list", castName("base.map((i) => i.id)"), "base")
eq("`x || null` cast, unchecked", problems("export async function PATCH() {\n  await sql`UPDATE t SET a = ${ideaId || null}::uuid`\n}\n"), ["ideaId: not checked"])
eq(
  "`x || null` cast, checked when present",
  problems("export async function PATCH() {\n  if (ideaId && !isUuid(ideaId)) return bad()\n  await sql`UPDATE t SET a = ${ideaId || null}::uuid`\n}\n"),
  [],
)
eq("a list cast, unchecked", problems("export async function POST() {\n  await sql`SELECT unnest(${stepIds}::uuid[])`\n}\n"), ["stepIds: not checked"])
eq(
  "a list tested with every(isUuid)",
  problems("export async function POST() {\n  if (!stepIds.every(isUuid)) return bad()\n  await sql`SELECT unnest(${stepIds}::uuid[])`\n}\n"),
  [],
)
eq(
  "a list declared through filter(isUuid)",
  problems("export async function POST() {\n  const stepIds: string[] = Array.isArray(b?.stepIds) ? b.stepIds.filter(isUuid).slice(0, 2000) : []\n  await sql`SELECT 1 WHERE id = ANY(${stepIds}::uuid[])`\n}\n"),
  [],
)
eq(
  "a list filtered some other way is not checked",
  problems("export async function POST() {\n  const stepIds = b.stepIds.filter((x) => typeof x === 'string')\n  await sql`SELECT 1 WHERE id = ANY(${stepIds}::uuid[])`\n}\n"),
  ["stepIds: not checked"],
)
eq("one value cast twice is one finding", problems(asItWas.replace("project_id = ${projectId})", "project_id = ${projectId}::uuid)")), ["projectId: not checked"])
eq(
  "a value named as not the caller's is left alone",
  problems("export async function PATCH() {\n  await sql`UPDATE f SET by = ${auth.userId}::uuid`\n}\n", ["auth.userId"]),
  [],
)
eq(
  "a numbered placeholder cannot be followed, and says so",
  problems("export async function PATCH() {\n  updates.push(`facet = $${p++}::uuid`)\n}\n"),
  ["p++: cannot follow"],
)
eq("a cast in a comment is not code", problems("export async function GET() {\n  // WHERE id = ${x}::uuid\n  return 1\n}\n"), [])
eq("other casts are not this rule's", problems("export async function GET() {\n  await sql`SELECT ${a}::text, ${b}::jsonb, ${c}::integer`\n}\n"), [])
eq("Windows line endings read the same", problems(asItWas.replace(/\n/g, "\r\n")), ["projectId: not checked"])
eq(
  "what it cannot see: the same id with no cast",
  problems("export async function POST() {\n  await sql`INSERT INTO d (a, b) VALUES (${stepId}, ${dependsOnId})`\n}\n"),
  [],
)

// ---------------------------------------------------------------- every route under app/api

/** Cast values that do not come from the caller of the request, each with why. Read by hand. */
const SAFE: Record<string, Record<string, string>> = {
  "app/api/agents/route.ts": {
    taskId: "canWriteStep (lib/db/agent-task-access.ts) runs first on both paths and compares the id as text (id::text = x), so a malformed one answers 404 Task not found before the cast",
  },
  "app/api/documents/[id]/route.ts": { ids: "the ids of document rows read two lines above" },
  "app/api/feedback/[id]/route.ts": { "auth.userId": "the signed-in user's id, from the session" },
  "app/api/inbox/answered/route.ts": { ids: "project ids stored on the caller's own answered questions (openAnswers), not sent with this request" },
  "app/api/inbox/route.ts": {
    base: "the ids of agent_jobs rows just read",
    wanted: "card ids from stored rows, already filtered with UUID.test inside the filter",
    projectIds: "project ids stored on the caller's own questions or read from project_steps, not sent with this request",
  },
}

/** Files the rule cannot follow, each with what was read by hand. A file here must still be reported, or it comes off. */
const READ_BY_HAND: Record<string, string> = {
  "app/api/ideas/[id]/validations/[validationId]/route.ts":
    "PATCH builds its UPDATE from numbered placeholders. The two values cast are currentFacetId and validatedFacetIds; both are put to isUuid (400) above the lines that push them",
}

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (name === "route.ts" || name === "route.tsx") out.push(full)
  }
  return out
}

const root = join(__dirname, "..", "..")
const files = routeFiles(join(root, "app", "api")).map((f) => relative(root, f).split(sep).join("/")).sort()

let withCasts = 0
let dirty = 0
let byHand = 0
for (const file of files) {
  const source = readFileSync(join(root, file), "utf8")
  if (!/::uuid\b/.test(source)) {
    if (file in SAFE || file in READ_BY_HAND) {
      failed++
      console.log(`FAIL ${file} is named in this check but casts nothing to uuid any more`)
    }
    continue
  }
  withCasts++
  const safe = Object.keys(SAFE[file] ?? {})
  const findings = uncheckedCasts(source, safe)
  for (const name of safe) {
    // a name on the safe list must still be cast and still be unchecked, or it comes off the list
    if (!uncheckedCasts(source).some((f) => f.name === name)) {
      failed++
      console.log(`FAIL ${file}: ${name} is named as safe but is no longer an unchecked cast: take it off the list`)
    }
  }
  if (file in READ_BY_HAND) {
    byHand++
    if (!findings.some((f) => f.problem === "cannot follow")) {
      failed++
      console.log(`FAIL ${file} can be followed now: take it off the read-by-hand list`)
    }
    const others = findings.filter((f) => f.problem !== "cannot follow")
    if (others.length) {
      failed++
      console.log(`FAIL ${file}`)
      for (const f of others) console.log(`     ${f.problem}: ${f.detail}`)
    }
  } else if (findings.length > 0) {
    failed++
    dirty++
    console.log(`FAIL ${file}`)
    for (const f of findings) console.log(`     ${f.problem}: ${f.detail}`)
  }
}
for (const file of [...Object.keys(SAFE), ...Object.keys(READ_BY_HAND)]) {
  if (!files.includes(file)) {
    failed++
    console.log(`FAIL ${file} is named in this check but is not a route file any more`)
  }
}
eq("route files that cast a value to uuid were found", withCasts > 10, true)
console.log(
  `${dirty === 0 ? "ok  " : "FAIL"} ${withCasts - dirty - byHand} of ${withCasts} route files that cast a value to uuid check it first` +
    (byHand ? `; ${byHand} read by hand` : "") +
    (dirty ? `; ${dirty} do not` : ""),
)

console.log(failed ? `\n${failed} FAILED` : "\nall passed")
if (failed) process.exit(1)
