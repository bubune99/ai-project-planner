/**
 * Chrome DevTools MCP Test Helpers
 *
 * This file provides helper functions for e2e testing using the Chrome DevTools MCP.
 * These functions wrap the MCP tools to provide a cleaner testing API.
 */

export interface TestPage {
  url: string
  index: number
  title: string
}

export interface TestElement {
  uid: string
  role: string
  name: string
}

/**
 * Test helper class for Chrome DevTools MCP interactions
 */
export class ChromeTestHelper {
  /**
   * Navigate to a URL and wait for the page to load
   */
  async navigateAndWait(url: string, timeout = 30000): Promise<void> {
    console.log(`[Test] Navigating to: ${url}`)
    // This would use mcp__chrome-devtools__navigate_page
    // Implementation will call the MCP tool
  }

  /**
   * Take a snapshot of the current page
   */
  async takeSnapshot(filePath?: string): Promise<string> {
    console.log(`[Test] Taking page snapshot`)
    // This would use mcp__chrome-devtools__take_snapshot
    return ''
  }

  /**
   * Take a screenshot of the current page or element
   */
  async takeScreenshot(options?: {
    filePath?: string
    uid?: string
    fullPage?: boolean
  }): Promise<void> {
    console.log(`[Test] Taking screenshot`, options)
    // This would use mcp__chrome-devtools__take_screenshot
  }

  /**
   * Click on an element by its UID from the snapshot
   */
  async click(uid: string, doubleClick = false): Promise<void> {
    console.log(`[Test] Clicking element: ${uid}`)
    // This would use mcp__chrome-devtools__click
  }

  /**
   * Fill an input field with a value
   */
  async fill(uid: string, value: string): Promise<void> {
    console.log(`[Test] Filling element ${uid} with: ${value}`)
    // This would use mcp__chrome-devtools__fill
  }

  /**
   * Fill multiple form fields at once
   */
  async fillForm(elements: Array<{ uid: string; value: string }>): Promise<void> {
    console.log(`[Test] Filling form with ${elements.length} fields`)
    // This would use mcp__chrome-devtools__fill_form
  }

  /**
   * Wait for text to appear on the page
   */
  async waitForText(text: string, timeout = 10000): Promise<void> {
    console.log(`[Test] Waiting for text: "${text}"`)
    // This would use mcp__chrome-devtools__wait_for
  }

  /**
   * Execute custom JavaScript on the page
   */
  async executeScript<T = any>(func: string, args?: Array<{ uid: string }>): Promise<T> {
    console.log(`[Test] Executing script`)
    // This would use mcp__chrome-devtools__evaluate_script
    return {} as T
  }

  /**
   * List all network requests since last navigation
   */
  async getNetworkRequests(options?: {
    resourceTypes?: string[]
    pageIdx?: number
    pageSize?: number
  }): Promise<any> {
    console.log(`[Test] Getting network requests`)
    // This would use mcp__chrome-devtools__list_network_requests
    return []
  }

  /**
   * List all console messages
   */
  async getConsoleMessages(options?: {
    types?: string[]
    pageIdx?: number
    pageSize?: number
  }): Promise<any> {
    console.log(`[Test] Getting console messages`)
    // This would use mcp__chrome-devtools__list_console_messages
    return []
  }

  /**
   * Check for JavaScript errors in the console
   */
  async assertNoConsoleErrors(): Promise<void> {
    console.log(`[Test] Checking for console errors`)
    const messages = await this.getConsoleMessages({ types: ['error'] })
    if (messages.length > 0) {
      throw new Error(`Found ${messages.length} console errors`)
    }
  }

  /**
   * List all open pages
   */
  async listPages(): Promise<TestPage[]> {
    console.log(`[Test] Listing open pages`)
    // This would use mcp__chrome-devtools__list_pages
    return []
  }

  /**
   * Select a page by index
   */
  async selectPage(pageIdx: number): Promise<void> {
    console.log(`[Test] Selecting page: ${pageIdx}`)
    // This would use mcp__chrome-devtools__select_page
  }

  /**
   * Create a new page/tab
   */
  async newPage(url: string, timeout = 30000): Promise<void> {
    console.log(`[Test] Creating new page: ${url}`)
    // This would use mcp__chrome-devtools__new_page
  }

  /**
   * Close a page by index
   */
  async closePage(pageIdx: number): Promise<void> {
    console.log(`[Test] Closing page: ${pageIdx}`)
    // This would use mcp__chrome-devtools__close_page
  }

  /**
   * Check the health of an API endpoint
   */
  async checkApiHealth(endpoint: string): Promise<any> {
    await this.navigateAndWait(endpoint)
    const snapshot = await this.takeSnapshot()
    // Parse JSON response from snapshot
    return {}
  }

  /**
   * Assert that an element exists in the snapshot
   */
  assertElementExists(snapshot: string, searchText: string): void {
    if (!snapshot.includes(searchText)) {
      throw new Error(`Element not found in snapshot: ${searchText}`)
    }
  }

  /**
   * Extract element UID from snapshot by role and name
   */
  extractElementUid(snapshot: string, role: string, name: string): string | null {
    // Parse snapshot to find element with matching role and name
    // Return the UID
    const lines = snapshot.split('\n')
    for (const line of lines) {
      if (line.includes(role) && line.includes(name)) {
        const match = line.match(/uid="([^"]+)"/)
        if (match) return match[1]
      }
    }
    return null
  }
}

/**
 * Create a new test helper instance
 */
export function createTestHelper(): ChromeTestHelper {
  return new ChromeTestHelper()
}
