#!/usr/bin/env tsx
/**
 * Runs scripts/db/trigger-smoke.sql: fires every table's triggers once and rolls everything back (card d2df6789).
 *
 *   SMOKE_DATABASE_URL=<the STAGING branch's connection string> npx -y tsx@4.23.15 scripts/db/trigger-smoke.ts
 *
 * Run it after applying a migration to staging and before production. It reads only SMOKE_DATABASE_URL (never .env),
 * so it cannot reach production by accident. Exits 1 when any trigger fails.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { neon } from "@neondatabase/serverless"

const url = process.env.SMOKE_DATABASE_URL
if (!url) {
  console.error("Set SMOKE_DATABASE_URL to the staging database's connection string. It is never read from .env.")
  process.exit(2)
}

/** The script as separate statements: the two functions (each ends at its closing $fn$;) and the final query. */
export function statementsOf(source: string): string[] {
  const fns = [...source.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$fn\$;/g)].map((m) => m[0].replace(/;$/, ""))
  const select = source.slice(source.lastIndexOf("SELECT s.tbl")).trim().replace(/;\s*$/, "")
  return [...fns, select]
}

async function main(databaseUrl: string) {
  const sql = neon(databaseUrl)
  const statements = statementsOf(readFileSync(join(process.cwd(), "scripts", "db", "trigger-smoke.sql"), "utf8"))
  const results = await sql.transaction(statements.map((s) => sql.query(s)))
  const rows = results[results.length - 1] as unknown as { tbl: string; op: string; result: string }[]
  const failed = rows.filter((r) => r.result.startsWith("FAIL"))
  for (const r of rows) console.log(`${r.result.startsWith("FAIL") ? "FAIL" : r.result === "ok" ? "ok  " : "skip"}  ${r.tbl} ${r.op}${r.result === "ok" ? "" : `: ${r.result}`}`)
  console.log(`\n${rows.length - failed.length} of ${rows.length} trigger runs passed or were skipped; ${failed.length} failed.`)
  return failed.length ? 1 : 0
}

main(url).then((code) => process.exit(code), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(2) })
