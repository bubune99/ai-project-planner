/**
 * Run: npx -y tsx@4.23.15 lib/api/access-twice.assert.ts
 *
 * Two parts: the reading rule against small made-up routes, then every route file under app/api.
 * See access-twice.ts for what the rule can and cannot tell.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { askedTwice } from "./access-twice"

let failed = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}
const repeats = (source: string) => askedTwice(source).map((r) => `${r.handler} ${r.question}(${r.args}) x${r.times}`)

// ---------------------------------------------------------------- the reading rule

const asItWas = `
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { id: projectId } = await params;
    // Verify project ownership
    const hasAccess = await verifyProjectWriteAccess(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });
    }
    // Viewers are read-only: writes need owner/editor/admin.
    if (!(await verifyProjectWriteAccess(projectId, userId))) {
      return NextResponse.json({ error: "You have view-only access to this project", code: "FORBIDDEN" }, { status: 403 });
    }
  } catch (error) {}
}
`
eq("the card route as it was: write access asked twice", repeats(asItWas), ["PATCH write(projectId, userId) x2"])
eq(
  "read first, then write: clean",
  repeats(asItWas.replace("const hasAccess = await verifyProjectWriteAccess", "const hasAccess = await verifyProjectOwnership")),
  [],
)
eq(
  "the same fault under the other name",
  repeats(asItWas.replace('if (!(await verifyProjectWriteAccess(projectId, userId)))', 'if (!(await verifyCollaboratorAccess(projectId, userId, "editor")))')),
  ["PATCH write(projectId, userId) x2"],
)
eq(
  "another role is another question",
  repeats(asItWas.replace('if (!(await verifyProjectWriteAccess(projectId, userId)))', 'if (!(await verifyCollaboratorAccess(projectId, userId, "admin")))')),
  [],
)
eq(
  "the same question about two projects is two questions",
  repeats("export async function POST() {\n  if (!(await verifyProjectWriteAccess(fromId, userId))) return no()\n  if (!(await verifyProjectWriteAccess(toId, userId))) return no()\n}\n"),
  [],
)
eq(
  "each handler is judged on its own",
  repeats("export async function POST() {\n  if (!(await verifyProjectWriteAccess(id, userId))) return no()\n}\n\nexport async function DELETE() {\n  if (!(await verifyProjectWriteAccess(id, userId))) return no()\n}\n"),
  [],
)
eq(
  "spacing does not hide it",
  repeats("export async function POST() {\n  await verifyProjectOwnership(id,userId)\n  await verifyProjectOwnership( id , userId )\n}\n"),
  ["POST read(id, userId) x2"],
)
eq(
  "a call named in a comment is not asked",
  repeats("export async function POST() {\n  // verifyProjectWriteAccess(id, userId) was asked here once\n  if (!(await verifyProjectWriteAccess(id, userId))) return no()\n}\n"),
  [],
)
eq("Windows line endings read the same", repeats(asItWas.replace(/\n/g, "\r\n")), ["PATCH write(projectId, userId) x2"])

// ---------------------------------------------------------------- every route under app/api

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

let asking = 0
let dirty = 0
for (const file of files) {
  const source = readFileSync(join(root, file), "utf8")
  if (!/verifyProject(?:Ownership|WriteAccess)\(|verifyCollaboratorAccess\(/.test(source)) continue
  asking++
  const found = askedTwice(source)
  if (found.length === 0) continue
  failed++
  dirty++
  console.log(`FAIL ${file}`)
  for (const r of found) console.log(`     ${r.handler} asks the ${r.question} question about (${r.args}) ${r.times} times: the later answer can never be given`)
}
eq("route files that ask an access question were found", asking > 40, true)
console.log(`${dirty === 0 ? "ok  " : "FAIL"} ${asking - dirty} of ${asking} route files that ask a project access question ask each one once per handler${dirty ? `; ${dirty} do not` : ""}`)

console.log(failed ? `\n${failed} FAILED` : "\nall passed")
if (failed) process.exit(1)
