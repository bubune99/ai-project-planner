/**
 * Check current database schema
 * Usage: tsx scripts/check-schema.ts
 */

import dotenv from 'dotenv'
dotenv.config()

import { sql } from '../lib/db/client.js'

async function checkSchema() {
  console.log('Checking database schema...\n')

  // Get all tables
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `

  console.log('Existing tables:')
  tables.forEach((table: any) => {
    console.log(`  - ${table.table_name}`)
  })

  console.log(`\nTotal: ${tables.length} tables`)

  // Check if schema_migrations exists
  const hasMigrations = tables.some((t: any) => t.table_name === 'schema_migrations')

  if (hasMigrations) {
    console.log('\n✓ schema_migrations table exists')

    const migrations = await sql`
      SELECT migration_number, migration_name, executed_at
      FROM schema_migrations
      ORDER BY migration_number
    `

    if (migrations.length > 0) {
      console.log('\nExecuted migrations:')
      migrations.forEach((m: any) => {
        console.log(`  ${m.migration_number}. ${m.migration_name} (${m.executed_at})`)
      })
    } else {
      console.log('\nNo migrations recorded yet')
    }
  } else {
    console.log('\n✗ schema_migrations table does not exist')
  }
}

checkSchema()
  .then(() => {
    console.log('\n✓ Schema check completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n✗ Schema check failed:', error)
    process.exit(1)
  })
