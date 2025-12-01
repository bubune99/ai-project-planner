import { AIProjectPlannerClient } from '@/lib/sdk/client'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function main() {
    console.log('🚀 Starting SDK Verification...')

    // Initialize Client
    // Note: We are running this locally, so we point to localhost
    // In a real scenario, this would point to the deployed URL
    const client = new AIProjectPlannerClient({
        baseUrl: 'http://localhost:3003'
    })

    try {
        // 1. Create a Project
        console.log('\n1. Creating Project...')
        const project = await client.projects.create({
            name: 'SDK Test Project ' + Date.now(),
            description: 'A project created via the SDK verification script',
            priority: 'high',
            status: 'planning'
        })
        console.log('✅ Project created:', project.id, project.name)

        // 2. List Phases
        console.log('\n2. Listing Phases...')
        const phases = await client.phases.list(project.id)
        console.log('✅ Phases found:', phases.length)
        phases.forEach(p => console.log(`   - ${p.phase_name} (${p.status})`))

        // 3. Transition Phase
        console.log('\n3. Transitioning Phase...')
        const transitionResult = await client.phases.transition(
            project.id,
            'architecture',
            'SDK Test Script',
            'Moving to architecture phase via SDK'
        )
        console.log('✅ Phase transition result:', transitionResult.message)

        // 4. Create Knowledge Base Document
        console.log('\n4. Creating Knowledge Base Document...')
        const doc = await client.knowledgeBase.create({
            project_id: project.id,
            title: 'SDK Test Doc',
            category: 'testing',
            description: 'Created via SDK verification',
            content: '# Hello World\nThis is a test document.'
        })
        console.log('✅ Document created:', doc.id, doc.title)

        // 5. Search Knowledge Base
        console.log('\n5. Searching Knowledge Base...')
        const searchResults = await client.knowledgeBase.search('SDK Test')
        console.log('✅ Search results:', searchResults.length)
        searchResults.forEach(d => console.log(`   - ${d.title} (${d.category})`))

        // 6. List Agents
        console.log('\n6. Listing Agents...')
        const agents = await client.agents.list()
        console.log('✅ Agents found:', agents.length)
        agents.forEach(a => console.log(`   - ${a.name} (${a.status})`))

        console.log('\n✨ Verification Complete!')
    } catch (error: any) {
        console.error('\n❌ Verification Failed:', error.message)
        if (error.cause) console.error('Cause:', error.cause)
        process.exit(1)
    }
}

main()
