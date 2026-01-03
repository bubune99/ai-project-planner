/**
 * Run multi-tenancy database migrations
 * Usage: node scripts/run-multi-tenant-migrations.mjs
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(connectionString);

async function runMigration(name, sqlContent) {
  console.log('\n📦 Running migration:', name);
  try {
    // Run the entire migration as one statement if possible
    const lines = sqlContent.split('\n').filter(l => !l.trim().startsWith('--') && l.trim().length > 0);
    const statements = lines.join('\n').split(';').map(s => s.trim()).filter(s => s.length > 0);

    for (const stmt of statements) {
      console.log('  Executing:', stmt.substring(0, 80) + '...');
      // Use tagged template literal with the raw SQL
      await sql.query(stmt);
    }
    console.log('✅ Migration', name, 'completed');
  } catch (error) {
    console.error('❌ Migration', name, 'failed:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting multi-tenancy migrations...\n');
  
  const migrationsDir = path.join(__dirname, '../lib/db/migrations');
  const migrations = ['020_users_and_api_keys.sql', '021_add_user_ownership.sql', '022_user_data_migration.sql'];
  
  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      await runMigration(migration, content);
    } else {
      console.log('⚠️  Migration file not found:', migration);
    }
  }
  
  console.log('\n✨ All migrations completed!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
