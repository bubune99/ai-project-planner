/**
 * Unit tests for lib/catalog/scan.ts
 *
 * Run with: npx -y tsx@4.23.15 lib/catalog/scan.test.ts
 *
 * Tests cover:
 *   - SQL migration file parsing (db_table, db_column, db_enum, db_matview)
 *   - API route scanning (api_route, method detection, path derivation)
 *   - UI page scanning (ui_page, has_use_client)
 *   - Env file scanning (env_var, never emits values)
 *   - Config file scanning (config_file, key extraction)
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { scanPaths } from "./scan"
import { filterScannableFiles } from "./types"

// ============================================================================
// Tiny test harness (no external dependencies)
// ============================================================================

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures.push(`FAIL: ${message}`)
    failed++
  } else {
    passed++
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`FAIL: ${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
    failed++
  } else {
    passed++
  }
}

// ============================================================================
// Test fixture helpers
// ============================================================================

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "catalog-scan-test-"))
}

function writeFile(dir: string, relPath: string, content: string): string {
  const abs = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, "utf8")
  return relPath
}

// ============================================================================
// Test: SQL migration — db_table + db_column
// ============================================================================

async function testSqlTableAndColumns(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "lib/db/migrations/001_test.sql", `
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `)

  const result = await scanPaths({ projectRoot: dir, files: ["lib/db/migrations/001_test.sql"] })

  const tableRow = result.detected_surfaces.find((s) => s.canonical_id === "db:skills")
  assert(tableRow !== undefined, "should detect db:skills table")
  assert(tableRow?.kind === "db_table", "table kind should be db_table")

  const colId = result.detected_surfaces.find((s) => s.canonical_id === "db:skills.id")
  assert(colId !== undefined, "should detect db:skills.id column")
  assert(colId?.kind === "db_column", "column kind should be db_column")

  const colDesc = result.detected_surfaces.find((s) => s.canonical_id === "db:skills.description")
  assert(colDesc !== undefined, "should detect nullable column description")
  assert((colDesc?.signature as Record<string, unknown>).nullable === true, "description should be nullable")

  const colName = result.detected_surfaces.find((s) => s.canonical_id === "db:skills.name")
  assert(colName !== undefined, "should detect skills.name column")

  assert(result.warnings.length === 0, `no warnings expected, got: ${result.warnings.join(", ")}`)

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: SQL migration — db_enum
// ============================================================================

async function testSqlEnum(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "lib/db/migrations/002_enums.sql", `
CREATE TYPE skill_status AS ENUM ('draft', 'active', 'deprecated');
  `)

  const result = await scanPaths({ projectRoot: dir, files: ["lib/db/migrations/002_enums.sql"] })

  const enumRow = result.detected_surfaces.find((s) => s.canonical_id === "enum:skill_status")
  assert(enumRow !== undefined, "should detect enum:skill_status")
  assert(enumRow?.kind === "db_enum", "kind should be db_enum")
  const sig = enumRow?.signature as Record<string, unknown>
  assert(Array.isArray(sig.values), "enum values should be array")
  assert((sig.values as string[]).includes("active"), "enum should have 'active'")
  assert((sig.values as string[]).length === 3, "enum should have 3 values")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: SQL migration — db_matview
// ============================================================================

async function testSqlMatview(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "lib/db/migrations/003_views.sql", `
CREATE MATERIALIZED VIEW IF NOT EXISTS skill_usage_summary AS
  SELECT s.id, s.name, COUNT(u.id) as usage_count
  FROM skills s
  JOIN skill_usages u ON u.skill_id = s.id
  GROUP BY s.id, s.name;
  `)

  const result = await scanPaths({ projectRoot: dir, files: ["lib/db/migrations/003_views.sql"] })

  const matview = result.detected_surfaces.find((s) => s.canonical_id === "matview:skill_usage_summary")
  assert(matview !== undefined, "should detect matview:skill_usage_summary")
  assert(matview?.kind === "db_matview", "kind should be db_matview")
  const sig = matview?.signature as Record<string, unknown>
  const tables = sig.depends_on_tables as string[]
  assert(Array.isArray(tables), "depends_on_tables should be array")
  assert(tables.includes("skills"), "should detect 'skills' table reference")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: API route scanner
// ============================================================================

async function testApiRoute(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "app/api/skills/route.ts", `
import { getAuthContext } from '@/lib/auth/auth-utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createSchema = z.object({ name: z.string(), description: z.string() })

export async function GET(req: Request) {
  const ctx = await getAuthContext(req)
  return Response.json({ skills: [] })
}

export async function POST(req: Request) {
  const ctx = await getAuthContext(req)
  const body = createSchema.parse(await req.json())
  return Response.json({ created: true })
}
  `)

  const result = await scanPaths({ projectRoot: dir, files: ["app/api/skills/route.ts"] })

  const getRoute = result.detected_surfaces.find((s) => s.canonical_id === "route:GET /api/skills")
  assert(getRoute !== undefined, "should detect route:GET /api/skills")
  assert(getRoute?.kind === "api_route", "kind should be api_route")
  const getSig = getRoute?.signature as Record<string, unknown>
  assert(getSig.method === "GET", "method should be GET")
  assert(getSig.path === "/api/skills", "path should be /api/skills")
  assert(getSig.auth_check === "present", "GET should detect auth check")

  const postRoute = result.detected_surfaces.find((s) => s.canonical_id === "route:POST /api/skills")
  assert(postRoute !== undefined, "should detect route:POST /api/skills")
  const postSig = postRoute?.signature as Record<string, unknown>
  assert(postSig.body_validation === "present", "POST should detect body validation")
  assert(postSig.auth_check === "present", "POST should detect auth check")

  // No PATCH/DELETE exported, so they should not appear
  const patchRoute = result.detected_surfaces.find((s) => s.canonical_id === "route:PATCH /api/skills")
  assert(patchRoute === undefined, "should not detect PATCH (not exported)")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: MCP tools declared outside app/mcp (lib/mcp/*.ts), with .optional().describe() chains (card d101bb88)
// ============================================================================

async function testMcpToolsInLib(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "lib/mcp/sample-tools.ts", `
import { z } from "zod"
export function registerSampleTools(server: any) {
  server.tool(
    "ask_sample",
    "Ask a sample question",
    {
      question: z.string().describe("The question"),
      options: z.array(z.string()).optional().describe("Choices"),
      projectId: z.string().optional().describe("Project"),
    },
    async () => ({ content: [] })
  )
}
  `)
  const result = await scanPaths({ projectRoot: dir, files: ["lib/mcp/sample-tools.ts"] })
  const tool = result.detected_surfaces.find((s) => s.canonical_id === "mcp:ask_sample")
  assert(tool !== undefined, "should detect mcp:ask_sample declared in lib/mcp")
  assertEqual((tool?.signature as Record<string, unknown>)?.input_arg_names, ["question", "options", "projectId"], "arg names read through .optional().describe() chains")
  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: API route — dynamic segments
// ============================================================================

async function testApiRouteDynamicSegments(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "app/api/skills/[id]/route.ts", `
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return Response.json({ id: params.id })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return Response.json({ deleted: true })
}
  `)

  const result = await scanPaths({ projectRoot: dir, files: ["app/api/skills/[id]/route.ts"] })

  const getRoute = result.detected_surfaces.find((s) => s.canonical_id === "route:GET /api/skills/[id]")
  assert(getRoute !== undefined, "should detect route:GET /api/skills/[id]")
  const sig = getRoute?.signature as Record<string, unknown>
  assert(Array.isArray(sig.dynamic_segments), "should have dynamic_segments array")
  assert((sig.dynamic_segments as string[]).includes("id"), "dynamic_segments should include 'id'")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: UI page scanner
// ============================================================================

async function testUiPage(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "app/dashboard/page.tsx", `
"use client"

export default function DashboardPage() {
  return <div>Dashboard</div>
}
  `)
  writeFile(dir, "app/catalog/page.tsx", `
import { getSomeData } from '@/lib/data'

export default async function CatalogPage() {
  const data = await getSomeData()
  return <div>{JSON.stringify(data)}</div>
}
  `)

  const result = await scanPaths({
    projectRoot: dir,
    files: ["app/dashboard/page.tsx", "app/catalog/page.tsx"],
  })

  const dashPage = result.detected_surfaces.find((s) => s.canonical_id === "ui:/dashboard")
  assert(dashPage !== undefined, "should detect ui:/dashboard")
  assert(dashPage?.kind === "ui_page", "kind should be ui_page")
  const dashSig = dashPage?.signature as Record<string, unknown>
  assert(dashSig.has_use_client === true, "dashboard page should have use client")
  assert(dashSig.route === "/dashboard", "route should be /dashboard")

  const catalogPage = result.detected_surfaces.find((s) => s.canonical_id === "ui:/catalog")
  assert(catalogPage !== undefined, "should detect ui:/catalog")
  const catSig = catalogPage?.signature as Record<string, unknown>
  assert(catSig.has_use_client === false, "catalog page should not have use client")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: Env file scanner — never emits values
// ============================================================================

async function testEnvFile(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, ".env", `
# Database
DATABASE_URL=postgres://user:secret@host/db

# Stripe
STRIPE_SECRET_KEY=sk_live_abc123

# Optional
NEXT_PUBLIC_APP_URL=
  `)

  const result = await scanPaths({ projectRoot: dir, files: [".env"] })

  const dbUrl = result.detected_surfaces.find((s) => s.canonical_id === "env:DATABASE_URL")
  assert(dbUrl !== undefined, "should detect env:DATABASE_URL")
  assert(dbUrl?.kind === "env_var", "kind should be env_var")

  // CRITICAL: values must NEVER appear in signature
  const dbSig = dbUrl?.signature as Record<string, unknown>
  assert(!JSON.stringify(dbSig).includes("secret"), "should never emit secret value in signature")
  assert(!JSON.stringify(dbSig).includes("postgres://"), "should never emit connection string")
  assert(dbSig.has_default === true, "DATABASE_URL has a default (set in .env)")

  const stripeKey = result.detected_surfaces.find((s) => s.canonical_id === "env:STRIPE_SECRET_KEY")
  assert(stripeKey !== undefined, "should detect env:STRIPE_SECRET_KEY")
  const stripeSig = stripeKey?.signature as Record<string, unknown>
  assert(!JSON.stringify(stripeSig).includes("sk_live"), "must not emit actual Stripe key")

  const appUrl = result.detected_surfaces.find((s) => s.canonical_id === "env:NEXT_PUBLIC_APP_URL")
  assert(appUrl !== undefined, "should detect env:NEXT_PUBLIC_APP_URL")
  const appSig = appUrl?.signature as Record<string, unknown>
  assert(appSig.has_default === false, "empty value = no default")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: Config file scanner
// ============================================================================

async function testConfigFile(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "vercel.json", JSON.stringify({
    buildCommand: "pnpm build",
    outputDirectory: ".next",
    framework: "nextjs",
    regions: ["iad1"],
  }))

  const result = await scanPaths({ projectRoot: dir, files: ["vercel.json"] })

  const configRow = result.detected_surfaces.find((s) => s.canonical_id === "config:vercel.json")
  assert(configRow !== undefined, "should detect config:vercel.json")
  assert(configRow?.kind === "config_file", "kind should be config_file")
  const sig = configRow?.signature as Record<string, unknown>
  const keys = sig.keys as string[]
  assert(Array.isArray(keys), "keys should be array")
  assert(keys.includes("buildCommand"), "should include buildCommand key")
  assert(keys.includes("framework"), "should include framework key")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: scan type is 'targeted' when files are provided
// ============================================================================

async function testScanTypeTargeted(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "lib/db/migrations/001_t.sql", `
CREATE TABLE test_scan (id UUID PRIMARY KEY);
  `)

  const resultTargeted = await scanPaths({
    projectRoot: dir,
    files: ["lib/db/migrations/001_t.sql"],
  })
  assert(resultTargeted.scan_type === "targeted", "should be targeted when files provided")

  const resultFull = await scanPaths({ projectRoot: dir })
  assert(resultFull.scan_type === "full", "should be full when no files provided")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: webhook endpoint detection
// ============================================================================

async function testWebhookEndpoint(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "app/api/catalog/webhooks/github/route.ts", `
export async function POST(req: Request) {
  return Response.json({ received: true })
}
  `)

  const result = await scanPaths({
    projectRoot: dir,
    files: ["app/api/catalog/webhooks/github/route.ts"],
  })

  const route = result.detected_surfaces.find(
    (s) => s.canonical_id === "route:POST /api/catalog/webhooks/github"
  )
  assert(route !== undefined, "should detect webhook route")
  const sig = route?.signature as Record<string, unknown>
  assert(sig.is_webhook === true, "webhook route should have is_webhook=true")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: skipDirs keeps a full scan out of the named folders
// ============================================================================

async function testSkipDirs(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "lib/db/migrations/001_kept.sql", `CREATE TABLE kept_table (id UUID PRIMARY KEY);`)
  writeFile(dir, "vercel.json", JSON.stringify({ framework: "nextjs" }))

  const all = await scanPaths({ projectRoot: dir })
  assert(all.detected_surfaces.some((s) => s.canonical_id === "db:kept_table"), "full scan finds the table without skipDirs")

  const skipped = await scanPaths({ projectRoot: dir, skipDirs: ["lib/db/"] })
  assert(!skipped.detected_surfaces.some((s) => s.canonical_id === "db:kept_table"), "skipDirs keeps the scan out of lib/db")
  assert(skipped.detected_surfaces.some((s) => s.canonical_id === "config:vercel.json"), "skipDirs leaves the rest of the tree alone")
  assert(!skipped.scanned_files.some((f) => f.startsWith("lib/db/")), "skipped files are not listed as scanned")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Test: a full scan finds files at any depth (first real run found 89 of ~900: "[...]" is not "any folders")
// ============================================================================

async function testFullDiscoveryDepth(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "app/api/skills/route.ts", `export async function GET() { return Response.json({}) }`)
  writeFile(dir, "app/api/projects/[id]/gates/plan/route.ts", `export async function GET() { return Response.json({}) }`)
  writeFile(dir, "app/project/[id]/page.tsx", `export default function P() { return null }`)
  writeFile(dir, "components/Top.tsx", `export function Top() { return null }`)
  writeFile(dir, "components/project/opx/Deep.tsx", `export function Deep() { return null }`)
  writeFile(dir, "lib/top.ts", `export type Top = string`)
  writeFile(dir, "lib/gates/deep/model.ts", `export type Deep = string`)
  writeFile(dir, "lib/mcp/tools.ts", `export function reg(server: any) { server.tool("deep_tool", "d", {}, async () => ({})) }`)
  writeFile(dir, "node_modules/pkg/lib/x.ts", `export type Hidden = string`)
  writeFile(dir, "lib/node_modules/pkg/y.ts", `export type Hidden2 = string`)

  const result = await scanPaths({ projectRoot: dir })
  const ids = new Set(result.detected_surfaces.map((s) => s.canonical_id))
  for (const id of [
    "route:GET /api/skills",
    "route:GET /api/projects/[id]/gates/plan",
    "ui:/project/[id]",
    "component:components/Top.tsx:Top",
    "component:components/project/opx/Deep.tsx:Deep",
    "type:lib/top.ts:Top",
    "type:lib/gates/deep/model.ts:Deep",
    "mcp:deep_tool",
  ]) {
    assert(ids.has(id), `full scan should find ${id}`)
  }
  assert(![...ids].some((id) => id.includes("Hidden")), "node_modules is never scanned, at any depth")

  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Cases met on the first real runs over this repo (card 3dda57d3). Each one was wrong or missing in the result.
// ============================================================================

const sigOf = (result: { detected_surfaces: Array<{ canonical_id: string; signature: Record<string, unknown> }> }, id: string) =>
  result.detected_surfaces.find((s) => s.canonical_id === id)?.signature as Record<string, unknown> | undefined

const edgesOf = (result: { detected_dependencies: Array<{ from_canonical_id: string; to_canonical_id: string; kind: string }> }, from: string, kind: string) =>
  result.detected_dependencies.filter((d) => d.from_canonical_id === from && d.kind === kind).map((d) => d.to_canonical_id).sort()

async function testPagesAndRoutesAnywhere(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "app/page.tsx", `export default function Home() { return null }`)
  writeFile(dir, "app/(auth)/sign-in/page.tsx", `export default function SignIn() { return null }`)
  writeFile(dir, "app/mcp/route.ts", `
const handleWithAuth = async (req: Request) => { await validateMcpApiKey(req); return new Response("ok") }
export const GET = handleWithAuth
export const POST = handleWithAuth
`)
  writeFile(dir, "app/.well-known/oauth-protected-resource/[[...slug]]/route.ts", `export async function GET() { return Response.json({}) }`)
  writeFile(dir, "app/(auth)/api/login/route.ts", `export async function POST() { return Response.json({}) }`)

  const result = await scanPaths({ projectRoot: dir })
  const ids = new Set(result.detected_surfaces.map((s) => s.canonical_id))
  assert(ids.has("ui:/"), "the root page app/page.tsx is ui:/")
  assert(ids.has("ui:/sign-in"), "a route group (auth) is not part of the page's address")
  assert(ids.has("route:GET /mcp") && ids.has("route:POST /mcp"), "a route handler outside app/api is still a route (export const GET = handler)")
  assertEqual(sigOf(result, "route:POST /mcp")?.auth_check, "present", "auth found through the const the handler is assigned from")
  assert(ids.has("route:GET /.well-known/oauth-protected-resource/[[...slug]]"), "a route under a dot folder with an optional catch-all is found")
  assertEqual(sigOf(result, "route:GET /.well-known/oauth-protected-resource/[[...slug]]")?.dynamic_segments, ["...slug"], "optional catch-all segment is named without brackets")
  assert(ids.has("route:POST /api/login"), "a route group is not part of a route's address")

  // The push filter must let through every file the scanner would read, and nothing it would not.
  assertEqual(
    filterScannableFiles(["app/page.tsx", "app/mcp/route.ts", "app/.well-known/x/[[...slug]]/route.ts", "app/api/a/route.ts", "lib/x.assert.ts", "components/y.assert.ts", "README.md"]).scannable,
    ["app/page.tsx", "app/mcp/route.ts", "app/.well-known/x/[[...slug]]/route.ts", "app/api/a/route.ts"],
    "a push that changes the root page or a route outside app/api is scanned; check files are not",
  )
  fs.rmSync(dir, { recursive: true, force: true })
}

async function testSqlAwkwardTables(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "lib/db/migrations/001_a.sql", `
-- We do not CREATE TABLE for nothing; this comment has a semicolon and an apostrophe: isn't it.
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- owner; never null
  name        TEXT NOT NULL,                -- contact / primary name
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('draft','active','archived')),
  kind        VARCHAR(50) NOT NULL
                CHECK (
                  kind IN ('a', 'b')
                ),
  step_id     UUID REFERENCES project_steps(id),
  tags        TEXT[] DEFAULT '{}',
  amount      NUMERIC(12, 2),
  seen_at     TIMESTAMP WITH TIME ZONE,
  ratio       DOUBLE PRECISION,
  note        TEXT DEFAULT 'a;b',
  CONSTRAINT one_target CHECK (
    step_id IS NOT NULL OR name IS NOT NULL
  ),
  UNIQUE (user_id, name)
);
/* a block comment; with a semicolon */
CREATE TABLE public.audit_log (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO seeds (sql_text) VALUES ('DROP TABLE clients; CREATE TABLE fake (id INT);');
`)
  const result = await scanPaths({ projectRoot: dir, files: ["lib/db/migrations/001_a.sql"] })
  const ids = result.detected_surfaces.map((s) => s.canonical_id)
  assert(ids.includes("db:clients"), "a table whose comments contain a semicolon is found")
  assert(!ids.includes("db:for"), "CREATE TABLE inside a comment is not a table")
  assert(!ids.includes("db:fake"), "CREATE TABLE inside a string is not a table")
  assert(ids.includes("db:audit_log"), "a schema-qualified one-line table is found by its own name")
  assertEqual(
    ids.filter((i) => i.startsWith("db:clients.")).sort(),
    ["amount", "id", "kind", "name", "note", "ratio", "seen_at", "status", "step_id", "tags", "user_id"].map((c) => `db:clients.${c}`),
    "each column once; lines that continue a CHECK are not columns",
  )
  assertEqual(sigOf(result, "db:clients.kind"), { type: "VARCHAR(50)", nullable: false, check: "kind IN ('a', 'b')" }, "type stops at the type; multi-line CHECK kept whole")
  assertEqual(sigOf(result, "db:clients.step_id"), { type: "UUID", nullable: true, references: "project_steps.id" }, "REFERENCES is not part of the type")
  assertEqual(sigOf(result, "db:clients.tags")?.type, "TEXT[]", "array type")
  assertEqual(sigOf(result, "db:clients.amount")?.type, "NUMERIC(12,2)", "precision and scale")
  assertEqual(sigOf(result, "db:clients.seen_at")?.type, "TIMESTAMP WITH TIME ZONE", "multi-word type")
  assertEqual(sigOf(result, "db:clients.ratio")?.type, "DOUBLE PRECISION", "two-word type")
  assertEqual(sigOf(result, "db:clients.id")?.nullable, false, "a primary key is not nullable")
  assertEqual(sigOf(result, "db:clients.note")?.default, "'a;b'", "a semicolon inside a default does not end the table")
  assertEqual((sigOf(result, "db:clients")?.constraints as string[])?.length, 2, "table-level constraints kept, each once")
  assertEqual(sigOf(result, "db:audit_log.at"), { type: "TIMESTAMPTZ", nullable: false, default: "now()" }, "one-line table columns")
  assertEqual(new Set(ids).size, ids.length, "no id is emitted twice")
  fs.rmSync(dir, { recursive: true, force: true })
}

async function testSqlAlterAndDrop(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "lib/db/migrations/001_base.sql", `
CREATE TABLE project_steps (id UUID PRIMARY KEY, title TEXT NOT NULL, legacy TEXT);
CREATE TABLE old_things (id UUID PRIMARY KEY);
`)
  writeFile(dir, "lib/db/migrations/002_more.sql", `
ALTER TABLE project_steps
  ADD COLUMN IF NOT EXISTS work_kind TEXT NOT NULL DEFAULT 'task' CHECK (work_kind IN ('task', 'initiative')),
  ADD COLUMN claimed_by_id UUID REFERENCES agents(id);
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE project_steps ADD CONSTRAINT title_len CHECK (length(title) < 500);
ALTER TABLE IF EXISTS project_steps DROP COLUMN IF EXISTS legacy;
DROP TABLE IF EXISTS old_things CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_steps' AND column_name = 'source_todo_id') THEN
    ALTER TABLE project_steps ADD COLUMN source_todo_id UUID;
  END IF;
END $$;
`)
  const result = await scanPaths({ projectRoot: dir })
  const ids = result.detected_surfaces.map((s) => s.canonical_id)
  assertEqual(
    ids.filter((i) => i.startsWith("db:project_steps.")).sort(),
    ["claimed_by_id", "id", "source_todo_id", "title", "work_kind"].map((c) => `db:project_steps.${c}`),
    "columns added by ALTER TABLE are found, a dropped one is gone, an existing one is not repeated",
  )
  assertEqual(sigOf(result, "db:project_steps.work_kind"), { type: "TEXT", nullable: false, default: "'task'", check: "work_kind IN ('task', 'initiative')" }, "an added column is read like any other")
  assertEqual(sigOf(result, "db:project_steps.title")?.nullable, false, "the first definition of a column wins")
  assertEqual(
    (sigOf(result, "db:project_steps")?.columns as Array<{ name: string }>).map((c) => c.name),
    ["id", "title", "work_kind", "claimed_by_id", "source_todo_id"],
    "the table's own column list follows the migrations",
  )
  const added = result.detected_surfaces.find((s) => s.canonical_id === "db:project_steps.work_kind")
  assertEqual(added?.location.file_path, "lib/db/migrations/002_more.sql", "an added column points at the migration that added it")
  assert(!ids.some((i) => i.startsWith("db:old_things")), "a dropped table and its columns are gone")

  // A targeted scan of only the later migration: the column is still reported, with no table to hang it on.
  const targeted = await scanPaths({ projectRoot: dir, files: ["lib/db/migrations/002_more.sql"] })
  assert(targeted.detected_surfaces.some((s) => s.canonical_id === "db:project_steps.claimed_by_id"), "a targeted scan of an ALTER migration still reports the new column")
  assert(!targeted.detected_surfaces.some((s) => s.canonical_id === "db:project_steps"), "and does not invent the table")
  fs.rmSync(dir, { recursive: true, force: true })
}

async function testPerHandlerAuthAndData(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "lib/db/migrations/001.sql", `
CREATE TABLE things (id UUID PRIMARY KEY);
CREATE TABLE thing_log (id UUID PRIMARY KEY);
CREATE TABLE owners (id UUID PRIMARY KEY);
CREATE TABLE archive (id UUID PRIMARY KEY);
CREATE MATERIALIZED VIEW thing_totals AS SELECT count(*) AS n FROM things;
`)
  writeFile(dir, "app/api/things/totals/route.ts", `
import { sql } from "@/lib/db/client"
export async function GET() { return Response.json(await sql\`SELECT n FROM thing_totals\`) }
`)
  writeFile(dir, "app/api/things/route.ts", `
import { sql } from "@/lib/db/client"
import { getAuthContext } from "@/lib/auth"
import { z } from "zod"

const Body = z.object({ name: z.string() })

async function logIt(id: string) {
  await sql\`INSERT INTO thing_log (id) VALUES (\${id})\`
}
async function saveThing(name: string) {
  const rows = await sql\`INSERT INTO things (name) VALUES (\${name}) RETURNING id\`
  await logIt(rows[0].id)
}

export async function GET(req: Request) {
  const ctx = await getAuthContext(req)
  const filter = ctx.all ? sql\`\` : sql\`AND t.owner_id = \${ctx.userId}\`
  return Response.json(await sql\`
    SELECT t.*, EXTRACT(EPOCH FROM t.created_at) AS age
    FROM things t
    LEFT JOIN owners o ON o.id = t.owner_id
    WHERE t.deleted_at IS DISTINCT FROM now() \${filter}
  \`)
}

export async function POST(req: Request) {
  const ctx = await getAuthContext(req)
  const body = Body.parse(await req.json())
  await saveThing(body.name)
  return Response.json({ ok: true })
}

export const PATCH = async (req: Request) => {
  await sql\`
    WITH moved AS (DELETE FROM things WHERE old RETURNING *)
    INSERT INTO archive SELECT * FROM moved
  \`
  await sql\`UPDATE things AS t SET name = o.name FROM owners o WHERE o.id = t.owner_id\`
  await sql\`INSERT INTO things (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET name = 'x'\`
  return Response.json({ ok: true })
}

// No auth at all, and the only handler that deletes.
export async function DELETE(req: Request) {
  await sql.query("DELETE FROM things WHERE id = $1", [1])
  return Response.json({ ok: true })
}
`)
  writeFile(dir, "app/api/cron/tidy/route.ts", `
import { sql } from "@/lib/db/client"
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && request.headers.get("authorization") === "Bearer " + secret
}
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("no", { status: 401 })
  const rows = await sql\`SELECT id FROM generate_series(1, 3) AS id\`
  return Response.json(rows)
}
`)
  const result = await scanPaths({ projectRoot: dir })

  assertEqual(sigOf(result, "route:GET /api/things")?.auth_check, "present", "GET checks auth")
  assertEqual(sigOf(result, "route:GET /api/things")?.auth_via, ["getAuthContext"], "and says through what")
  assertEqual(sigOf(result, "route:DELETE /api/things")?.auth_check, "absent", "a handler with no check is absent even when its neighbours check")
  assertEqual(sigOf(result, "route:PATCH /api/things")?.auth_check, "absent", "an arrow-function handler is read on its own too")
  assertEqual(sigOf(result, "route:GET /api/things")?.body_validation, "absent", "validation is per handler: GET does none")
  assertEqual(sigOf(result, "route:POST /api/things")?.body_validation, "present", "POST validates through the schema const it uses")
  assertEqual(sigOf(result, "route:GET /api/cron/tidy")?.auth_check, "present", "a secret check in a local function the handler calls counts")
  assertEqual(sigOf(result, "route:GET /api/cron/tidy")?.auth_via, ["CRON_SECRET"], "the secret is named, never read")

  assertEqual(edgesOf(result, "route:GET /api/things", "reads_from"), ["db:owners", "db:things"], "GET reads the FROM and JOIN tables only (not EXTRACT ... FROM, not IS DISTINCT FROM)")
  assertEqual(edgesOf(result, "route:GET /api/things", "writes_to"), [], "GET does not inherit its neighbours' writes")
  assertEqual(edgesOf(result, "route:POST /api/things", "writes_to"), ["db:thing_log", "db:things"], "POST writes through the local functions it calls, two deep")
  assertEqual(edgesOf(result, "route:PATCH /api/things", "writes_to"), ["db:archive", "db:things"], "DELETE in a WITH, INSERT ... SELECT, UPDATE ... FROM and ON CONFLICT DO UPDATE name the written tables")
  assertEqual(edgesOf(result, "route:PATCH /api/things", "reads_from"), ["db:owners"], "UPDATE ... FROM reads the other table; a WITH name is not a table")
  assertEqual(edgesOf(result, "route:DELETE /api/things", "writes_to"), ["db:things"], "sql.query(\"...\") is read too")
  assertEqual(edgesOf(result, "route:GET /api/cron/tidy", "reads_from"), [], "FROM a function call is not a table")
  assert(!result.detected_surfaces.some((s) => s.canonical_id === "db:thing_totals"), "a materialized view is not a table")
  assertEqual(edgesOf(result, "route:GET /api/things/totals", "reads_from"), ["matview:thing_totals"], "reading a materialized view points at the view, not at a table that does not exist")
  fs.rmSync(dir, { recursive: true, force: true })
}

async function testComponentsAndHooks(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "components/ui/button.tsx", `
import * as React from "react"
const buttonVariants = (x: string) => x
const Button = React.forwardRef<HTMLButtonElement, {}>((props, ref) => <button ref={ref} {...props} />)
Button.displayName = "Button"
export { Button, buttonVariants }
`)
  writeFile(dir, "components/board/Board.tsx", `
"use client"
export const DEFAULT_STATUSES = ["a", "b"]
export const STATUS_LABEL: Record<string, string> = { a: "A" }
export const Card = ({ title }: { title: string }) => <div>{title}</div>
export const Fancy = React.memo(function Fancy() { return null })
function KanbanBoard() { return null }
export { KanbanBoard as Component }
export function useBoard() { return 1 }
export const useLanes = () => 2
`)
  writeFile(dir, "components/board/index.ts", `export { Card } from "./Board"\nexport * from "../ui/button"`)
  writeFile(dir, "components/board/board.assert.ts", `export const Looks = 1`)
  writeFile(dir, "lib/hooks/use-thing.ts", `export const useThing = () => 1\nexport function helper() { return 2 }`)

  const result = await scanPaths({ projectRoot: dir })
  const ids = result.detected_surfaces.map((s) => s.canonical_id).sort()
  assert(ids.includes("component:components/ui/button.tsx:Button"), "a component exported in a list (export { Button }) is found")
  assert(!ids.includes("component:components/ui/button.tsx:buttonVariants"), "a lower-case name in the list is not a component")
  assert(ids.includes("component:components/board/Board.tsx:Card"), "arrow-function component")
  assert(ids.includes("component:components/board/Board.tsx:Fancy"), "memo-wrapped component")
  assert(ids.includes("component:components/board/Board.tsx:Component"), "a renamed export goes by its exported name")
  assert(!ids.some((i) => i.includes("DEFAULT_STATUSES") || i.includes("STATUS_LABEL")), "an exported constant is not a component")
  assert(ids.includes("hook:components/board/Board.tsx:useBoard"), "a hook that lives beside components is a hook")
  assert(ids.includes("hook:components/board/Board.tsx:useLanes"), "an arrow-function hook too")
  assert(ids.includes("hook:lib/hooks/use-thing.ts:useThing"), "an arrow-function hook in lib")
  assert(!ids.some((i) => i.includes("board.assert")), "check files are not catalogued")
  assertEqual(sigOf(result, "component:components/board/Board.tsx:Card")?.has_use_client, true, "use client still read")
  fs.rmSync(dir, { recursive: true, force: true })
}

async function testImportEdgesHaveBothEnds(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "components/ui/button.tsx", `const Button = () => null\nexport { Button }`)
  writeFile(dir, "components/board/Board.tsx", `
import { Button } from "@/components/ui/button"
import type { Lane } from "../../lib/board/types"
export function Board() { return <Button /> }
export function BoardHeader() { return null }
`)
  writeFile(dir, "components/board/index.ts", `export { Board } from "./Board"\nexport * from "../ui/button"`)
  writeFile(dir, "components/Shell.tsx", `export default function Shell() { return null }`)
  writeFile(dir, "lib/board/types.ts", `import { z } from "zod"\nexport interface Lane { id: string }\nexport const LaneSchema = z.object({ id: z.string() })\nexport type LaneSchema = z.infer<typeof LaneSchema>\nexport function lanesOf() { return [] }`)
  writeFile(dir, "app/board/page.tsx", `
import Shell from "@/components/Shell"
import { Board, Button } from "@/components/board"
import { LaneSchema, lanesOf } from "@/lib/board/types"
import { useState } from "react"
import { nothing } from "@/lib/missing"
export default function Page() { return <Shell><Board /></Shell> }
`)
  writeFile(dir, "app/api/lanes/route.ts", `
import { LaneSchema, type Lane } from "@/lib/board/types"
export async function GET() { const l: Lane[] = []; return Response.json(l) }
export async function POST(req: Request) { return Response.json(LaneSchema.parse(await req.json())) }
`)
  const result = await scanPaths({ projectRoot: dir })
  const ids = new Set(result.detected_surfaces.map((s) => s.canonical_id))
  const imports = result.detected_dependencies.filter((d) => d.kind === "imports")
  assert(imports.length > 0, "import edges are found")
  assertEqual(imports.filter((d) => !ids.has(d.from_canonical_id) || !ids.has(d.to_canonical_id)), [], "every import edge joins two surfaces that exist (the first real run: 0 of 704 did)")
  assertEqual(edgesOf(result, "ui:/board", "imports"), [
    "component:components/Shell.tsx:default",
    "component:components/board/Board.tsx:Board",
    "component:components/ui/button.tsx:Button",
    "type:lib/board/types.ts:LaneSchema",
    "zod:lib/board/types.ts:LaneSchema",
  ], "default import, named imports through an index file (export { } from, export * from), a name that is both a type and a schema")
  assertEqual(edgesOf(result, "component:components/board/Board.tsx:Board", "imports"), ["component:components/ui/button.tsx:Button", "type:lib/board/types.ts:Lane"], "relative and @/ imports, type-only included")
  assertEqual(edgesOf(result, "component:components/board/Board.tsx:BoardHeader", "imports"), ["component:components/ui/button.tsx:Button", "type:lib/board/types.ts:Lane"], "every component in the file carries the file's imports")
  assertEqual(imports.find((d) => d.from_canonical_id === "component:components/board/Board.tsx:Board")?.confidence, 0.8, "less sure when a file has several things that could be the user")
  assertEqual(imports.find((d) => d.from_canonical_id === "ui:/board")?.confidence, 1, "sure when the file is one thing")
  assertEqual(edgesOf(result, "route:GET /api/lanes", "imports"), ["type:lib/board/types.ts:Lane"], "a route handler imports only what it uses")
  assertEqual(edgesOf(result, "route:POST /api/lanes", "imports"), ["type:lib/board/types.ts:LaneSchema", "zod:lib/board/types.ts:LaneSchema"], "per handler")

  // Targeted: the imported file is not in the scan, but the edge still names its real id.
  const targeted = await scanPaths({ projectRoot: dir, files: ["app/board/page.tsx"] })
  assert(edgesOf(targeted, "ui:/board", "imports").includes("component:components/board/Board.tsx:Board"), "a targeted scan still resolves what its file imports")
  assertEqual(targeted.detected_surfaces.map((s) => s.canonical_id), ["ui:/board"], "without reporting surfaces from files it was not asked to scan")
  fs.rmSync(dir, { recursive: true, force: true })
}

async function testConfigKeysAndToolDescriptions(): Promise<void> {
  const dir = makeTempDir()
  writeFile(dir, "next.config.mjs", `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  eslint: { ignoreDuringBuilds: true },\n  images: { unoptimized: true },\n  async headers() { return [] },\n}\n\nexport default nextConfig\n`)
  writeFile(dir, "tailwind.config.ts", `import type { Config } from "tailwindcss"\nconst config = { darkMode: ["class"], content: [], theme: { extend: {} } } satisfies Config\nexport default config\n`)
  writeFile(dir, "lib/mcp/t.ts", `
const DAYS = 14
export function reg(server: any) {
  server.tool("tpl_tool", \`Cards idle for \${DAYS} days. Moves nothing.\`, {}, async () => ({}))
  server.tool("cat_tool", "First part. " + "Second part.", { a: z.string() }, async () => ({}))
  server.tool("plain_tpl", \`No holes here\`, {}, async () => ({}))
}`)
  const result = await scanPaths({ projectRoot: dir })
  assertEqual(sigOf(result, "config:next.config.mjs")?.keys, ["eslint", "images", "headers"], "keys of the object a config file exports by name")
  assertEqual(sigOf(result, "config:tailwind.config.ts")?.keys, ["darkMode", "content", "theme"], "through satisfies")
  assertEqual(sigOf(result, "mcp:tpl_tool")?.description, "Cards idle for ${DAYS} days. Moves nothing.", "a template description is read, holes kept as written")
  assertEqual(sigOf(result, "mcp:cat_tool")?.description, "First part. Second part.", "joined strings")
  assertEqual(sigOf(result, "mcp:plain_tpl")?.description, "No holes here", "a template with no holes")
  fs.rmSync(dir, { recursive: true, force: true })
}

async function testMirrorsAreTheSameThing(): Promise<void> {
  const dir = makeTempDir()
  for (const p of ["work", "search", "skills", "skills/[id]", "library/skills", "ideas", "ideas/[id]", "documents/[id]", "dashboard"]) {
    writeFile(dir, `app/api/${p}/route.ts`, `export async function GET() { return Response.json({}) }\nexport async function POST() { return Response.json({}) }\nexport async function DELETE() { return Response.json({}) }`)
  }
  writeFile(dir, "lib/mcp/t.ts", `export function reg(server: any) {
  for (const n of []) {}
  server.tool("list_workers", "d", {}, async () => ({}))
  server.tool("work_finished", "d", {}, async () => ({}))
  server.tool("catalog_search", "d", {}, async () => ({}))
  server.tool("list_skills", "d", {}, async () => ({}))
  server.tool("library_list_skills", "d", {}, async () => ({}))
  server.tool("get_idea", "d", {}, async () => ({}))
  server.tool("create_idea", "d", {}, async () => ({}))
  server.tool("delete_skill", "d", {}, async () => ({}))
  server.tool("list_documents", "d", {}, async () => ({}))
  server.tool("get_dashboard", "d", {}, async () => ({}))
}`)
  const result = await scanPaths({ projectRoot: dir })
  const mirrors = result.detected_dependencies.filter((d) => d.kind === "mirrors").map((d) => `${d.from_canonical_id} = ${d.to_canonical_id}`).sort()
  assertEqual(mirrors, [
    "route:DELETE /api/skills/[id] = mcp:delete_skill",
    "route:GET /api/dashboard = mcp:get_dashboard",
    "route:GET /api/ideas/[id] = mcp:get_idea",
    "route:GET /api/library/skills = mcp:library_list_skills",
    "route:GET /api/skills = mcp:list_skills",
    "route:POST /api/ideas = mcp:create_idea",
  ], "a mirror is the same thing done to the same resource, not a shared substring (first real run: /api/work mirrored list_workers); a list never mirrors a one-item address, a get may mirror a resource there is one of")
  fs.rmSync(dir, { recursive: true, force: true })
}

async function testNoEnvValueAnywhere(): Promise<void> {
  const dir = makeTempDir()
  const secrets = ["postgres://u:p4ssw0rd-zzz@db.example/x", "sk_" + "live_QUOTED_abc123", "whsec" + "_SINGLE_def456", "exported-secret-789", "spaced secret value 000"]
  writeFile(dir, ".env.local", [
    `DATABASE_URL=${secrets[0]}`,
    `STRIPE_SECRET_KEY="${secrets[1]}"`,
    `WEBHOOK_SECRET='${secrets[2]}' # note`,
    `export EXPORTED_KEY=${secrets[3]}`,
    `  SPACED = ${secrets[4]}`,
    `EMPTY_QUOTED=""`,
    `not-a-name=${secrets[0]}`,
    `lower_case=${secrets[1]}`,
  ].join("\r\n"))
  writeFile(dir, "app/api/x/route.ts", `export async function GET() { return Response.json({ k: process.env.STRIPE_SECRET_KEY }) }`)
  const result = await scanPaths({ projectRoot: dir })
  const names = result.detected_surfaces.filter((s) => s.kind === "env_var").map((s) => s.canonical_id).sort()
  assertEqual(names, ["env:DATABASE_URL", "env:EMPTY_QUOTED", "env:EXPORTED_KEY", "env:SPACED", "env:STRIPE_SECRET_KEY", "env:WEBHOOK_SECRET", "env:lower_case"], "names only, however the line is written")
  const whole = JSON.stringify(result)
  for (const secret of secrets) assert(!whole.includes(secret), `no env value anywhere in the result (surfaces, edges, warnings): ${secret.slice(0, 6)}...`)
  for (const s of result.detected_surfaces.filter((x) => x.kind === "env_var")) {
    assertEqual(Object.keys(s.signature).sort(), ["has_default", "required"], `${s.canonical_id} carries two flags and nothing else`)
    assertEqual(Object.keys(s.location).sort(), ["file_path"], `${s.canonical_id} says only which file`)
  }
  assertEqual(sigOf(result, "env:EMPTY_QUOTED")?.has_default, false, "an empty quoted value is not a default")
  fs.rmSync(dir, { recursive: true, force: true })
}

// ============================================================================
// Run all tests
// ============================================================================

async function main(): Promise<void> {
  console.log("Running catalog scan tests...\n")

  const tests: Array<[string, () => Promise<void>]> = [
    ["SQL table + columns", testSqlTableAndColumns],
    ["SQL enum", testSqlEnum],
    ["SQL matview", testSqlMatview],
    ["API route", testApiRoute],
    ["API route dynamic segments", testApiRouteDynamicSegments],
    ["UI page", testUiPage],
    ["Env file (no value leak)", testEnvFile],
    ["Config file", testConfigFile],
    ["Scan type targeted vs full", testScanTypeTargeted],
    ["Webhook endpoint", testWebhookEndpoint],
    ["MCP tools in lib/mcp", testMcpToolsInLib],
    ["skipDirs", testSkipDirs],
    ["Full discovery at any depth", testFullDiscoveryDepth],
    ["Pages and routes anywhere under app", testPagesAndRoutesAnywhere],
    ["SQL: awkward tables", testSqlAwkwardTables],
    ["SQL: ALTER and DROP", testSqlAlterAndDrop],
    ["Per-handler auth and data access", testPerHandlerAuthAndData],
    ["Components and hooks", testComponentsAndHooks],
    ["Import edges have both ends", testImportEdgesHaveBothEnds],
    ["Config keys and tool descriptions", testConfigKeysAndToolDescriptions],
    ["Mirrors are the same thing", testMirrorsAreTheSameThing],
    ["No env value anywhere", testNoEnvValueAnywhere],
  ]

  for (const [name, fn] of tests) {
    try {
      await fn()
      console.log(`  ✓ ${name}`)
    } catch (e) {
      failures.push(`FAIL (exception): ${name}: ${String(e)}`)
      failed++
      console.log(`  ✗ ${name}: ${String(e)}`)
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log("\nFailures:")
    for (const f of failures) {
      console.log(`  ${f}`)
    }
    process.exit(1)
  } else {
    console.log("All tests passed.")
  }
}

main().catch((e) => {
  console.error("Test runner crashed:", e)
  process.exit(1)
})
