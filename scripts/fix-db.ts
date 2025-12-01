import dotenv from 'dotenv'
import { createRequire } from 'module'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const require = createRequire(import.meta.url)
const { sql } = require('../lib/db/client')

async function main() {
    console.log('🔧 Starting DB Fix...')

    try {
        try {
            const migrations = await sql`SELECT * FROM _migrations ORDER BY id`
            console.log(`Found ${migrations.length} migrations in history.`)

            const has001 = migrations.some((m: any) => m.filename.includes('001'))
            if (!has001) {
                console.log('⚠️ Migration history missing! (Skipping backfill for now)')
            }
        } catch (e: any) {
            console.log('Error checking migrations:', e.message)
        }

        // 2. Apply 017 logic directly
        console.log('\nApplying 017_fix_event_types logic...')

        await sql`
      ALTER TABLE execution_history DROP CONSTRAINT IF EXISTS execution_history_event_type_check
    `

        await sql`
      ALTER TABLE execution_history ADD CONSTRAINT execution_history_event_type_check CHECK (event_type IN (
        'step_started',
        'step_completed',
        'blocker_identified',
        'status_changed',
        'ai_agent_action',
        'project_created',
        'project_updated',
        'phase_transition',
        'document_created',
        'document_updated',
        'document_deleted'
      ))
    `
        console.log('✅ Constraint updated successfully!')

        // 3. Apply 018 logic directly
        console.log('\nApplying 018_enhance_documents logic...')

        await sql`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'
    `

        await sql`
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category)
    `
        console.log('✅ Documents table enhanced successfully!')

        // 4. Manually record migrations
        try {
            await sql`
        INSERT INTO _migrations (filename) 
        VALUES ('017_fix_event_types.sql')
        ON CONFLICT (filename) DO NOTHING
      `
            await sql`
        INSERT INTO _migrations (filename) 
        VALUES ('018_enhance_documents.sql')
        ON CONFLICT (filename) DO NOTHING
      `
            console.log('✅ Recorded migrations in history')
        } catch (e: any) {
            console.log('Skipping history update:', e.message)
        }

    } catch (error: any) {
        console.error('❌ DB Fix Failed:', error)
    }
}

main()
