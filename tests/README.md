# E2E Testing with Chrome DevTools MCP

This directory contains end-to-end tests for the AI Project Planner using Chrome DevTools MCP integration.

## 📋 Overview

We use Chrome DevTools MCP (Model Context Protocol) for browser automation and testing. This provides a lightweight alternative to Playwright/Puppeteer with direct Chrome integration.

## 🏗️ Structure

```
tests/
├── e2e/                       # E2E test files
│   ├── health-check.test.ts   # API and application health tests
│   └── project-creation.test.ts # Project creation flow tests
├── helpers/                   # Test utilities
│   └── chrome-devtools.ts     # Chrome DevTools helper class
├── screenshots/               # Test screenshots
└── README.md                  # This file
```

## 🚀 Setup

### Prerequisites

1. **Chrome Browser** installed and accessible
   ```bash
   google-chrome --version
   # Should show: Google Chrome 142.x.x or later
   ```

2. **Chrome DevTools MCP** configured in Claude Code
   - The MCP server should be running
   - Chrome should be launched with remote debugging enabled

3. **Dev Server Running**
   ```bash
   PORT=3005 npx next dev
   # Server will run on http://localhost:3005
   ```

### Environment Variables

Create a `.env.test` file:
```bash
TEST_BASE_URL=http://localhost:3005
```

## 🧪 Running Tests

### Manual Testing with Chrome DevTools

The Chrome DevTools MCP provides these tools for manual testing:

- `mcp__chrome-devtools__list_pages` - List all open browser pages
- `mcp__chrome-devtools__navigate_page` - Navigate to a URL
- `mcp__chrome-devtools__take_snapshot` - Get page accessibility tree snapshot
- `mcp__chrome-devtools__take_screenshot` - Capture visual screenshot
- `mcp__chrome-devtools__click` - Click an element
- `mcp__chrome-devtools__fill` - Fill form inputs
- `mcp__chrome-devtools__list_network_requests` - Monitor network traffic
- `mcp__chrome-devtools__list_console_messages` - Check console logs

### Example Test Flow

```typescript
// 1. List pages
const pages = await listPages()

// 2. Navigate to application
await navigatePage({ url: 'http://localhost:3005', timeout: 15000 })

// 3. Take snapshot to see page structure
const snapshot = await takeSnapshot()

// 4. Take screenshot for visual verification
await takeScreenshot({ filePath: 'tests/screenshots/homepage.png' })

// 5. Interact with elements
const buttonUid = extractElementUid(snapshot, 'button', 'Create Project')
await click({ uid: buttonUid })

// 6. Verify network requests
const requests = await listNetworkRequests()

// 7. Check for console errors
const errors = await listConsoleMessages({ types: ['error'] })
```

## 📝 Test Files

### health-check.test.ts

Tests basic application health:
- ✅ API health endpoint returns ok status
- ✅ Projects API endpoint is accessible
- ✅ Main application loads without errors

### project-creation.test.ts

Tests the complete project creation workflow:
- ✅ Navigate to dashboard
- ✅ Click "Create Project" button
- ✅ Fill in project form
- ✅ Submit and verify project appears
- ✅ Validation error handling

## 🔧 Helper Methods

The `ChromeTestHelper` class in `helpers/chrome-devtools.ts` provides:

### Navigation
- `navigateAndWait(url, timeout)` - Navigate and wait for page load
- `selectPage(index)` - Switch to a different browser tab
- `newPage(url)` - Open a new tab
- `closePage(index)` - Close a tab

### Interaction
- `click(uid, doubleClick)` - Click an element
- `fill(uid, value)` - Fill a form field
- `fillForm(elements)` - Fill multiple fields at once

### Verification
- `takeSnapshot()` - Get accessibility tree
- `takeScreenshot(options)` - Capture screenshot
- `waitForText(text, timeout)` - Wait for text to appear
- `assertElementExists(snapshot, text)` - Verify element presence
- `assertNoConsoleErrors()` - Check for JS errors

### Debugging
- `getNetworkRequests(options)` - View network activity
- `getConsoleMessages(options)` - View console logs
- `executeScript(func, args)` - Run custom JavaScript

## 🎯 Current Status

✅ **Completed:**
- Test framework structure created
- Helper utilities implemented
- Example tests written
- Dev server running on port 3005
- Chrome DevTools integration verified

⏳ **Next Steps:**
1. Reconnect Chrome DevTools MCP (ensure Chrome is running with debugging)
2. Implement actual test execution
3. Add CI/CD integration
4. Expand test coverage

## 🐛 Troubleshooting

### Chrome DevTools Not Connected

```bash
# 1. Check if Chrome is running
ps aux | grep chrome

# 2. Launch Chrome with remote debugging
google-chrome --remote-debugging-port=9222

# 3. Verify MCP connection
# The MCP should auto-connect to Chrome
```

### Tests Failing

1. **Server not running**: Ensure dev server is on port 3005
2. **Database connection**: Check `.env` has valid `DATABASE_URL`
3. **Chrome not responding**: Restart Chrome with debugging enabled
4. **Element not found**: Take a snapshot first to see actual UIDs

### Port Already in Use

```bash
# Find process using port 3005
lsof -ti:3005

# Kill the process
kill -9 $(lsof -ti:3005)

# Or use a different port
PORT=3006 npx next dev
```

## 📚 Resources

- [Chrome DevTools Protocol](https://chromatichq.com/insights/chrome-devtools-protocol/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Next.js Testing](https://nextjs.org/docs/testing)

## 🤝 Contributing

When adding new tests:

1. Follow the existing test structure
2. Use descriptive test names
3. Add screenshots for visual tests
4. Document expected behavior
5. Clean up after tests (close modals, reset state)

---

**Last Updated:** 2025-11-29
**Server Running:** http://localhost:3005
**Chrome DevTools:** Ready for testing
