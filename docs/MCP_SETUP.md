# MCP Server Setup Guide

## What is MCP?

The Model Context Protocol (MCP) allows Claude and other AI agents to access your project data through a standardized interface. Your platform exposes tools and resources that agents can use to:

- Query project context
- List projects
- Get execution plans
- Add progress notes automatically

## Quick Start

### 1. Start Your Development Server

\`\`\`bash
pnpm dev
\`\`\`

Your MCP server is now running at `http://localhost:3000/mcp`

### 2. Configure Claude Desktop (Local Development)

**On macOS:**
\`\`\`bash
# Edit Claude Desktop config
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
\`\`\`

**On Windows:**
\`\`\`bash
# Edit Claude Desktop config
code %APPDATA%\Claude\claude_desktop_config.json
\`\`\`

**Add this configuration:**
\`\`\`json
{
  "mcpServers": {
    "ai-project-planner": {
      "url": "http://localhost:3000/mcp",
      "type": "http"
    }
  }
}
\`\`\`

### 3. Restart Claude Desktop

After updating the config, restart Claude Desktop. You should see the MCP server connected in the bottom-left corner.

### 4. Test the Connection

In Claude Desktop, try:
\`\`\`
List all my projects
\`\`\`

Claude will use the `list_projects` tool from your MCP server!

## Available MCP Tools

Your server exposes these tools:

### `get_project_context`
Get full context for a project including business context, tech stack, and current phase.

**Parameters:**
- `projectId` (string): The project ID

**Example:**
\`\`\`
Get the full context for project abc-123
\`\`\`

### `list_projects`
List all projects in the system.

**No parameters required**

**Example:**
\`\`\`
Show me all my projects
\`\`\`

### `get_execution_plan`
Get the execution plan (steps and dependencies) for a project.

**Parameters:**
- `projectId` (string): The project ID

**Example:**
\`\`\`
What's the execution plan for my e-commerce project?
\`\`\`

### `add_progress_note`
Add a progress note to track development progress.

**Parameters:**
- `projectId` (string): The project ID
- `stepId` (string, optional): The step ID
- `noteType` (enum): Type of note (milestone, blocker, decision, update)
- `title` (string, optional): Note title
- `content` (string): Note content

**Example:**
\`\`\`
Add a milestone note to project abc-123: "Completed user authentication"
\`\`\`

## For Production (Vercel Deployment)

When deployed to Vercel, your MCP server will be at:
\`\`\`
https://your-app.vercel.app/mcp
\`\`\`

Update the Claude Desktop config URL to point to your production URL.

## Authentication (Optional)

The current setup has no authentication for simplicity. To add auth:

1. Add an API key to your `.env`:
\`\`\`bash
MCP_API_KEY=your-secret-key-here
\`\`\`

2. Update `app/mcp/route.ts` to check the key
3. Configure Claude Desktop with the API key

## Troubleshooting

### "Connection failed"
- Make sure `pnpm dev` is running
- Check that port 3000 is not blocked
- Verify the URL in claude_desktop_config.json is correct

### "Tool not found"
- Restart Claude Desktop after config changes
- Check the server logs for errors
- Verify DATABASE_URL is set in .env

### "Database errors"
- Run migrations: `npx dotenv -e .env -- pnpm db:migrate`
- Check your Neon database is accessible

## Using with Claude Code

In Claude Code, you can use the MCP tools directly:

\`\`\`typescript
// In a Claude Code agent script
const projects = await mcp.callTool("list_projects", {})
const context = await mcp.callTool("get_project_context", {
  projectId: "your-project-id"
})
\`\`\`

## Next Steps

1. **Build a documentation agent** that uses these tools
2. **Set up GitHub webhooks** to auto-populate progress notes
3. **Create more specialized tools** for your workflow

Your MCP server is the foundation for AI-native automation!
