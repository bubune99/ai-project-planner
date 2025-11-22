# MCP Server Setup for Vercel (Production)

## Overview

Your AI Project Planner is deployed on Vercel with an MCP server that allows Claude Desktop and other AI agents to access your project data remotely.

**Your MCP Server URL:** `https://your-app-name.vercel.app/mcp`

## Step 1: Generate an API Key

For security, your MCP server requires authentication in production.

\`\`\`bash
# Generate a secure random API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
\`\`\`

Copy the generated key (e.g., `a1b2c3d4e5f6...`)

## Step 2: Add API Key to Vercel

1. Go to your Vercel dashboard: https://vercel.com/dashboard
2. Select your project: `ai-project-planner`
3. Go to **Settings** → **Environment Variables**
4. Add a new variable:
   - **Name:** `MCP_API_KEY`
   - **Value:** (paste the key you generated)
   - **Environment:** Production, Preview, Development
5. Click **Save**
6. **Redeploy** your app for the changes to take effect

## Step 3: Configure Claude Desktop

### Find Your App URL

After deploying to Vercel, your app will be at:
\`\`\`
https://your-project-name.vercel.app
\`\`\`

Your MCP server endpoint is:
\`\`\`
https://your-project-name.vercel.app/mcp
\`\`\`

### Update Claude Desktop Config

**On macOS:**
\`\`\`bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
\`\`\`

**On Windows:**
\`\`\`bash
code %APPDATA%\Claude\claude_desktop_config.json
\`\`\`

**Add this configuration:**
\`\`\`json
{
  "mcpServers": {
    "ai-project-planner": {
      "url": "https://your-project-name.vercel.app/mcp",
      "type": "http",
      "headers": {
        "x-api-key": "your-generated-api-key-here"
      }
    }
  }
}
\`\`\`

Replace:
- `your-project-name.vercel.app` with your actual Vercel URL
- `your-generated-api-key-here` with the API key from Step 1

## Step 4: Test the Connection

1. **Restart Claude Desktop** completely
2. Look for the MCP server indicator in the bottom-left corner
3. It should show "ai-project-planner" as connected
4. Try asking Claude:
   \`\`\`
   List all my projects
   \`\`\`

Claude will query your Vercel-hosted database through the MCP server!

## Available Tools

Once connected, Claude can use these tools:

### `list_projects`
\`\`\`
Show me all my projects
\`\`\`

### `get_project_context`
\`\`\`
Get the full context for project [project-id]
\`\`\`

### `get_execution_plan`
\`\`\`
What's the execution plan for my e-commerce project?
\`\`\`

### `add_progress_note`
\`\`\`
Add a milestone note to project abc-123: "Completed user authentication"
\`\`\`

## Troubleshooting

### "Connection failed" or "401 Unauthorized"

**Check:**
1. API key is set in Vercel environment variables
2. API key in Claude config matches exactly (no extra spaces)
3. You redeployed after adding the environment variable
4. URL is correct (https, not http)

**Fix:**
\`\`\`bash
# Verify environment variable in Vercel
vercel env ls

# If missing, add it:
vercel env add MCP_API_KEY
\`\`\`

### "Cannot read properties of undefined"

Your database might not be set up. Run migrations:
\`\`\`bash
git push origin Mission-control
# Vercel will auto-deploy and run with DATABASE_URL
\`\`\`

### Test MCP Server Directly

\`\`\`bash
# Test without auth (should fail in production)
curl https://your-app.vercel.app/mcp

# Test with auth (should work)
curl -H "x-api-key: your-key-here" \
     -H "Content-Type: application/json" \
     -d '{"method":"tools/list"}' \
     https://your-app.vercel.app/mcp
\`\`\`

## Security Best Practices

1. **Keep your API key secret** - Don't commit it to git
2. **Rotate keys periodically** - Generate new keys every few months
3. **Use different keys per environment** - Separate keys for development/production
4. **Monitor usage** - Check Vercel logs for unauthorized access attempts

## Using with Claude Code

In Claude Code agents, you can use the MCP server:

\`\`\`typescript
// .claude/agents/sync-project.ts
const mcp = new MCPClient({
  url: 'https://your-app.vercel.app/mcp',
  headers: {
    'x-api-key': process.env.MCP_API_KEY
  }
})

const projects = await mcp.callTool('list_projects', {})
console.log(projects)
\`\`\`

## Next Steps

Now that your MCP server is live:

1. **Build automation agents** - Create agents that sync GitHub → your platform
2. **Auto-generate documentation** - Use Claude to write ADRs from your code
3. **Track progress automatically** - Connect GitHub webhooks to update projects
4. **Query from anywhere** - Use the MCP server from any AI tool that supports it

Your platform is now AI-accessible from anywhere! 🚀
