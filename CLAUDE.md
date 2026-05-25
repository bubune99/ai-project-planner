# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Project Planner is an intelligent, adaptive project management platform designed for AI-assisted web application development. The system maintains persistent project context across development phases, orchestrates multiple AI agents, and learns from each development cycle to improve future implementations.

**Key Concept**: This is a "Central Persistence Agent" that tracks business context, technical decisions, and project state across all development phases, with intelligent routing to different AI tools based on task requirements.

---

## ⚡ AGENT CONTRACT — How to interact with this planner via MCP

**This planner exposes 80 MCP tools at `app/mcp/route.ts`.** When you (an AI agent — Claude Code, v0, GPT, etc.) interact with it, **always start with `planner_agent_guide`**. It returns the workflow contract for the current session.

### The check-in loop (mandatory for work execution)

Every step you work on goes through this loop. Skipping any of these breaks the platform's learning feedback:

```
work_order_claim_step       → returns JIT instructions + next_actions[]
   ↓
work_order_check_in("progress", message)   ← call at each milestone
   ↓ (during work, on each event)
work_order_check_in("blocker", message)    ← returns prior_art[]
work_order_check_in("completion", outcome) ← auto-promotes ready downstream
work_order_check_in("failure", message)    ← MUST follow with record_attempt
   ↓
record_spec_outcome                        ← MANDATORY scoring after every step
record_attempt (on failure)                ← MANDATORY for failure capture
entity_link (when you discover cross-refs) ← enriches the knowledge graph
```

**Every workflow tool returns a `next_actions[]` array.** Read it — it tells you what to call next based on what just happened.

### Common discovery flows

| You want to… | Call |
|---|---|
| Start a session | `planner_agent_guide` then `get_active_project` |
| Find an applicable template | `library_search({ query, types: ["feature_template"] })` |
| See what's been tried before | `find_attempts({ entity_type, search })` |
| See what's connected to X | `find_related({ entity_type, entity_id, hops: 2 })` |
| Render the knowledge graph | `get_knowledge_graph` (or visit /graph in browser) |
| Inspect any envelope | `get_5wh({ entity_type, entity_id })` |
| Audit envelope coverage | `audit_5wh({ scope: "summary" })` |

### What "go back" looks like in practice

When you finish an operation, the response tells you the next step. For example:

- After `compose_work_order`: response.next_actions tells you which step IDs are 'ready' to claim
- After `work_order_check_in("completion")`: response.next_actions tells you to score the outcome AND call `record_spec_outcome`
- After `work_order_check_in("blocker")`: response.prior_art[] shows what other agents tried; response.next_actions tells you how to either release or fail

### The 5W+H envelope

Every entity (idea, todo, work_order_step, prompt, skill, etc.) has a `documentation_5wh` JSONB column with mandatory starred fields:

- `who.user_id` (auto-derived from your API key)
- `what.title`, `what.type`, `what.summary` (you supply title; type auto-derived; summary defaults to title)
- `when.created_at` (auto from now())
- `where.project_id` (auto from active project; optional for user-scoped entities like ideas/todos)
- `why.rationale` (**YOU MUST PROVIDE** on creates — legacy mode auto-stamps "Auto-derived: created via X API endpoint" but explicit rationale is the contract)

When creating any entity, pass `documentation_5wh: { why: { rationale: "...", constraints: [...], relates_to: [...] }, how: { approach: "...", success_criteria: [...] } }` to enrich beyond the auto-derived skeleton.

### Prod alias

Planner lives at **`v0-ai-project-planner-eight.vercel.app`** (NOT faridea.dev — see memory `planner-prod-url-correction`).

## Development Commands

\`\`\`bash
# Install dependencies (using pnpm)
pnpm install

# Development server
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Lint the codebase
pnpm lint
\`\`\`

## Architecture

### Tech Stack
- **Framework**: Next.js 14 with App Router (not Pages Router)
- **Language**: TypeScript with strict mode enabled
- **Styling**: Tailwind CSS v4 with custom configuration
- **UI Components**: Shadcn/UI (New York style variant)
- **State Management**: React hooks (useState, useMemo, useCallback)
- **Visualization**: @xyflow/react for project dependency graphs
- **Charts**: Recharts for data visualization
- **Font**: Geist Sans and Geist Mono
- **Analytics**: Vercel Analytics

### Project Structure

\`\`\`
app/
  layout.tsx          # Root layout with Geist fonts and Analytics
  page.tsx            # Main dashboard page (client component)
  globals.css         # Global styles with Tailwind

components/
  dashboard/          # Dashboard-specific components
    dashboard-header.tsx
    dashboard-sidebar.tsx
    project-overview.tsx
    project-execution-view.tsx    # Complex visualization with Film Roll & Map views
    tech-stack-documentation.tsx
    ai-assistant.tsx
    progress-tracker.tsx
  ui/                 # Shadcn/UI components
  theme-provider.tsx

lib/
  utils.ts           # cn() helper for Tailwind class merging
\`\`\`

### Key Architectural Patterns

**1. Client Components with State Management**
- The main dashboard (app/page.tsx) is a client component ("use client")
- State is managed with useState for sidebar collapse, active tabs, and view modes
- Complex visualizations use useMemo and useCallback for performance optimization

**2. Two-View Visualization System**
The ProjectExecutionView component implements two distinct visualization modes:
- **Film Roll View**: Horizontal/vertical scrollable timeline with individual step cards, kanban integration, and infinite scroll effects
- **Map View**: Interactive dependency graph using ReactFlow with custom nodes, edges, and minimap

**3. Data Structure Pattern**
Mock data is defined as const arrays (see projectSteps in project-execution-view.tsx) with comprehensive status tracking:
- `status`: "completed" | "in-progress" | "pending"
- `canWork`: boolean (dependencies met)
- `shouldWork`: boolean (recommended next action)
- `inProgress`: boolean (currently active)
- `blocked`: boolean (waiting on dependencies)
- `dependencies`: string[] (IDs of prerequisite steps)

**4. Component Composition**
- UI components from Shadcn/UI are composed together (Card, Badge, Progress, etc.)
- Custom nodes for ReactFlow extend base component structure
- Shared utilities (getStatusColor, getStatusIcon) for consistent UI rendering

### Path Aliases

All imports use the `@/` alias configured in tsconfig.json:
\`\`\`typescript
import { Component } from "@/components/ui/component"
import { cn } from "@/lib/utils"
\`\`\`

### Styling Approach

- Utility-first Tailwind CSS with extensive use of custom classes
- Color system uses CSS variables for theme support
- Responsive design with mobile-first breakpoints (sm, md, lg)
- Animations and transitions for interactive elements
- Custom scrollbar styling for Film Roll view

### Build Configuration

The Next.js config (next.config.mjs) currently has development-friendly settings:
- ESLint warnings ignored during builds
- TypeScript errors ignored during builds
- Images unoptimized

**Note**: These settings should be revisited for production deployments.

## Important Implementation Details

### ResizeObserver Error Handling
The ProjectExecutionView component includes a workaround for ResizeObserver errors in the Film Roll view:
\`\`\`typescript
useEffect(() => {
  const handleResizeObserverError = (e: ErrorEvent) => {
    if (e.message === "ResizeObserver loop completed with undelivered notifications.") {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  // ...
}, [])
\`\`\`

### ReactFlow Integration
- Custom node types defined with `nodeTypes` object
- Nodes positioned in grid layout (3 columns)
- Edges styled based on step status (animated for in-progress, red for blocked)
- Includes Controls, MiniMap, and Background components

### State Status System
The project uses a multi-dimensional status tracking system:
- Visual status indicators with color coding
- Smart dependency resolution
- Blocking detection for chained tasks
- Progress percentage tracking
- Time estimation vs actual tracking

## Business Context

This application supports a multi-vertical business strategy:
1. **Phase 1**: Core persistence agent and basic visualization
2. **Phase 2**: Multi-agent orchestration and adaptive planning
3. **Phase 3**: Advanced features (intelligent rollback, Gantt charts)
4. **Phase 4**: Enterprise optimization and API ecosystem

The codebase currently implements Phase 1 foundation work with visual project management and basic execution tracking.

## Component Guidelines

When adding new dashboard components:
1. Follow the existing pattern of client components with "use client" directive
2. Use TypeScript interfaces for props and data structures
3. Implement responsive layouts with Tailwind breakpoints
4. Add loading states and transitions for better UX
5. Use Shadcn/UI components as building blocks
6. Maintain consistent spacing with the `space-y-4` pattern

When modifying visualizations:
1. Consider performance implications (use useMemo/useCallback)
2. Maintain accessibility with proper ARIA labels
3. Ensure both Film Roll and Map views stay in sync
4. Update status color/icon helpers for consistency
5. Test scrolling behavior in both directions

## Database Integration (Planned)

The README indicates plans for:
- Supabase or Neon for persistent project data
- Real-time subscriptions for collaborative features
- Context management for cross-session state preservation

Currently, the application uses mock data with no backend integration.

## Dependencies Notes

- Uses pnpm as package manager (lock file: pnpm-lock.yaml)
- Comprehensive Radix UI component library installed
- React Hook Form with Zod for future form implementations
- Date-fns for date manipulation
- Recharts for data visualization (not yet fully utilized)
- Next-themes for dark mode support (theme provider exists but not connected)
