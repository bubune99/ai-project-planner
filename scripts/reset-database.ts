/**
 * Reset database - Drop all tables and start fresh
 * Usage: tsx scripts/reset-database.ts
 *
 * WARNING: This will delete ALL data in the database!
 */

import dotenv from 'dotenv'
dotenv.config()

import { sql, pool } from '../lib/db/client.js'

async function resetDatabase() {
  console.log('='.repeat(60))
  console.log('⚠️  DATABASE RESET - This will delete ALL data!')
  console.log('='.repeat(60))
  console.log()

  try {
    // Drop all tables in the public schema
    console.log('Dropping all existing tables...')

    const client = await pool.connect()
    try {
      // Get all table names
      const tables = await client.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
      `)

      if (tables.rows.length === 0) {
        console.log('✓ No tables found - database is already empty')
        return
      }

      console.log(`Found ${tables.rows.length} tables to drop:`)
      tables.rows.forEach((row: any) => {
        console.log(`  - ${row.tablename}`)
      })

      // Drop all tables with CASCADE to handle dependencies
      console.log('\nDropping tables with CASCADE...')
      await client.query(`
        DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;
        GRANT ALL ON SCHEMA public TO public;
      `)

      console.log('✓ All tables dropped successfully')

      // Ensure uuid-ossp extension is available
      console.log('\nInstalling required extensions...')
      await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
      console.log('✓ Extensions installed')

    } finally {
      client.release()
    }

    console.log()
    console.log('='.repeat(60))
    console.log('✓ Database reset complete - Ready for migrations')
    console.log('='.repeat(60))
    console.log()
    console.log('Next step: Run migrations with:')
    console.log('  npx dotenv -e .env -- npx tsx scripts/run-migrations.ts')

  } catch (error: any) {
    console.error()
    console.error('='.repeat(60))
    console.error('✗ Database reset failed!')
    console.error('='.repeat(60))
    console.error(error)
    throw error
  }
}

resetDatabase()
  .then(() => {
    console.log()
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n✗ Reset script failed:', error)
    process.exit(1)
  })
