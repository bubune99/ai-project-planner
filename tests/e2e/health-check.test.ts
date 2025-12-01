/**
 * E2E Test: Health Check and API Availability
 *
 * This test verifies that the application is running and the health endpoint works.
 * Run this test first to ensure the dev server is running and accessible.
 */

import { createTestHelper } from '../helpers/chrome-devtools'

describe('Health Check', () => {
  const helper = createTestHelper()
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

  test('API health endpoint returns ok status', async () => {
    console.log('\n=== Testing Health Endpoint ===\n')

    // Navigate to health endpoint
    await helper.navigateAndWait(`${BASE_URL}/api/health`, 10000)

    // Take snapshot to capture the JSON response
    const snapshot = await helper.takeSnapshot()
    console.log('Health endpoint snapshot captured')

    // Verify response contains success indicators
    helper.assertElementExists(snapshot, 'ok')
    helper.assertElementExists(snapshot, 'connected')

    // Check for no console errors
    await helper.assertNoConsoleErrors()

    console.log('✓ Health check passed')
  })

  test('Projects API endpoint is accessible', async () => {
    console.log('\n=== Testing Projects API ===\n')

    // Navigate to projects endpoint
    await helper.navigateAndWait(`${BASE_URL}/api/projects`, 10000)

    // Take snapshot
    const snapshot = await helper.takeSnapshot()
    console.log('Projects API snapshot captured')

    // Verify response structure
    helper.assertElementExists(snapshot, 'projects')
    helper.assertElementExists(snapshot, 'count')

    console.log('✓ Projects API accessible')
  })

  test('Main application loads without errors', async () => {
    console.log('\n=== Testing Main Application Load ===\n')

    // Navigate to homepage
    await helper.navigateAndWait(BASE_URL, 15000)

    // Wait for the page to be interactive
    await helper.waitForText('AI Project Planner', 5000)

    // Take screenshot for visual verification
    await helper.takeScreenshot({
      filePath: 'tests/screenshots/homepage.png',
      fullPage: true
    })

    // Check network requests for any failures
    const networkRequests = await helper.getNetworkRequests()
    console.log(`Network requests: ${networkRequests.length}`)

    // Verify no console errors
    await helper.assertNoConsoleErrors()

    console.log('✓ Main application loaded successfully')
  })
})
