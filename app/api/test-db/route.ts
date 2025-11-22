import { NextResponse } from 'next/server'
import { sql } from '@/lib/db/client'

/**
 * Simple database test endpoint
 * Tests basic connectivity and queries
 */
export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: []
  }

  try {
    // Test 1: Basic connection
    results.tests.push({ name: 'Connection Test', status: 'running' })
    const [version] = await sql`SELECT version()`
    results.tests[results.tests.length - 1].status = 'passed'
    results.tests[results.tests.length - 1].result = version.version.substring(0, 50)

    // Test 2: Check if projects table exists
    results.tests.push({ name: 'Projects Table Exists', status: 'running' })
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'projects'
      ) as exists
    `
    results.tests[results.tests.length - 1].status = tableCheck[0].exists ? 'passed' : 'failed'
    results.tests[results.tests.length - 1].result = `Table exists: ${tableCheck[0].exists}`

    // Test 3: Count projects (simple query)
    results.tests.push({ name: 'Count Projects', status: 'running' })
    const [count] = await sql`SELECT COUNT(*) as count FROM projects`
    results.tests[results.tests.length - 1].status = 'passed'
    results.tests[results.tests.length - 1].result = `${count.count} projects found`

    // Test 4: Select one project (if any exist)
    if (count.count > 0) {
      results.tests.push({ name: 'Select First Project', status: 'running' })
      const [project] = await sql`SELECT * FROM projects LIMIT 1`
      results.tests[results.tests.length - 1].status = 'passed'
      results.tests[results.tests.length - 1].result = `Project: ${project.name}`
    }

    return NextResponse.json({
      status: 'success',
      ...results
    })

  } catch (error: any) {
    const failedTest = results.tests[results.tests.length - 1]
    if (failedTest) {
      failedTest.status = 'failed'
      failedTest.error = error.message
    }

    return NextResponse.json({
      status: 'error',
      error: error.message,
      code: error.code,
      detail: error.detail,
      ...results
    }, { status: 500 })
  }
}
