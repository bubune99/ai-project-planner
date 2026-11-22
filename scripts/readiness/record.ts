#!/usr/bin/env tsx
/**
 * Record one readiness validation from a launch-ops loop, through the same rules as the API
 * (an agent's "passed" on a non-code item is stored as "proposed"; agents can't waive).
 *
 *   READINESS_DATABASE_URL=<connection string> npx -y tsx@4.23.15 scripts/readiness/record.ts <projectId> <itemId> <state> <reason> '<evidence json array>'
 *
 * Writes to the database named in READINESS_DATABASE_URL and nowhere else; it never reads .env.
 */
import { useReadinessDatabase } from "./db-env"

const USAGE = "usage: record.ts <projectId> <itemId> <state> <reason> '<evidence json array>'"

async function main() {
  const [projectId, itemId, state, reason, evidenceJson] = process.argv.slice(2)
  if (!projectId || !itemId || !state) { console.error(USAGE); process.exit(2) }
  let evidence: unknown = []
  if (evidenceJson) {
    try { evidence = JSON.parse(evidenceJson) } catch { console.error(`evidence is not JSON\n${USAGE}`); process.exit(2) }
  }
  useReadinessDatabase()
  const { setValidation } = await import("../../lib/readiness/store")
  const r = await setValidation(projectId, itemId, state, { reason, evidence }, { id: "launch-ops-fix-loop", kind: "agent", source: "extension" })
  if (!r.ok) { console.error(r.error); process.exit(1) }
  console.log(JSON.stringify({ itemId, stored: r.state, note: r.note ?? null }))
  process.exit(0)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
