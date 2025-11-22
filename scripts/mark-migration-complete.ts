/**
 * Manually mark a migration as complete
 * Usage: tsx scripts/mark-migration-complete.ts <number> <name>
 */

import dotenv from 'dotenv'
dotenv.config()

import { sql } from '../lib/db/client.js'

const migrationNumber = parseInt(process.argv[2], 10)
const migrationName = process.argv[3]

if (!migrationNumber || !migrationName) {
  console.error('Usage: tsx scripts/mark-migration-complete.ts <number> <name>')
  console.error('Example: tsx scripts/mark-migration-complete.ts 1 "001_initial_schema.sql"')
  process.exit(1)
}

async function markComplete() {
  console.log(`Marking migration ${migrationNumber} as complete: ${migrationName}`)

  await sql`
    INSERT INTO schema_migrations (migration_number, migration_name)
    VALUES (${migrationNumber}, ${migrationName})
    ON CONFLICT (migration_number) DO NOTHING
  `

  console.log('✓ Migration marked as complete')
}

markComplete()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('✗ Failed:', error)
    process.exit(1)
  })
