/**
 * Run all database migrations in order
 * Usage: tsx scripts/run-migrations.ts
 */

import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env file
dotenv.config()

import { sql, pool } from '../lib/db/client.js'
import fs from 'fs'

const MIGRATIONS_DIR = path.join(process.cwd(), 'lib/db/migrations')

interface Migration {
  number: number
  filename: string
  content: string
}

async function getMigrations(): Promise<Migration[]> {
  const files = fs.readdirSync(MIGRATIONS_DIR)
  const migrations: Migration[] = []

  for (const file of files) {
    if (file.endsWith('.sql')) {
      const match = file.match(/^(\d{3})_/)
      if (match) {
        const number = parseInt(match[1], 10)
        const content = fs.readFileSync(
          path.join(MIGRATIONS_DIR, file),
          'utf-8'
        )
        migrations.push({ number, filename: file, content })
      }
    }
  }

  // Sort by migration number
  migrations.sort((a, b) => a.number - b.number)

  return migrations
}

async function createMigrationsTable() {
  console.log('Creating migrations tracking table...')
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_number INTEGER UNIQUE NOT NULL,
      migration_name TEXT NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  console.log('✓ Migrations table ready')
}

async function getExecutedMigrations(): Promise<number[]> {
  const result = await sql`
    SELECT migration_number FROM schema_migrations
    ORDER BY migration_number
  `
  return result.map((row: any) => row.migration_number as number)
}

async function executeMigration(migration: Migration) {
  console.log(`\n▶ Running migration ${migration.number}: ${migration.filename}`)

  try {
    // Execute the migration SQL using pool for raw SQL
    const client = await pool.connect()
    try {
      await client.query(migration.content)
    } finally {
      client.release()
    }

    // Record the migration
    await sql`
      INSERT INTO schema_migrations (migration_number, migration_name)
      VALUES (${migration.number}, ${migration.filename})
    `

    console.log(`✓ Migration ${migration.number} completed successfully`)
  } catch (error: any) {
    console.error(`✗ Migration ${migration.number} failed:`, error.message)
    throw error
  }
}

async function runMigrations() {
  console.log('='.repeat(60))
  console.log('AI Project Planner - Database Migrations')
  console.log('='.repeat(60))

  try {
    // Create migrations tracking table
    await createMigrationsTable()

    // Get all migrations
    const migrations = await getMigrations()
    console.log(`\nFound ${migrations.length} migration files`)

    // Get already executed migrations
    const executed = await getExecutedMigrations()
    console.log(`Already executed: ${executed.length} migrations`)

    // Filter pending migrations
    const pending = migrations.filter((m) => !executed.includes(m.number))

    if (pending.length === 0) {
      console.log('\n✓ Database is up to date! No migrations to run.')
      return
    }

    console.log(`\nPending migrations: ${pending.length}`)
    pending.forEach((m) => console.log(`  - ${m.filename}`))

    // Execute each pending migration
    for (const migration of pending) {
      await executeMigration(migration)
    }

    console.log('\n' + '='.repeat(60))
    console.log('✓ All migrations completed successfully!')
    console.log('='.repeat(60))

    // Show summary
    const allExecuted = await getExecutedMigrations()
    console.log(`\nDatabase schema version: ${Math.max(...allExecuted)}`)
    console.log(`Total migrations applied: ${allExecuted.length}`)
  } catch (error: any) {
    console.error('\n' + '='.repeat(60))
    console.error('✗ Migration failed!')
    console.error('='.repeat(60))
    console.error(error)
    process.exit(1)
  }
}

// Run migrations
runMigrations()
  .then(() => {
    console.log('\n✓ Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n✗ Migration script failed:', error)
    process.exit(1)
  })
