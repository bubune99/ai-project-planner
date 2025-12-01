#!/usr/bin/env tsx

import dotenv from 'dotenv'
import { join } from 'path'
import { readdir, readFile } from 'fs/promises'
import { createRequire } from 'module'

// Load environment variables before importing db client
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const require = createRequire(import.meta.url)
const { sql, pool } = require('../lib/db/client')

const MIGRATIONS_DIR = join(process.cwd(), 'lib', 'db', 'migrations')

interface Migration {
  id: number
  filename: string
  applied_at: Date
}

/**
 * Create migrations tracking table if it doesn't exist
 */
async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  console.log('✓ Migrations tracking table ready')
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(): Promise<Migration[]> {
  const result = await sql<Migration[]>`
    SELECT id, filename, applied_at
    FROM _migrations
    ORDER BY id ASC
  `
  return result
}

/**
 * Get list of pending migrations
 */
async function getPendingMigrations(appliedMigrations: Migration[]): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR)
  const sqlFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort()

  const appliedFilenames = new Set(appliedMigrations.map(m => m.filename))
  return sqlFiles.filter(f => !appliedFilenames.has(f))
}

/**
 * Run a single migration file
 */
async function runMigration(filename: string): Promise<void> {
  const filePath = join(MIGRATIONS_DIR, filename)
  const migrationSQL = await readFile(filePath, 'utf-8')

  console.log(`Running migration: ${filename}`)

  try {
    // Use pool for transaction support
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // Execute the migration SQL
      await client.query(migrationSQL)

      // Record the migration
      await client.query(
        'INSERT INTO _migrations (filename) VALUES ($1)',
        [filename]
      )

      await client.query('COMMIT')
      console.log(`✓ Migration ${filename} completed successfully`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(`✗ Migration ${filename} failed:`, error)
    throw error
  }
}

/**
 * Rollback last N migrations
 */
async function rollback(count: number = 1): Promise<void> {
  const applied = await getAppliedMigrations()
  const toRollback = applied.slice(-count).reverse()

  if (toRollback.length === 0) {
    console.log('No migrations to rollback')
    return
  }

  console.log(`Rolling back ${toRollback.length} migration(s)...`)

  for (const migration of toRollback) {
    console.log(`Rolling back: ${migration.filename}`)
    console.warn('⚠ Automatic rollback not implemented - manual intervention required')
    console.log(`Please create a rollback script for: ${migration.filename}`)

    // For now, just remove from tracking table
    // In production, you'd want dedicated rollback SQL files
    await sql`DELETE FROM _migrations WHERE id = ${migration.id}`
    console.log(`✓ Removed ${migration.filename} from tracking table`)
  }
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    console.log('🚀 Starting database migration...\n')

    // Ensure migrations table exists
    await ensureMigrationsTable()

    // Get migration status
    const applied = await getAppliedMigrations()
    const pending = await getPendingMigrations(applied)

    console.log(`Applied migrations: ${applied.length}`)
    console.log(`Pending migrations: ${pending.length}\n`)

    if (pending.length === 0) {
      console.log('✓ Database is up to date')
      return
    }

    // Run pending migrations
    for (const filename of pending) {
      await runMigration(filename)
    }

    console.log(`\n✓ Successfully applied ${pending.length} migration(s)`)
  } catch (error) {
    console.error('\n✗ Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

/**
 * Show migration status
 */
async function status() {
  try {
    await ensureMigrationsTable()

    const applied = await getAppliedMigrations()
    const pending = await getPendingMigrations(applied)

    console.log('\n📊 Migration Status\n')
    console.log('Applied migrations:')
    if (applied.length === 0) {
      console.log('  (none)')
    } else {
      applied.forEach(m => {
        console.log(`  ✓ ${m.filename} (${m.applied_at.toISOString()})`)
      })
    }

    console.log('\nPending migrations:')
    if (pending.length === 0) {
      console.log('  (none)')
    } else {
      pending.forEach(f => {
        console.log(`  ○ ${f}`)
      })
    }
    console.log('')
  } catch (error) {
    console.error('✗ Failed to get status:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// CLI
const command = process.argv[2]

switch (command) {
  case 'rollback':
    const count = parseInt(process.argv[3] || '1')
    rollback(count).then(() => pool.end())
    break
  case 'status':
    status()
    break
  case 'up':
  case undefined:
    migrate()
    break
  default:
    console.log('Usage:')
    console.log('  pnpm db:migrate         - Run pending migrations')
    console.log('  pnpm db:migrate status  - Show migration status')
    console.log('  pnpm db:migrate rollback [count] - Rollback last N migrations')
    process.exit(1)
}
