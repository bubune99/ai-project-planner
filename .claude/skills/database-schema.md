# Database Schema Reference

Complete schema for the AI Project Planner with all 12 tables and relationships.

## Entity Relationship Overview

\`\`\`
projects (1) ──→ (N) project_steps
         (1) ──→ (N) tech_stack_items
         (1) ──→ (1) business_context
         (1) ──→ (N) execution_history
         (1) ──→ (N) documents
         (1) ──→ (N) progress_notes
         (1) ──→ (N) project_versions
         (1) ──→ (N) feature_requests
         (1) ──→ (N) project_phases
         (1) ──→ (N) architecture_decisions

project_steps (N) ──→ (N) step_dependencies (self-referential)
              (N) ──→ (1) project_versions (optional)

feature_requests (N) ──→ (1) project_versions (optional)
                 (N) ──→ (1) project_steps (optional - auto-created)

architecture_decisions (N) ──→ (N) adr_steps ──→ (N) project_steps
\`\`\`

## Core Tables

### 1. projects

**Purpose:** Main project record

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Project name |
| description | TEXT | Project description |
| status | ENUM | 'planning', 'in-progress', 'completed', 'on-hold' |
| priority | ENUM | 'low', 'medium', 'high', 'critical' |
| progress | INTEGER | 0-100 percentage |
| start_date | TIMESTAMP | Project start |
| due_date | TIMESTAMP | Target completion |
| completed_date | TIMESTAMP | Actual completion |
| current_phase | TEXT | Current lifecycle phase (see project_phases) |
| github_repo_url | TEXT | Repository URL |
| metadata | JSONB | Custom project data |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |
| deleted_at | TIMESTAMP | Soft delete (NULL = active) |

**Indexes:**
- `idx_projects_status` on status
- `idx_projects_priority` on priority
- `idx_projects_deleted` on deleted_at

---

### 2. project_steps

**Purpose:** Individual tasks/steps in a project

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| title | TEXT | Step name |
| description | TEXT | Step details |
| status | ENUM | 'pending', 'in-progress', 'completed', 'blocked' |
| progress | INTEGER | 0-100 percentage |
| phase | TEXT | Project phase (ideation, architecture, etc.) |
| stage | TEXT | Work stage (setup, development, testing) |
| estimated_hours | DECIMAL | Time estimate |
| actual_hours | DECIMAL | Time spent |
| can_work | BOOLEAN | Dependencies met? (computed) |
| should_work | BOOLEAN | Recommended next step? (computed) |
| is_in_progress | BOOLEAN | Currently active? (computed) |
| is_blocked | BOOLEAN | Blocked by something? (computed) |
| order_index | INTEGER | Sort order |
| tasks | TEXT[] | Subtask checklist |
| assigned_agent | TEXT | 'v0', 'claude', 'gemini', 'gpt' |
| priority | TEXT | 'low', 'medium', 'high', 'critical' |
| acceptance_criteria | JSONB | Success criteria |
| version_id | UUID | Foreign key to project_versions (optional) |
| metadata | JSONB | Custom step data |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |
| completed_at | TIMESTAMP | Completion time |
| deleted_at | TIMESTAMP | Soft delete |

**Computed Fields:**
- `can_work` = all hard dependencies completed
- `should_work` = recommended based on priority/dependencies
- `is_in_progress` = status = 'in-progress'
- `is_blocked` = has unresolved blockers

**Indexes:**
- `idx_project_steps_project` on project_id
- `idx_project_steps_status` on status
- `idx_project_steps_order` on order_index
- `idx_project_steps_version` on version_id

---

### 3. step_dependencies

**Purpose:** Dependencies between steps

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| step_id | UUID | Step that has the dependency |
| depends_on_step_id | UUID | Step that must complete first |
| dependency_type | ENUM | 'hard' (blocking) or 'soft' (recommended) |
| created_at | TIMESTAMP | Record creation |
| deleted_at | TIMESTAMP | Soft delete |

**Example:** Step B depends on Step A = Step B cannot start until Step A is done

**Indexes:**
- `idx_step_dependencies_step` on step_id
- `idx_step_dependencies_depends_on` on depends_on_step_id

---

### 4. business_context

**Purpose:** Strategic business context for a project

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects (1:1 relationship) |
| vision | TEXT | Product vision statement |
| target_market | TEXT | Target audience |
| primary_use_case | TEXT | Main use case |
| revenue_model | TEXT | Monetization strategy |
| competitive_advantage | TEXT | Unique value proposition |
| success_metrics | JSONB | Array of {metric, target, current} |
| market_analysis | JSONB | Market research data |
| risk_assessment | JSONB | Array of {risk, impact, mitigation} |
| stakeholders | JSONB | Array of {name, role, priority} |
| budget_info | JSONB | {total, allocated, spent} |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |

**JSONB Structures:**

\`\`\`json
success_metrics: [
  {"metric": "Active users", "target": 1000, "current": 0},
  {"metric": "Revenue MRR", "target": "$10k", "current": "$0"}
]

risk_assessment: [
  {"risk": "Competitor X launches first", "impact": "high", "mitigation": "Focus on unique features"}
]

stakeholders: [
  {"name": "John Doe", "role": "CEO", "priority": "high"}
]

budget_info: {
  "total": 50000,
  "allocated": 30000,
  "spent": 10000
}
\`\`\`

---

### 5. tech_stack_items

**Purpose:** Technology choices for a project

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| name | TEXT | Technology name (e.g., "PostgreSQL") |
| category | TEXT | Category (database, frontend, backend, etc.) |
| version | TEXT | Version (e.g., "14.5") |
| rationale | TEXT | Why this was chosen |
| documentation_url | TEXT | Official docs link |
| alternatives_considered | JSONB | Array of {name, reason_not_chosen} |
| order_index | INTEGER | Display order |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |
| deleted_at | TIMESTAMP | Soft delete |

**JSONB Structure:**

\`\`\`json
alternatives_considered: [
  {"name": "MySQL", "reason_not_chosen": "Lacks JSONB support"},
  {"name": "MongoDB", "reason_not_chosen": "Need relational integrity"}
]
\`\`\`

---

### 6. execution_history

**Purpose:** Audit log of all project events

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| step_id | UUID | Foreign key to project_steps (optional) |
| event_type | ENUM | 'step_started', 'step_completed', 'blocker_identified', 'status_changed', 'ai_agent_action', 'project_created', 'project_updated', 'phase_transition', 'feature_request_approved' |
| agent_type | TEXT | 'v0', 'claude', 'gemini', 'gpt' (optional) |
| description | TEXT | Human-readable event description |
| old_value | JSONB | Previous state |
| new_value | JSONB | New state |
| metadata | JSONB | Additional event data |
| created_at | TIMESTAMP | Event timestamp |

**Note:** Append-only table (no updates or deletes)

**Indexes:**
- `idx_execution_history_project` on project_id
- `idx_execution_history_step` on step_id
- `idx_execution_history_created` on created_at DESC

---

### 7. documents

**Purpose:** Track project documents (PRDs, designs, specs)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| title | TEXT | Document title |
| description | TEXT | Document description |
| s3_key | TEXT | S3 object key |
| file_type | TEXT | MIME type |
| file_size | INTEGER | Bytes |
| category | TEXT | 'prd', 'design', 'spec', 'other' |
| uploaded_by | TEXT | Uploader name |
| created_at | TIMESTAMP | Upload time |
| deleted_at | TIMESTAMP | Soft delete |

---

### 8. progress_notes

**Purpose:** AI self-documentation and work log

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| step_id | UUID | Foreign key to project_steps (optional) |
| author_type | ENUM | 'human' or 'agent' |
| author_name | TEXT | Name of person/agent |
| note_type | ENUM | 'progress', 'blocker', 'question', 'decision', 'completion' |
| title | TEXT | Note title (optional) |
| content | TEXT | Markdown content |
| metadata | JSONB | Additional data |
| created_at | TIMESTAMP | Note timestamp |

**Note:** Append-only table

**Use Cases:**
- AI agent documenting decisions: `note_type: 'decision'`
- AI agent reporting blockers: `note_type: 'blocker'`
- AI agent completing work: `note_type: 'completion'`
- AI agent asking questions: `note_type: 'question'`

**Indexes:**
- `idx_progress_notes_project` on project_id, created_at DESC
- `idx_progress_notes_step` on step_id
- `idx_progress_notes_type` on note_type

---

### 9. project_versions

**Purpose:** Track project iterations (MVP → v1.0 → v1.1)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| version_name | TEXT | "MVP", "v1.0", "v1.1" |
| version_number | TEXT | Semantic version (optional) |
| status | ENUM | 'planning', 'in-progress', 'completed', 'released' |
| description | TEXT | Version description |
| goals | JSONB | Array of {goal, completed} |
| release_notes | TEXT | What's new in this version |
| started_at | TIMESTAMP | Version start |
| completed_at | TIMESTAMP | Version completion |
| released_at | TIMESTAMP | Release date |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |

**JSONB Structure:**

\`\`\`json
goals: [
  {"goal": "User authentication", "completed": true},
  {"goal": "Payment integration", "completed": false}
]
\`\`\`

**Auto-completion:** When all steps for a version are completed, version status → 'completed'

**Indexes:**
- `idx_project_versions_project` on project_id
- `idx_project_versions_status` on status

---

### 10. feature_requests

**Purpose:** Bug reports and feature requests for continuous improvement

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| title | TEXT | Request title |
| description | TEXT | Detailed description |
| request_type | ENUM | 'enhancement', 'bug', 'feature', 'tech_debt', 'refactor' |
| priority | ENUM | 'low', 'medium', 'high', 'critical' |
| status | ENUM | 'proposed', 'approved', 'in-progress', 'completed', 'rejected', 'deferred' |
| requested_by | TEXT | Requester name |
| requested_by_type | ENUM | 'human' or 'agent' |
| approved_by | TEXT | Approver name (optional) |
| assigned_to_version_id | UUID | Foreign key to project_versions (optional) |
| created_step_id | UUID | Foreign key to project_steps (auto-created) |
| impact | TEXT | Business impact description |
| effort_estimate | TEXT | "small", "medium", "large" or hours |
| acceptance_criteria | JSONB | Array of {description, testCommand} |
| metadata | JSONB | Screenshots, logs, user feedback |
| created_at | TIMESTAMP | Request time |
| updated_at | TIMESTAMP | Last update |
| approved_at | TIMESTAMP | Approval time |
| completed_at | TIMESTAMP | Completion time |

**Auto-creation:** When approved via `approve_feature_request`, a project_step is auto-created

**Auto-completion:** When the created step is completed, status → 'completed'

**Indexes:**
- `idx_feature_requests_project` on project_id, created_at DESC
- `idx_feature_requests_status` on status
- `idx_feature_requests_type` on request_type
- `idx_feature_requests_priority` on priority

---

### 11. project_phases

**Purpose:** Track project lifecycle phases

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| phase_name | ENUM | 'ideation', 'architecture', 'construction', 'testing', 'deployment', 'maintenance' |
| status | ENUM | 'active', 'completed', 'skipped' |
| description | TEXT | Phase description |
| started_at | TIMESTAMP | Phase start |
| completed_at | TIMESTAMP | Phase completion |
| completed_by | TEXT | Who marked complete |
| exit_criteria | JSONB | Array of {criterion, met} |
| deliverables | JSONB | Array of {deliverable, completed, link} |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |

**JSONB Structures:**

\`\`\`json
exit_criteria: [
  {"criterion": "Architecture document approved", "met": true},
  {"criterion": "Tech stack finalized", "met": true}
]

deliverables: [
  {"deliverable": "System architecture diagram", "completed": true, "link": "doc_id_123"},
  {"deliverable": "API specification", "completed": false}
]
\`\`\`

**Phase Flow:**
ideation → architecture → construction → testing → deployment → maintenance

**Indexes:**
- `idx_project_phases_project` on project_id, started_at DESC
- `idx_project_phases_status` on status

---

### 12. architecture_decisions

**Purpose:** Architecture Decision Records (ADRs)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Foreign key to projects |
| title | TEXT | Decision title |
| status | ENUM | 'proposed', 'accepted', 'rejected', 'superseded', 'deprecated' |
| context | TEXT | Why we're making this decision |
| decision | TEXT | What we decided |
| consequences | TEXT | Implications of this decision |
| alternatives | JSONB | Array of {option, pros, cons, reason_not_chosen} |
| supersedes_adr_id | UUID | Self-reference (replaced ADR) |
| superseded_by_adr_id | UUID | Self-reference (replacement ADR) |
| tags | TEXT[] | ["database", "backend", "security"] |
| decided_by | TEXT | Decision maker |
| decided_at | TIMESTAMP | Decision time |
| created_at | TIMESTAMP | Record creation |
| updated_at | TIMESTAMP | Last update |

**JSONB Structure:**

\`\`\`json
alternatives: [
  {
    "option": "PostgreSQL",
    "pros": ["JSONB support", "Strong ACID compliance"],
    "cons": ["More complex setup"],
    "reason_not_chosen": null
  },
  {
    "option": "MySQL",
    "pros": ["Simple setup", "Wide hosting support"],
    "cons": ["No JSONB"],
    "reason_not_chosen": "Lacks JSONB support for metadata"
  }
]
\`\`\`

**Superseding:** When an architectural decision changes (pivot), use `supersede_adr` to link old → new

**Indexes:**
- `idx_architecture_decisions_project` on project_id, created_at DESC
- `idx_architecture_decisions_status` on status
- `idx_architecture_decisions_tags` GIN index on tags

---

### 13. adr_steps (Junction Table)

**Purpose:** Link ADRs to steps that implement them

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| adr_id | UUID | Foreign key to architecture_decisions |
| step_id | UUID | Foreign key to project_steps |
| relationship_type | ENUM | 'implements', 'affected_by', 'blocked_by' |
| created_at | TIMESTAMP | Record creation |

**Unique constraint:** (adr_id, step_id)

---

## Database Functions

### Workflow Functions

\`\`\`sql
-- Get next recommended step
get_next_step(project_id UUID) → project_step

-- Mark step in progress
mark_step_in_progress(step_id UUID, agent_name TEXT) → project_step

-- Mark step complete
mark_step_complete(step_id UUID, completed_by TEXT, actual_hours DECIMAL, notes TEXT) → project_step

-- Report blocker
report_blocker(step_id UUID, description TEXT, reported_by TEXT, severity TEXT) → execution_history
\`\`\`

### Phase Functions

\`\`\`sql
-- Get current active phase
get_current_phase(project_id UUID) → project_phase

-- Transition to next phase
transition_to_phase(project_id UUID, new_phase TEXT, completed_by TEXT, description TEXT)
  → {success, message, new_phase_id}
\`\`\`

### Version Functions

\`\`\`sql
-- Auto-complete version when all steps done
auto_complete_version() TRIGGER
\`\`\`

### Feature Request Functions

\`\`\`sql
-- Approve request and create step
approve_and_create_step(feature_request_id UUID, approved_by TEXT, version_id UUID, assigned_agent TEXT)
  → {feature_request_id, step_id, success, message}

-- Get prioritized backlog
get_feature_backlog(project_id UUID, status TEXT, request_type TEXT) → feature_requests[]

-- Auto-complete request when step done
auto_complete_feature_request() TRIGGER
\`\`\`

### ADR Functions

\`\`\`sql
-- Get all ADRs with supersede relationships
get_project_adrs(project_id UUID, status TEXT) → architecture_decisions[]

-- Mark ADR as superseded
supersede_adr(old_adr_id UUID, new_adr_id UUID) → BOOLEAN
\`\`\`

### Progress Notes Functions

\`\`\`sql
-- Get recent progress notes
get_recent_progress(project_id UUID, limit INTEGER) → progress_notes[]
\`\`\`

---

## Views

### project_overview
Optimized view for dashboard UI

\`\`\`sql
SELECT
  id, name, description, status, progress, priority,
  due_date, start_date, github_repo_url,
  total_tasks, completed_tasks, current_phase,
  tech_stack (aggregated), last_activity
FROM projects + aggregations
\`\`\`

### project_execution
Steps with dependency information

\`\`\`sql
SELECT
  id, project_id, title, description, status, progress,
  phase, stage, estimated_hours, actual_hours,
  can_work, should_work, is_in_progress, is_blocked,
  tasks, order_index, dependencies (array)
FROM project_steps + dependencies
\`\`\`

### tech_stack_documentation
Tech stack with rationale

\`\`\`sql
SELECT
  id, project_id, name, category, version,
  rationale, documentation_url, alternatives_considered,
  order_index
FROM tech_stack_items
\`\`\`

### project_phase_overview
Current phase with ADR counts

\`\`\`sql
SELECT
  project_id, project_name, current_phase, phase_name,
  phase_status, started_at, completed_at, days_in_phase,
  active_adrs (count), superseded_adrs (count)
FROM projects + project_phases + architecture_decisions
\`\`\`

---

## Data Integrity Rules

1. **Soft Deletes:** All main tables use `deleted_at` for soft deletes
2. **Cascade Deletes:** When project deleted, all related records deleted
3. **Immutable Tables:** `execution_history` and `progress_notes` are append-only
4. **Auto-computation:** `can_work`, `should_work`, `is_blocked` computed via triggers
5. **Auto-completion:** Versions and feature requests auto-complete when steps finish
6. **Phase Constraints:** Only one active phase per project at a time
7. **Dependency Validation:** No circular dependencies allowed

---

## Migration Strategy

Migrations are sequential SQL files in `lib/db/migrations/`:

- 001-011: Core schema
- 012: Progress notes
- 013: Project versions
- 014: Feature requests
- 015: Project phases and ADRs

Run migrations in order via Neon dashboard or migration tool.
