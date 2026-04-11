#!/usr/bin/env tsx
/**
 * One-shot helper for the backbone-foundation pass: seed the _migrations
 * tracking table with already-applied files so `pnpm db:migrate` only runs
 * the new 033-036 migrations. Safe to run multiple times (ON CONFLICT DO NOTHING).
 *
 * Invoke:  pnpm tsx scripts/_seed-backbone-migrations.ts
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { readdirSync } from 'fs'
import { join } from 'path'

const BACKBONE_PREFIXES = ['033_', '034_', '035_', '036_']

async function main() {
  // Dynamic import after env is loaded
  const { sql } = await import('../lib/db/client')

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `

  const files = readdirSync(join(process.cwd(), 'lib/db/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let seeded = 0
  for (const f of files) {
    if (BACKBONE_PREFIXES.some((p) => f.startsWith(p))) continue
    const res = await sql`
      INSERT INTO _migrations (filename) VALUES (${f})
      ON CONFLICT (filename) DO NOTHING
    `
    if (Array.isArray(res) && res.length > 0) seeded++
  }

  const tracked = await sql`SELECT filename FROM _migrations ORDER BY filename`
  console.log(`Seeded new entries: ${seeded}`)
  console.log(`Tracked migrations: ${tracked.length}`)
  const pending = files.filter(
    (f) => !tracked.some((t: { filename: string }) => t.filename === f)
  )
  console.log('Pending (will run next db:migrate):', pending)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
