/**
 * Unit tests for lib/catalog/scan.ts
 *
 * Run with: npx tsx lib/catalog/scan.test.ts
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
