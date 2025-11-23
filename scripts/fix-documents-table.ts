import { sql } from '@/lib/db/client'

async function fixDocumentsTable() {
  console.log('🔧 Fixing documents table schema...')

  try {
    // Make nullable columns optional
    await sql`ALTER TABLE documents ALTER COLUMN s3_key DROP NOT NULL`
    console.log('✓ Made s3_key nullable')

    await sql`ALTER TABLE documents ALTER COLUMN file_type DROP NOT NULL`
    console.log('✓ Made file_type nullable')

    await sql`ALTER TABLE documents ALTER COLUMN file_size DROP NOT NULL`
    console.log('✓ Made file_size nullable')

    await sql`ALTER TABLE documents ALTER COLUMN category DROP NOT NULL`
    console.log('✓ Made category nullable')

    // Add new columns
    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS content TEXT`
    console.log('✓ Added content column')

    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type TEXT CHECK (doc_type IN ('chapter', 'page'))`
    console.log('✓ Added doc_type column')

    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES documents(id) ON DELETE CASCADE`
    console.log('✓ Added parent_id column')

    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_edited_by TEXT`
    console.log('✓ Added last_edited_by column')

    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`
    console.log('✓ Added updated_at column')

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id)`
    console.log('✓ Created parent_id index')

    await sql`CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type)`
    console.log('✓ Created doc_type index')

    console.log('✅ Documents table updated successfully!')
  } catch (error) {
    console.error('❌ Error updating documents table:', error)
    throw error
  }
}

fixDocumentsTable()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
