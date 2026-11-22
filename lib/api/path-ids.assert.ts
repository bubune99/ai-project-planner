/**
 * Run: npx -y tsx@4.23.15 lib/api/path-ids.assert.ts
 *
 * Two parts: the reading rule against small made-up routes, then every route file under app/api
 * whose path has a dynamic segment. See path-ids.ts for what the rule can and cannot tell.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { handlersOf, segmentsOf, unchecked } from "./path-ids"

let failed = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}
const problems = (path: string, source: string, notIds: string[] = []) =>
  unchecked(path, source, notIds).map((f) => `${f.handler} ${f.segment}: ${f.problem}`)

// ---------------------------------------------------------------- the reading rule

const STEP = "app/api/projects/[id]/steps/[stepId]/route.ts"

eq("segments of a path", segmentsOf(STEP), ["id", "stepId"])
eq("a path with none", segmentsOf("app/api/todos/route.ts"), [])

const seenOnProduction = `
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, stepId } = await params;
    const hasAccess = await verifyProjectOwnership(projectId, authContext.userId);
    const rows = await sql\`SELECT * FROM project_steps WHERE id = \${stepId}\`;
    return NextResponse.json({ step: rows[0] });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch step" }, { status: 500 });
  }
}
`
eq("the route as it was: neither id is checked", problems(STEP, seenOnProduction), ["GET id: not checked", "GET stepId: not checked"])
eq("one handler is found, with its body", handlersOf(seenOnProduction).map((h) => [h.name, h.body.includes("verifyProjectOwnership")]), [["GET", true]])

const mended = seenOnProduction.replace(
  "const hasAccess",
  `if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!isUuid(stepId)) return NextResponse.json({ error: "Step not found" }, { status: 404 });
    const hasAccess`,
)
eq("both checked first: clean", problems(STEP, mended), [])

const lateCheck = seenOnProduction.replace(
  "const rows",
  `if (!isUuid(projectId) || !isUuid(stepId)) return NextResponse.json({ error: "Step not found" }, { status: 404 });
    const rows`,
)
eq("checked, but only after the project id went to the database", problems(STEP, lateCheck), ["GET id: used before the check"])

eq(
  "the older pattern test counts as a check",
  problems(STEP, seenOnProduction.replace("const hasAccess", "if (!UUID.test(projectId) || !UUID.test(stepId)) return notFound();\n    const hasAccess")),
  [],
)
eq(
  "a check used as a condition counts",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, { params }: Ctx) {\n  const { id } = await params\n  const row = isUuid(id) ? await find(id) : null\n}\n"),
  [],
)
eq(
  "checking a different name does not count",
  problems(STEP, seenOnProduction.replace("const hasAccess", "if (!isUuid(stepId)) return notFound();\n    const hasAccess")),
  ["GET id: not checked"],
)
eq(
  "params.id read directly, unchecked",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, { params }: { params: { id: string } }) {\n  const rows = await sql`SELECT 1 WHERE id = ${params.id}`\n}\n"),
  ["GET id: not checked"],
)
eq(
  "params.id read directly, checked first",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, { params }: { params: { id: string } }) {\n  if (!isUuid(params.id)) return notFound()\n  const rows = await sql`SELECT 1 WHERE id = ${params.id}`\n}\n"),
  [],
)
eq(
  "const x = params.id",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, { params }: { params: { id: string } }) {\n  const projectId = params.id\n  await load(projectId)\n}\n"),
  ["GET id: not checked"],
)
eq(
  "params handed over through props, then taken apart",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, props: { params: Promise<{ id: string }> }) {\n  const params = await props.params;\n  try {\n    const { id } = params\n    await load(id)\n  } catch {}\n}\n"),
  ["GET id: not checked"],
)
eq(
  "ctx.params",
  problems("app/api/x/[id]/route.ts", "export async function PATCH(r: Request, ctx: { params: Promise<{ id: string }> }) {\n  const { id } = await ctx.params;\n  if (!isUuid(id)) return notFound()\n  await load(id)\n}\n"),
  [],
)
eq(
  "each handler is judged on its own",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, { params }: Ctx) {\n  const { id } = await params\n  if (!isUuid(id)) return notFound()\n  await load(id)\n}\n\nexport async function DELETE(r: Request, { params }: Ctx) {\n  const { id } = await params\n  await remove(id)\n}\n"),
  ["DELETE id: not checked"],
)
eq(
  "params passed on whole cannot be followed, and says so",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, { params }: Ctx) {\n  return handle(r, params)\n}\n"),
  ["GET *: cannot follow"],
)
eq(
  "a handler written as a value cannot be followed",
  problems("app/api/x/[id]/route.ts", "export const GET = withAuth(async (r, { params }) => {})\n"),
  ["GET *: cannot follow"],
)
eq(
  "a segment named as not an id is left alone",
  problems("app/api/invitations/[token]/route.ts", "export async function GET(r: Request, { params }: Ctx) {\n  const { token } = await params\n  await find(token)\n}\n", ["token"]),
  [],
)
eq(
  "a handler that never reads the path is clean",
  problems("app/api/x/[id]/route.ts", "export async function DELETE(request: NextRequest) {\n  const id = new URL(request.url).searchParams.get('id')\n}\n"),
  [],
)
eq(
  "one id under two names: checking either name checks it",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, { params }: { params: { id: string } }) {\n  try {\n    const projectId = params.id\n    if (!isUuid(projectId)) return notFound()\n    await load(projectId)\n  } catch (error) {\n    console.error(`GET ${params.id}`, error)\n  }\n}\n"),
  [],
)
eq(
  "one id under two names, the second used before the first is checked",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, { params }: { params: { id: string } }) {\n  await load(params.id)\n  const projectId = params.id\n  if (!isUuid(projectId)) return notFound()\n}\n"),
  ["GET id: used before the check"],
)
eq(
  "the word params in a comment is not a use",
  problems("app/api/x/[id]/route.ts", "export async function GET(r: Request, { params }: Ctx) {\n  const { id } = await params\n  if (!isUuid(id)) return notFound()\n  // Parse query params\n  /* params again */\n  await load(id)\n}\n"),
  [],
)
eq(
  "Windows line endings read the same",
  problems(STEP, seenOnProduction.replace(/\n/g, "\r\n")),
  ["GET id: not checked", "GET stepId: not checked"],
)

// ---------------------------------------------------------------- every route under app/api

/** Path segments that are not uuid ids, each with why. Read by hand against the code and the migrations. */
const NOT_IDS: Record<string, { segment: string; why: string }[]> = {
  "app/api/invitations/[token]/route.ts": [{ segment: "token", why: "an invitation token: random text, looked up as text by validateInvitation" }],
  "app/api/catalog/surfaces/[id]/route.ts": [{ segment: "id", why: "the id or the surface's canonical_id: compared as text (id::text = x OR canonical_id = x), so any text is safe" }],
  "app/api/projects/[id]/readiness/validations/[itemId]/route.ts": [{ segment: "itemId", why: "a checklist item's key from the catalog: item_id is TEXT (migration 060), and setValidation answers 404 for a key it does not know" }],
}

/**
 * Handlers the rule cannot pass although the id is safe, each with why. Read by hand; a file here
 * must still be reported by the rule, or it comes off the list.
 */
const READ_BY_HAND: Record<string, string> = {
  "app/api/progress-notes/[id]/route.ts":
    "DELETE and PATCH hand `params` to setRemoved() in the same file, which tests the id with UUID.test before its first query and answers 404 Note not found",
}

/**
 * Routes not brought under the rule, each with what is still wrong. A file leaves this list when
 * it is mended; the walk fails if a listed file is already clean.
 */
const READINESS =
  "the project id goes straight to readinessAuth (lib/readiness/route-auth.ts), which is also where the signed-in check is, so a check in the route would answer before it. " +
  "A malformed id already answers 404 Project not found here, because the access helpers catch the database's refusal, but they log it as an error. " +
  "The mend is one isUuid line inside readinessAuth after its signed-in check."
const REMAINING: Record<string, string> = {
  "app/api/projects/[id]/readiness/route.ts": READINESS,
  "app/api/projects/[id]/readiness/export/route.ts": READINESS,
  "app/api/projects/[id]/readiness/sync/route.ts": READINESS,
  "app/api/projects/[id]/readiness/validations/[itemId]/route.ts": READINESS,
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
const files = routeFiles(join(root, "app", "api"))
  .map((f) => relative(root, f).split(sep).join("/"))
  .filter((f) => segmentsOf(f).length > 0)
  .sort()

let dirty = 0
let stillOpen = 0
let byHand = 0
for (const file of files) {
  const notIds = (NOT_IDS[file] ?? []).map((n) => n.segment)
  const findings = unchecked(file, readFileSync(join(root, file), "utf8"), notIds)
  const listed = file in REMAINING || file in READ_BY_HAND
  if (listed && findings.length === 0) {
    failed++
    console.log(`FAIL ${file} is clean: take it off the list it is named on`)
  } else if (file in REMAINING) {
    stillOpen++
  } else if (file in READ_BY_HAND) {
    byHand++
  } else if (findings.length > 0) {
    failed++
    dirty++
    console.log(`FAIL ${file}`)
    for (const f of findings) console.log(`     ${f.handler} [${f.segment}] ${f.problem}: ${f.detail}`)
  }
}
for (const file of [...Object.keys(REMAINING), ...Object.keys(READ_BY_HAND), ...Object.keys(NOT_IDS)]) {
  if (!files.includes(file)) {
    failed++
    console.log(`FAIL ${file} is named in this check but is not a route with a path id any more`)
  }
}
eq("route files with a path id were found", files.length > 50, true)
console.log(
  `${dirty === 0 ? "ok  " : "FAIL"} ${files.length - stillOpen - byHand - dirty} of ${files.length} route files check their path ids first` +
    (byHand ? `; ${byHand} read by hand` : "") +
    (stillOpen ? `; ${stillOpen} named as remaining: ${Object.keys(REMAINING).join(", ")}` : "") +
    (dirty ? `; ${dirty} do not` : ""),
)

console.log(failed ? `\n${failed} FAILED` : "\nall passed")
if (failed) process.exit(1)
