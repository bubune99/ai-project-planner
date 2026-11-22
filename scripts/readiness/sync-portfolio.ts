#!/usr/bin/env tsx
/**
 * Load a launch-readiness portfolio audit into the planner.
 *
 *   READINESS_DATABASE_URL=<connection string> npx -y tsx@4.23.15 scripts/readiness/sync-portfolio.ts <portfolio-dir> [--dry-run]
 *
 * <portfolio-dir> holds one folder per project with a sync.json written by the
 * Comprehension extension's portfolio runner ({ projectId, profile, ranAt, results }).
 * For each: save the launch profile (only if the project has none yet: an owner's
 * profile is never overwritten), then apply the machine results with the same rules
 * as the API (lib/readiness/store.ts applySync): code passes are stored, other passes
 * become proposals, failures are recorded, owner decisions are only reopened by a failure.
 *
 * --dry-run reads the files and touches no database. Otherwise it writes to the database
 * named in READINESS_DATABASE_URL and nowhere else; it never reads .env.
 */
import { existsSync, readdirSync, readFileSync } from "fs"
import { join, resolve } from "path"
import { validateProfileInput } from "../../lib/readiness/input"
import { useReadinessDatabase } from "./db-env"

interface SyncFile { projectId: string; profile: unknown; ranAt: string; results: unknown[] }

function readSyncFile(file: string): SyncFile | string {
  let body: unknown
  try { body = JSON.parse(readFileSync(file, "utf8")) } catch { return "sync.json is not JSON" }
  const b = body as Partial<SyncFile> | null
  if (!b || typeof b.projectId !== "string" || !Array.isArray(b.results)) return "sync.json needs projectId and results"
  if (typeof b.ranAt !== "string" || Number.isNaN(Date.parse(b.ranAt))) return "sync.json needs ranAt, the time the audit ran"
  return { projectId: b.projectId, profile: b.profile, ranAt: new Date(b.ranAt).toISOString(), results: b.results }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes("--dry-run")
  const dir = args.find((a) => !a.startsWith("--"))
  if (!dir) { console.error("usage: sync-portfolio.ts <portfolio-dir> [--dry-run]"); process.exit(2) }
  if (!dry) useReadinessDatabase()
  const store = dry ? null : await import("../../lib/readiness/store")
  const actor = { id: "comprehension-portfolio-audit", kind: "agent" as const, source: "extension" as const }
  for (const slug of readdirSync(resolve(dir)).sort()) {
    const file = join(resolve(dir), slug, "sync.json")
    if (!existsSync(file)) continue
    const name = slug.padEnd(20)
    const body = readSyncFile(file)
    if (typeof body === "string") { console.log(`${name} SKIP ${body}`); continue }
    const v = validateProfileInput(body.profile)
    if (!v.ok) { console.log(`${name} SKIP profile invalid: ${v.error}`); continue }
    if (!store) { console.log(`${name} would sync ${body.results.length} results to ${body.projectId}`); continue }
    const existing = await store.getProfile(body.projectId)
    if (!existing) await store.saveProfile(body.projectId, v.value, actor)
    const r = await store.applySync(body.projectId, body.results, body.ranAt, actor)
    if (!r.ok) { console.log(`${name} ERROR ${r.error}`); continue }
    const { readiness } = await store.getReadiness(body.projectId, new Date().toISOString())
    console.log(`${name} ${existing ? "profile kept" : "profile set "} applied ${String(r.applied.length).padStart(3)}  health ${readiness?.health}  failed ${readiness?.counts.failed}  review ${readiness?.counts.proposed}  passed ${readiness?.counts.passed}`)
  }
  process.exit(0)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
