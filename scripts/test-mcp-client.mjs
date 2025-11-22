#!/usr/bin/env node
/**
 * Test client for MCP Server
 * Usage: node scripts/test-mcp-client.mjs [url]
 * Example: node scripts/test-mcp-client.mjs http://localhost:3000
 *
 * Following the pattern from vercel-labs/mcp-for-next.js
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

const serverUrl = process.argv[2] || 'http://localhost:3000'
const mcpUrl = `${serverUrl}/mcp/sse`

console.log('🚀 Testing MCP Server at:', mcpUrl)
console.log('=' .repeat(60))

// Create MCP client with SSE transport
const transport = new SSEClientTransport(new URL(mcpUrl))
const client = new Client(
  {
    name: 'test-client',
    version: '1.0.0',
  },
  {
    capabilities: {},
  }
)

async function runTests() {
  try {
    // Connect to server
    console.log('\n📡 Connecting to MCP server...')
    await client.connect(transport)
    console.log('✅ Connected successfully!\n')

    // Test 1: List available resources
    console.log('📋 Test 1: Listing available resources...')
    const resources = await client.request(
      {
        method: 'resources/list',
      },
      { timeout: 5000 }
    )
    console.log('✅ Resources available:')
    resources.resources.forEach((r) => {
      console.log(`   - ${r.name}`)
      console.log(`     URI: ${r.uri}`)
      console.log(`     ${r.description}\n`)
    })

    // Test 2: List available tools
    console.log('\n🔧 Test 2: Listing available tools...')
    const tools = await client.request(
      {
        method: 'tools/list',
      },
      { timeout: 5000 }
    )
    console.log('✅ Tools available:')
    tools.tools.forEach((t) => {
      console.log(`   - ${t.name}`)
      console.log(`     ${t.description}\n`)
    })

    // Test 3: List all projects
    console.log('\n📁 Test 3: Reading project list...')
    try {
      const projectList = await client.request(
        {
          method: 'resources/read',
          params: {
            uri: 'project://list',
          },
        },
        { timeout: 5000 }
      )
      const projects = JSON.parse(projectList.contents[0].text)
      console.log(`✅ Found ${projects.length} project(s):`)
      projects.forEach((p) => {
        console.log(`   - ${p.name} (${p.status}) - ${p.progress}% complete`)
        console.log(`     ID: ${p.id}`)
      })

      // If we have projects, test reading one
      if (projects.length > 0) {
        const testProjectId = projects[0].id

        // Test 4: Get project context
        console.log(`\n🎯 Test 4: Reading project context for "${projects[0].name}"...`)
        const contextResult = await client.request(
          {
            method: 'resources/read',
            params: {
              uri: `project://${testProjectId}/context`,
            },
          },
          { timeout: 5000 }
        )
        const context = JSON.parse(contextResult.contents[0].text)
        console.log('✅ Project context retrieved:')
        console.log(`   Name: ${context.project.name}`)
        console.log(`   Status: ${context.project.status}`)
        console.log(`   Priority: ${context.project.priority}`)
        if (context.businessContext) {
          console.log(`   Vision: ${context.businessContext.vision?.substring(0, 60)}...`)
        }

        // Test 5: Get execution plan
        console.log(`\n📊 Test 5: Reading execution plan...`)
        const executionResult = await client.request(
          {
            method: 'resources/read',
            params: {
              uri: `project://${testProjectId}/execution`,
            },
          },
          { timeout: 5000 }
        )
        const execution = JSON.parse(executionResult.contents[0].text)
        console.log('✅ Execution plan retrieved:')
        console.log(`   Total steps: ${execution.totalSteps}`)
        if (execution.steps.length > 0) {
          console.log(`   First step: ${execution.steps[0].title}`)
          console.log(`   Status: ${execution.steps[0].status}`)
        }

        // Test 6: Get progress
        console.log(`\n📈 Test 6: Reading project progress...`)
        const progressResult = await client.request(
          {
            method: 'resources/read',
            params: {
              uri: `project://${testProjectId}/progress`,
            },
          },
          { timeout: 5000 }
        )
        const progress = JSON.parse(progressResult.contents[0].text)
        console.log('✅ Progress retrieved:')
        console.log(`   Overall: ${progress.overallProgress}%`)
        console.log(`   Completed: ${progress.summary.completed}/${progress.summary.total}`)
        console.log(`   In Progress: ${progress.summary.inProgress}`)
        console.log(`   Available: ${progress.summary.available}`)
        if (progress.recommendedNext) {
          console.log(`   Recommended next: ${progress.recommendedNext.title}`)
        }

        // Test 7: Get next step using tool
        console.log(`\n🎲 Test 7: Getting next step to work on...`)
        const nextStepResult = await client.request(
          {
            method: 'tools/call',
            params: {
              name: 'get_next_step',
              arguments: {
                projectId: testProjectId,
              },
            },
          },
          { timeout: 5000 }
        )
        const nextStep = JSON.parse(nextStepResult.content[0].text)
        console.log('✅ Next step result:')
        console.log(`   ${nextStep.message}`)
        if (nextStep.nextStep) {
          console.log(`   Title: ${nextStep.nextStep.title}`)
          console.log(`   Phase: ${nextStep.nextStep.phase}`)
          console.log(`   Estimated hours: ${nextStep.nextStep.estimated_hours}`)
        }

        // Test 8: Get tech stack
        console.log(`\n⚙️  Test 8: Reading tech stack...`)
        const techStackResult = await client.request(
          {
            method: 'resources/read',
            params: {
              uri: `project://${testProjectId}/techstack`,
            },
          },
          { timeout: 5000 }
        )
        const techStack = JSON.parse(techStackResult.contents[0].text)
        console.log('✅ Tech stack retrieved:')
        console.log(`   Total items: ${techStack.all.length}`)
        console.log(`   Categories: ${Object.keys(techStack.byCategory).join(', ')}`)
      }
    } catch (error) {
      console.log('⚠️  No projects found in database yet')
      console.log('   Tip: Use the UI to create a project first, or run the seed script')
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ All tests completed successfully!')
    console.log('\n💡 Next steps:')
    console.log('   1. Create a project in the UI or seed the database')
    console.log('   2. Connect your AI agent (Claude/GPT) to this MCP server')
    console.log('   3. Tell the agent: "Connect to my AI Project Planner and continue work"')
    console.log('\n🔗 MCP Server URL: ' + mcpUrl)
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('\nStack trace:', error.stack)
    process.exit(1)
  } finally {
    // Close connection
    await client.close()
    console.log('\n👋 Disconnected from MCP server')
  }
}

// Run tests
runTests()
