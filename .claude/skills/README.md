# AI Project Planner - Claude Skills

This folder contains comprehensive documentation for AI agents using the AI Project Planner via Model Context Protocol (MCP).

## Quick Start

If you're an AI agent connecting to this project for the first time:

1. **Read** `mcp-capabilities.md` - Understand all 34 MCP tools available
2. **Review** `database-schema.md` - Understand the data model
3. **Learn** `project-lifecycle.md` - Understand the ideation → deployment flow
4. **Study** `ai-workflows.md` - Best practices for autonomous work
5. **Practice** `examples.md` - See real-world scenarios

## File Overview

### 📘 mcp-capabilities.md
**Complete reference of all MCP tools and resources**

- 34 MCP tools organized by category
- 4 MCP resources for read-only context
- Input/output specifications
- When to use each tool
- Common workflows

**Use this when:** You need to know what tools are available or how to use a specific tool.

---

### 📗 database-schema.md
**Complete database schema with relationships and functions**

- 12 main tables with detailed field descriptions
- Entity relationship diagrams
- Database functions and triggers
- Views for optimized queries
- Data integrity rules

**Use this when:** You need to understand the data model or write complex queries.

---

### 📙 project-lifecycle.md
**Complete project workflow from ideation to maintenance**

- 6 lifecycle phases (ideation → architecture → construction → testing → deployment → maintenance)
- Entry and exit criteria for each phase
- Typical steps and deliverables
- Phase transition workflows
- Autonomous AI agent loop

**Use this when:** You need to understand what phase you're in or how to transition phases.

---

### 📕 ai-workflows.md
**Best practices and patterns for AI agents**

- Standard task execution loop
- Architecture decision making
- Feature request management
- Multi-agent collaboration
- Progress transparency
- Blocker reporting
- Anti-patterns to avoid

**Use this when:** You're implementing a feature and want to follow best practices.

---

### 📓 examples.md
**Real-world scenarios with complete code**

- Creating a new SaaS project
- Making architecture decisions
- Handling blockers
- Architecture pivots
- Post-MVP feature requests
- Multi-agent collaboration

**Use this when:** You need to see a complete example of how to use the tools.

---

## Connection Information

### MCP Server Endpoint
- **Local Development:** `http://localhost:3001/mcp/stdio`
- **Production:** (TBD - will be deployed to Vercel)

### Environment Variables Required
\`\`\`bash
DATABASE_URL=          # Neon PostgreSQL connection string
OPENAI_API_KEY=        # For AI features (optional during development)
\`\`\`

### MCP Resources Available

\`\`\`typescript
// Get complete project context
const context = await fetchResource('project://{projectId}/context')

// Get next recommended steps
const nextSteps = await fetchResource('project://{projectId}/next-steps')

// Get execution roadmap
const plan = await fetchResource('project://{projectId}/execution-plan')

// Get tech stack documentation
const techStack = await fetchResource('project://{projectId}/tech-stack')
\`\`\`

## Quick Reference: Tool Categories

### 🔄 Workflow Tools (5)
Core execution flow
- `get_next_step`
- `mark_step_in_progress`
- `mark_step_complete`
- `report_blocker`
- `update_step_progress`

### 📋 Project Management (3)
CRUD for projects
- `create_project`
- `update_project`
- `delete_project`

### ✅ Step Management (4)
Task creation and management
- `create_step`
- `update_step`
- `delete_step`
- `reorder_steps`

### 💼 Business Context (2)
Strategic context management
- `create_business_context`
- `update_business_context`

### 🛠️ Tech Stack (3)
Technology decisions
- `add_tech_stack_item`
- `update_tech_stack_item`
- `remove_tech_stack_item`

### 🔗 Dependencies (2)
Task dependencies
- `create_dependency`
- `remove_dependency`

### 📄 Documents (4)
Document management
- `create_document`
- `update_document`
- `delete_document`
- `link_document_to_task`
- `unlink_document_from_task`

### 🤖 Agent Assignment (2)
AI agent task routing
- `assign_agent_to_task`
- `unassign_agent_from_task`

### 📝 Progress Notes (2)
AI self-documentation
- `add_progress_note`
- `get_progress_notes`

### 🔢 Project Versions (3)
Iteration management
- `create_version`
- `update_version`
- `get_versions`

### 🎯 Feature Requests (3)
Bug/enhancement tracking
- `create_feature_request`
- `approve_feature_request`
- `get_feature_backlog`

### 🏗️ Project Phases (2)
Lifecycle tracking
- `get_current_phase`
- `transition_to_phase`

### 🏛️ Architecture Decisions (4)
ADR management
- `create_adr`
- `update_adr`
- `get_project_adrs`
- `supersede_adr`

## Core AI Agent Loop

\`\`\`typescript
async function autonomousAgentLoop(projectId: string) {
  while (true) {
    // 1. Get context
    const context = await fetchResource(`project://${projectId}/context`)

    // 2. Get next step
    const { nextStep } = await callTool('get_next_step', { projectId })

    if (!nextStep) break

    // 3. Mark in progress
    await callTool('mark_step_in_progress', {
      stepId: nextStep.id,
      agentName: "Claude"
    })

    // 4. Do the work
    try {
      await implementStep(nextStep, context)

      // 5. Mark complete
      await callTool('mark_step_complete', {
        stepId: nextStep.id,
        completedBy: "Claude",
        actualHours: 2.5
      })

      // 6. Document
      await callTool('add_progress_note', {
        projectId,
        stepId: nextStep.id,
        authorName: "Claude",
        authorType: "agent",
        noteType: "completion",
        content: "Detailed summary of what was done..."
      })
    } catch (error) {
      // 7. Report blockers
      await callTool('report_blocker', {
        stepId: nextStep.id,
        blockerDescription: error.message,
        reportedBy: "Claude",
        severity: "high"
      })
      break
    }
  }
}
\`\`\`

## Best Practices Summary

### 1. Always Query Context First
\`\`\`typescript
const context = await fetchResource(`project://${projectId}/context`)
\`\`\`

### 2. Mark Steps In Progress
\`\`\`typescript
await callTool('mark_step_in_progress', { stepId, agentName: "Claude" })
\`\`\`

### 3. Document Everything
\`\`\`typescript
await callTool('add_progress_note', {
  projectId,
  stepId,
  authorName: "Claude",
  authorType: "agent",
  noteType: "decision",
  content: "Why I made this choice..."
})
\`\`\`

### 4. Report Blockers Immediately
\`\`\`typescript
await callTool('report_blocker', {
  stepId,
  blockerDescription: "Missing API key",
  reportedBy: "Claude",
  severity: "high"
})
\`\`\`

### 5. Track Architecture Decisions
\`\`\`typescript
await callTool('create_adr', {
  projectId,
  title: "Use PostgreSQL for database",
  context: "Why we're deciding this...",
  decision: "What we decided...",
  alternatives: [...]
})
\`\`\`

## Vision: Autonomous AI Development

This platform enables:

1. **User focuses on:** Architecture, UI design, client communication
2. **AI agents handle:** Development, testing, validation, documentation
3. **Workflow:** User says "connect to the platform and continue your work"

### Example Autonomous Session

\`\`\`
User: "Continue working on the project"

Claude:
1. Connects to MCP server
2. Queries project context
3. Gets next recommended step
4. Implements the feature
5. Documents decisions
6. Runs tests
7. Reports completion
8. Moves to next step
9. Repeats until blocked or complete

User: Reviews progress notes, approves architecture decisions, unblocks issues
\`\`\`

## Contributing to Skills Documentation

If you discover new patterns or best practices:

1. Add examples to `examples.md`
2. Update workflows in `ai-workflows.md`
3. Document new tools in `mcp-capabilities.md`
4. Submit improvements via pull request

## Support

For questions or issues:
- Check `examples.md` for similar scenarios
- Review `ai-workflows.md` for best practices
- Ask questions via `add_progress_note` with `noteType: "question"`

---

**Last Updated:** 2024-01-21
**MCP Server Version:** 1.0 (34 tools, 4 resources)
**Database Schema:** Migration 015 (15 migrations)
