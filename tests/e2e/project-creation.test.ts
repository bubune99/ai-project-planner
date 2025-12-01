/**
 * E2E Test: Project Creation Flow
 *
 * This test verifies the complete project creation workflow:
 * 1. Navigate to dashboard
 * 2. Click "Create Project" button
 * 3. Fill in project details
 * 4. Submit the form
 * 5. Verify project appears in the list
 */

import { createTestHelper } from '../helpers/chrome-devtools'

describe('Project Creation', () => {
  const helper = createTestHelper()
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

  test('Create a new project through the UI', async () => {
    console.log('\n=== Testing Project Creation Flow ===\n')

    // Step 1: Navigate to dashboard
    await helper.navigateAndWait(BASE_URL, 15000)
    console.log('✓ Dashboard loaded')

    // Step 2: Take initial snapshot to find the "Create Project" button
    let snapshot = await helper.takeSnapshot()
    await helper.takeScreenshot({
      filePath: 'tests/screenshots/01-dashboard.png'
    })

    // Find and click "Create Project" or "New Project" button
    const createButtonUid = helper.extractElementUid(
      snapshot,
      'button',
      'Create Project'
    ) || helper.extractElementUid(snapshot, 'button', 'New Project')

    if (!createButtonUid) {
      throw new Error('Could not find Create Project button')
    }

    await helper.click(createButtonUid)
    console.log('✓ Clicked Create Project button')

    // Wait for modal/form to appear
    await helper.waitForText('Project Name', 5000)
    snapshot = await helper.takeSnapshot()
    await helper.takeScreenshot({
      filePath: 'tests/screenshots/02-create-form.png'
    })

    // Step 3: Fill in project details
    const projectName = `Test Project ${Date.now()}`
    const projectDescription = 'E2E test project created by automated tests'

    // Extract form field UIDs
    const nameFieldUid = helper.extractElementUid(snapshot, 'textbox', 'Project Name')
    const descFieldUid = helper.extractElementUid(snapshot, 'textbox', 'Description')

    if (!nameFieldUid || !descFieldUid) {
      throw new Error('Could not find form fields')
    }

    // Fill the form
    await helper.fillForm([
      { uid: nameFieldUid, value: projectName },
      { uid: descFieldUid, value: projectDescription }
    ])
    console.log('✓ Filled project form')

    await helper.takeScreenshot({
      filePath: 'tests/screenshots/03-form-filled.png'
    })

    // Step 4: Submit the form
    snapshot = await helper.takeSnapshot()
    const submitButtonUid = helper.extractElementUid(
      snapshot,
      'button',
      'Create'
    ) || helper.extractElementUid(snapshot, 'button', 'Submit')

    if (!submitButtonUid) {
      throw new Error('Could not find Submit button')
    }

    await helper.click(submitButtonUid)
    console.log('✓ Submitted form')

    // Wait for success/redirect
    await helper.waitForText(projectName, 10000)

    // Step 5: Verify project appears in the list
    snapshot = await helper.takeSnapshot()
    await helper.takeScreenshot({
      filePath: 'tests/screenshots/04-project-created.png',
      fullPage: true
    })

    helper.assertElementExists(snapshot, projectName)
    console.log('✓ Project created and visible in list')

    // Verify no console errors during the flow
    await helper.assertNoConsoleErrors()

    console.log('\n✅ Project creation flow completed successfully\n')
  })

  test('Project creation validation works', async () => {
    console.log('\n=== Testing Project Creation Validation ===\n')

    await helper.navigateAndWait(BASE_URL, 15000)

    // Open create dialog
    let snapshot = await helper.takeSnapshot()
    const createButtonUid = helper.extractElementUid(snapshot, 'button', 'Create Project')

    if (createButtonUid) {
      await helper.click(createButtonUid)
      await helper.waitForText('Project Name', 5000)

      // Try to submit without filling required fields
      snapshot = await helper.takeSnapshot()
      const submitButtonUid = helper.extractElementUid(snapshot, 'button', 'Create')

      if (submitButtonUid) {
        await helper.click(submitButtonUid)

        // Should show validation error
        await helper.waitForText('required', 5000)
        console.log('✓ Validation error shown for empty form')
      }
    }

    console.log('✅ Validation test completed\n')
  })
})
