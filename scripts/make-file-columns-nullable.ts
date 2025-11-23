import { sql } from '@/lib/db/client'

async function makeFileColumnsNullable() {
  console.log('🔧 Making file-related columns nullable...')

  const columns = ['blob_key', 'file_type', 'file_size', 'category', 's3_key']

  for (const column of columns) {
    try {
      await sql.unsafe(`ALTER TABLE documents ALTER COLUMN ${column} DROP NOT NULL`)
      console.log(`✓ Made ${column} nullable`)
    } catch (error: any) {
      if (error.code === '42703') {
        console.log(`ℹ ${column} doesn't exist (OK)`)
      } else if (error.message.includes('does not exist')) {
        console.log(`ℹ ${column} doesn't exist (OK)`)
      } else {
        console.error(`✗ Error with ${column}:`, error.message)
      }
    }
  }

  console.log('✅ Done!')
}

makeFileColumnsNullable()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
