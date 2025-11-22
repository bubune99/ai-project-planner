#!/usr/bin/env tsx

/**
 * Check database tables and schema
 * Run with: npx dotenv -e .env -- tsx scripts/check-db.ts
 */

import { sql } from '../lib/db/client'

async function checkDatabase() {
  console.log('🔍 Checking database schema...\n')

  try {
    // Check connection
    const [conn] = await sql`SELECT current_database() as db, current_user as user, version()`
    console.log('✅ Connected to database:', conn.db)
    console.log('   User:', conn.user)
    console.log('')

    // List all tables
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `

    console.log('📊 Tables in database:')
    if (tables.length === 0) {
      console.log('   ⚠️  No tables found! Database is empty.')
      console.log('   → Run: npx dotenv -e .env -- pnpm db:migrate')
    } else {
      tables.forEach((t: any) => console.log('   ✓', t.table_name))
    }
    console.log('')

    // Check for specific required tables
    const requiredTables = [
      'projects',
      'project_steps',
      'project_phases',
      'business_context',
      'architecture_decisions',
      'progress_notes'
    ]

    console.log('🔎 Checking required tables:')
    const tableNames = tables.map((t: any) => t.table_name)
    for (const tableName of requiredTables) {
      if (tableNames.includes(tableName)) {
        // Count rows
        const [count] = await sql`SELECT COUNT(*) as count FROM ${sql(tableName)}`
        console.log(`   ✅ ${tableName} (${count.count} rows)`)
      } else {
        console.log(`   ❌ ${tableName} (MISSING)`)
      }
    }
    console.log('')

    // Check migrations table
    const migrationCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
      ) as exists
    `

    if (migrationCheck[0].exists) {
      const migrations = await sql`SELECT * FROM schema_migrations ORDER BY version`
      console.log('📝 Applied migrations:')
      if (migrations.length === 0) {
        console.log('   ⚠️  No migrations recorded')
      } else {
        migrations.forEach((m: any) => {
          console.log(`   ✓ ${m.version} - ${m.name}`)
        })
      }
    } else {
      console.log('⚠️  schema_migrations table does not exist')
      console.log('   → Migrations have not been set up')
    }
    console.log('')

    // Check columns on projects table
    if (tableNames.includes('projects')) {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'projects'
        ORDER BY ordinal_position
      `
      console.log('📋 Projects table structure:')
      columns.forEach((c: any) => {
        console.log(`   ${c.column_name}: ${c.data_type} ${c.is_nullable === 'YES' ? '(nullable)' : ''}`)
      })
    }

  } catch (error: any) {
    console.error('❌ Error checking database:', error.message)
    if (error.code) {
      console.error('   Error code:', error.code)
    }
    if (error.detail) {
      console.error('   Detail:', error.detail)
    }
  }
}

checkDatabase().then(() => {
  console.log('\n✅ Database check complete')
  process.exit(0)
}).catch((error) => {
  console.error('\n❌ Failed:', error)
  process.exit(1)
})
