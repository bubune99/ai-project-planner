# Consolidated Database Architecture

## Overview

The AI Project Planner platform uses a **single consolidated database** that serves both the main application and the idea-incubator submodule. This enables:

- Unified user management across all features
- Cross-module data relationships (ideas can link to projects, todos, etc.)
- Single source of truth for all platform data
- Simplified deployment and maintenance

## Database Location

**Provider:** Neon PostgreSQL
**Database:** `neondb` (main project's database)
**Connection:** Via `DATABASE_URL` environment variable

## Module Tables

### Core Platform (ai-project-planner)

| Module | Tables |
|--------|--------|
| **Users & Auth** | `users`, `user_api_keys` |
| **Projects** | `projects`, `project_steps`, `project_phases`, `project_collaborators`, `project_versions`, `business_context` |
| **Ideas** | `ideas`, `idea_branches`, `idea_facets`, `idea_perspectives`, `idea_scenarios`, `idea_validations`, `idea_refinements`, `idea_documents`, `idea_canvas_nodes`, `idea_canvas_edges` |
| **Todos** | `todos` |
| **Finance** | `finance_accounts`, `finance_transactions`, `finance_budgets`, `finance_categories` |
| **Memory (5W+H)** | `mlp_why_decisions`, `mlp_what_knowledge`, etc. |
| **Calendar** | `calendar_events`, `calendar_event_attendees` |
| **Agents** | `agent_jobs`, `ai_conversations` |

### Idea Incubator Enhancements (Migration 032)

| Table | Purpose |
|-------|---------|
| `idea_transformations` | Track how ideas evolve (evolved_into, branched_as, merged_with, spawned) |
| `idea_relationships` | Network connections between ideas (depends_on, enables, similar_to) |
| `idea_categories` | User-defined taxonomy with hierarchies |
| `idea_notes` | Freeform notes with context (facet, branch, perspective) |
| `idea_canvas_layers` | Depth/detail control for progressive disclosure |
| `idea_canvas_snapshots` | Saved canvas states for undo/versioning |
| `idea_cross_perspective_links` | Connect nodes across perspectives |
| `user_canvas_preferences` | Per-user display and interaction settings |

## Schema Diagram

```
users
  ├── projects
  │     ├── project_steps
  │     ├── project_phases
  │     └── project_collaborators
  │
  ├── ideas
  │     ├── idea_branches
  │     │     └── idea_facets
  │     ├── idea_perspectives
  │     │     └── idea_scenarios
  │     ├── idea_canvas_nodes
  │     │     └── idea_canvas_edges
  │     ├── idea_canvas_layers
  │     ├── idea_canvas_snapshots
  │     ├── idea_validations
  │     ├── idea_refinements
  │     ├── idea_documents
  │     ├── idea_notes
  │     ├── idea_transformations
  │     ├── idea_relationships
  │     └── idea_cross_perspective_links
  │
  ├── idea_categories
  ├── user_canvas_preferences
  │
  ├── todos (cross-domain linking)
  │     └── links to: projects, ideas, transactions
  │
  ├── finance_accounts
  │     └── finance_transactions
  │
  ├── calendar_events
  │
  └── agent_jobs
```

## Configuration

### Main Project (ai-project-planner)

Uses `.env` file with `DATABASE_URL` pointing to Neon PostgreSQL.

### Idea Incubator Submodule

**Option 1: Symlink (Recommended for local dev)**
```bash
cd apps/idea-incubator
ln -sf ../../.env .env
```

**Option 2: Copy relevant variables**
```bash
# Copy DATABASE_URL and Stack Auth keys from root .env
cp ../../.env .env
# Edit to keep only needed variables
```

**Option 3: Environment inheritance**
```bash
# In package.json scripts, load from root
"dev": "source ../../.env && next dev"
```

## Running Migrations

All migrations are stored in `lib/db/migrations/` and should be run against the consolidated database:

```bash
# From project root
source .env
psql "$DATABASE_URL" -f lib/db/migrations/032_ideas_incubator_enhancements.sql
```

## MCP Integration

The MCP server at `/app/mcp/route.ts` exposes tools for all modules:

- **Projects:** `list_projects`, `create_project`, `get_project_context`
- **Ideas:** `list_ideas`, `create_idea`, `get_idea`, `promote_idea`
- **Todos:** `list_todos`, `create_todo`
- **Finance:** `get_finance_summary`, `list_transactions`
- **Search:** `global_search`

## Cross-Module Features

### Ideas → Projects Promotion
When an idea is promoted, it creates a project and maintains the link:
```sql
ideas.promoted_to_project_id → projects.id
```

### Todos Cross-Domain Linking
Todos can link to multiple domains:
```sql
todos.project_id → projects.id
todos.idea_id → ideas.id
todos.transaction_id → finance_transactions.id
```

### Idea Evolution Tracking
Track how ideas transform over time:
```sql
idea_transformations.from_idea_id → ideas.id
idea_transformations.to_idea_id → ideas.id
```

## Verification

Run Truth Seeker validation to verify schema:
```typescript
mcp__truth-seeker__validate_schema_contracts_batch({
  tables: [
    { tableName: "ideas", expectedSchema: { id: "uuid", lifecycle: "text" } },
    { tableName: "idea_transformations", expectedSchema: { id: "uuid" } },
    // ... etc
  ]
})
```
