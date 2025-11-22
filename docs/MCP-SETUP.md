# MCP Server Setup Guide

Your AI Project Planner now has a fully functional **Model Context Protocol (MCP) server** that exposes all project data to AI agents!

## 🚀 What This Enables

AI agents (Claude, GPT, etc.) can now:
- **Query** your project architecture, requirements, and tech stack
- **Read** current progress and execution plans
- **Update** step status automatically as they work
- **Report** blockers when they get stuck
- **Get** the next recommended step to work on

## 📍 MCP Server Endpoints

Your MCP server is available at:
- **Local Development**: `http://localhost:3000/mcp/sse`
- **Production**: `https://your-domain.vercel.app/mcp/sse`

## 🔧 Available Resources

AI agents can query these resources:

### 1. List All Projects
\`\`\`
URI: project://list
\`\`\`
Returns all projects with basic info (name, status, progress)

### 2. Project Business Context
\`\`\`
URI: project://{projectId}/context
\`\`\`
Returns full business context including:
- Vision, target market, success metrics
- Project metadata and description

### 3. Project Execution Plan
\`\`\`
URI: project://{projectId}/execution
\`\`\`
Returns all steps with:
- Dependencies between steps
- Phases and stages
- Estimated hours
- Task lists

### 4. Project Progress
\`\`\`
URI: project://{projectId}/progress
\`\`\`
Returns current state:
- Completed steps
- In-progress steps
- Blocked steps
- Next available steps (what can be worked on now)
- Recommended next step

### 5. Technology Stack
\`\`\`
URI: project://{projectId}/techstack
\`\`\`
Returns tech stack grouped by category with:
- Rationale for each choice
- Alternatives considered
- Version information

## 🛠️ Available Tools

AI agents can perform these actions:

### 1. `get_next_step`
Get the next recommended step to work on
\`\`\`json
{
  "projectId": "uuid"
}
\`\`\`

### 2. `mark_step_complete`
Mark a step as completed
\`\`\`json
{
  "projectId": "uuid",
  "stepId": "uuid",
  "actualHours": 3.5,
  "notes": "Completed with all tests passing"
}
\`\`\`

### 3. `mark_step_in_progress`
Mark a step as in progress
\`\`\`json
{
  "projectId": "uuid",
  "stepId": "uuid"
}
\`\`\`

### 4. `report_blocker`
Report a blocker
\`\`\`json
{
  "projectId": "uuid",
  "stepId": "uuid",
  "blocker": "Missing API keys",
  "severity": "high"
}
\`\`\`

### 5. `update_step_progress`
Update progress percentage
\`\`\`json
{
  "projectId": "uuid",
  "stepId": "uuid",
  "progress": 75
}
\`\`\`

## 🧪 Testing the MCP Server

### Run the Test Client
\`\`\`bash
# Make sure your dev server is running
pnpm dev

# In another terminal, run the test client
node scripts/test-mcp-client.mjs http://localhost:3000
\`\`\`

This will test all resources and tools to verify everything works.

## 🤖 Using with AI Agents

### With Claude Code (Desktop)
1. Add MCP server to your Claude config:
\`\`\`json
{
  "mcpServers": {
    "ai-project-planner": {
      "url": "http://localhost:3000/mcp/sse"
    }
  }
}
\`\`\`

2. Tell Claude:
\`\`\`
Connect to my AI Project Planner MCP server and continue work on project: [project-name]
\`\`\`

### With Cursor IDE
1. Configure MCP in Cursor settings
2. Point to: `http://localhost:3000/mcp/sse`
3. Use in prompts:
\`\`\`
Query the AI Project Planner MCP for the next step, then implement it
\`\`\`

### With Custom AI Agents
Use the MCP SDK to connect:
\`\`\`typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

const transport = new SSEClientTransport(
  new URL('http://localhost:3000/mcp/sse')
)
const client = new Client({ name: 'my-agent', version: '1.0.0' }, {})

await client.connect(transport)

// Get next step
const result = await client.request({
  method: 'tools/call',
  params: {
    name: 'get_next_step',
    arguments: { projectId: 'your-project-id' }
  }
})
\`\`\`

## 📋 Autonomous Development Workflow

Here's how the full autonomous workflow works:

### 1. You Architect the Project (in UI)
- Define business context
- Add requirements and user stories
- Choose tech stack
- Break down into steps with dependencies

### 2. AI Agent Connects to MCP
Agent queries: `project://your-project-id/progress`

Gets:
\`\`\`json
{
  "recommendedNext": {
    "id": "step-1",
    "title": "Setup Database Schema",
    "tasks": ["Create migrations", "Setup connection"],
    "dependencies": [],
    "techStack": ["PostgreSQL", "Neon"]
  }
}
\`\`\`

### 3. AI Implements the Step
- Reads requirements
- Writes code
- Runs tests

### 4. AI Updates Progress
Calls: `mark_step_complete`
\`\`\`json
{
  "projectId": "uuid",
  "stepId": "step-1",
  "actualHours": 2,
  "notes": "Database schema created, migrations run successfully"
}
\`\`\`

### 5. AI Gets Next Step (Automatically)
Calls: `get_next_step` again

Gets: "Setup Authentication" (now unblocked)

### 6. Repeat Until Done or Blocked
If blocked, AI calls: `report_blocker`

You get notified → fix the blocker → AI resumes

## 🔐 Security Notes

### Current State (Development)
- No authentication on MCP endpoints
- Database connection uses `DATABASE_URL` env var
- Suitable for local development

### For Production
You should add:
- API key authentication
- Rate limiting
- Request validation
- Audit logging

## 📦 Dependencies

The MCP server uses these packages:
- `@modelcontextprotocol/sdk` - Official MCP SDK
- `mcp-handler` - Next.js adapter for MCP

Both are production-ready and maintained by Vercel Labs.

## 🐛 Troubleshooting

### MCP Server Not Starting
1. Check if `pnpm dev` is running
2. Visit `http://localhost:3000/mcp/sse` - should see MCP response
3. Check console for errors

### Database Connection Errors
1. Ensure `DATABASE_URL` is set in `.env.local`
2. Run migrations: `pnpm db:migrate`
3. Check Neon dashboard for connection status

### Test Client Fails
1. Install dependencies: `pnpm install`
2. Make sure dev server is running
3. Check the URL matches your setup

## 🚀 Next Steps

1. **Seed Your Database** with a test project
2. **Run the Test Client** to verify everything works
3. **Configure Your AI Agent** to connect to the MCP server
4. **Try the Autonomous Workflow**: "Connect and continue work on project X"

## 📚 Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP SDK Docs](https://github.com/modelcontextprotocol/typescript-sdk)
- [Vercel MCP Template](https://github.com/vercel-labs/mcp-for-next.js)
