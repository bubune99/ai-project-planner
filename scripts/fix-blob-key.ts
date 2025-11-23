import { sql } from '@/lib/db/client'

async function fixBlobKey() {
  console.log('🔧 Making blob_key nullable...')

  try {
    await sql`ALTER TABLE documents ALTER COLUMN blob_key DROP NOT NULL`
    console.log('✅ blob_key is now nullable!')
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

fixBlobKey()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
