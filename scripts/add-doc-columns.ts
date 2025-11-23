import { sql } from '@/lib/db/client'

async function addDocColumns() {
  console.log('🔧 Adding columns to documents table...')

  try {
    // Add new columns (IF NOT EXISTS prevents errors if they're already there)
    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS content TEXT`
    console.log('✓ Added content column')

    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type TEXT`
    console.log('✓ Added doc_type column')

    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_id UUID`
    console.log('✓ Added parent_id column')

    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_edited_by TEXT`
    console.log('✓ Added last_edited_by column')

    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`
    console.log('✓ Added updated_at column')

    // Add foreign key constraint if not exists (try/catch to handle if it already exists)
    try {
      await sql`ALTER TABLE documents ADD CONSTRAINT fk_parent_doc FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE CASCADE`
      console.log('✓ Added parent_id foreign key constraint')
    } catch (e: any) {
      if (e.code === '42710') {
        console.log('ℹ Foreign key constraint already exists')
      } else {
        throw e
      }
    }

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

addDocColumns()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
