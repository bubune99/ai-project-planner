# MCP Server Capabilities

This document provides a complete reference of all MCP tools available for the AI Project Planner.

## Overview

The MCP server exposes **34 tools** organized into 10 categories:

1. **Workflow Tools** (5) - Core execution flow
2. **Project Management** (3) - CRUD for projects
3. **Step Management** (4) - Task creation and management
4. **Business Context** (2) - Strategic context management
5. **Tech Stack** (3) - Technology decisions tracking
6. **Dependencies** (2) - Task dependency management
7. **Documents** (4) - Document management
8. **Agent Assignment** (2) - AI agent task assignment
9. **Progress Notes** (2) - Work log and documentation
10. **Project Versions** (3) - Iteration management
11. **Feature Requests** (3) - Bug/enhancement tracking
12. **Project Phases** (2) - Lifecycle phase tracking
13. **Architecture Decisions** (4) - ADR management

## MCP Resources

The server provides 4 read-only resources:

- `project://{id}/context` - Complete project context
- `project://{id}/next-steps` - Recommended next actions
- `project://{id}/execution-plan` - Current execution roadmap
- `project://{id}/tech-stack` - Technology stack documentation

## Tool Reference

### 1. Workflow Tools (Core Execution)

#### `get_next_step`
**Purpose:** Get the next recommended step to work on
**Input:** `projectId` (UUID)
**Returns:** Next step with `should_work: true` and `can_work: true`
**Use When:** Starting work on a project or looking for what to do next

#### `mark_step_in_progress`
**Purpose:** Mark a step as currently being worked on
**Input:** `stepId` (UUID), `agentName` (string)
**Returns:** Updated step with `status: 'in-progress'`
**Use When:** You start working on a step (ALWAYS do this first!)

#### `mark_step_complete`
**Purpose:** Mark a step as completed
**Input:** `stepId` (UUID), `completedBy` (string), `actualHours` (number), `completionNotes` (string)
**Returns:** Updated step with `status: 'completed'`
**Use When:** You finish a step successfully

#### `report_blocker`
**Purpose:** Report a blocker preventing step completion
**Input:** `stepId` (UUID), `blockerDescription` (string), `reportedBy` (string), `severity` (enum)
**Returns:** Blocker record and updated step
**Use When:** You encounter an issue that prevents completion

#### `update_step_progress`
**Purpose:** Update progress percentage on a step
**Input:** `stepId` (UUID), `progress` (number 0-100), `notes` (string)
**Returns:** Updated step
**Use When:** Providing incremental progress updates

---

### 2. Project Management

#### `create_project`
**Purpose:** Create a new project
**Input:** `name`, `description`, `priority`, `startDate`, `dueDate`, `githubRepoUrl`, `metadata`
**Returns:** New project with auto-generated UUID
**Use When:** Initializing a new project

#### `update_project`
**Purpose:** Update project details
**Input:** `projectId` (UUID), any project fields to update
**Returns:** Updated project
**Use When:** Changing project metadata, status, dates, etc.

#### `delete_project`
**Purpose:** Soft delete a project
**Input:** `projectId` (UUID)
**Returns:** Success confirmation
**Use When:** Archiving a project (sets `deleted_at`)

---

### 3. Step Management

#### `create_step`
**Purpose:** Create a new project step/task
**Input:** `projectId`, `title`, `description`, `phase`, `stage`, `estimatedHours`, `assignedAgent`, `priority`
**Returns:** New step with auto-calculated order_index
**Use When:** Breaking down work or adding new tasks

#### `update_step`
**Purpose:** Update step details
**Input:** `stepId`, any step fields to update
**Returns:** Updated step
**Use When:** Modifying task details, status, etc.

#### `delete_step`
**Purpose:** Soft delete a step
**Input:** `stepId`
**Returns:** Success confirmation
**Use When:** Removing a step from the plan

#### `reorder_steps`
**Purpose:** Change the order of steps
**Input:** `stepId`, `newOrderIndex`
**Returns:** Updated step ordering
**Use When:** Adjusting task priority/sequence

---

### 4. Business Context

#### `create_business_context`
**Purpose:** Add strategic business context to a project
**Input:** `projectId`, `vision`, `targetMarket`, `primaryUseCase`, `revenueModel`, `competitiveAdvantage`, `successMetrics`, `marketAnalysis`, `riskAssessment`, `stakeholders`, `budgetInfo`
**Returns:** New business context record
**Use When:** Setting up strategic context for a new project

#### `update_business_context`
**Purpose:** Update business context
**Input:** `projectId`, any business context fields
**Returns:** Updated business context
**Use When:** Refining strategy, updating metrics, etc.

---

### 5. Tech Stack Management

#### `add_tech_stack_item`
**Purpose:** Add a technology to the stack
**Input:** `projectId`, `name`, `category`, `version`, `rationale`, `documentationUrl`, `alternativesConsidered`
**Returns:** New tech stack item
**Use When:** Documenting technology choices

#### `update_tech_stack_item`
**Purpose:** Update tech stack item (e.g., version upgrade)
**Input:** `techStackItemId`, any tech stack fields
**Returns:** Updated tech stack item
**Use When:** Upgrading versions, updating rationale

#### `remove_tech_stack_item`
**Purpose:** Remove a technology from the stack
**Input:** `techStackItemId`
**Returns:** Success confirmation
**Use When:** Deprecating a technology

---

### 6. Dependencies

#### `create_dependency`
**Purpose:** Create a dependency between steps
**Input:** `stepId`, `dependsOnStepId`, `dependencyType` (hard/soft)
**Returns:** New dependency
**Use When:** Step A must wait for Step B to complete

#### `remove_dependency`
**Purpose:** Remove a dependency
**Input:** `dependencyId`
**Returns:** Success confirmation
**Use When:** Dependency is no longer needed

---

### 7. Documents

#### `create_document`
**Purpose:** Create a document record
**Input:** `projectId`, `title`, `description`, `s3Key`, `fileType`, `fileSize`, `category`, `uploadedBy`
**Returns:** New document record
**Use When:** Uploading/tracking project documents

#### `update_document`
**Purpose:** Update document metadata
**Input:** `documentId`, any document fields
**Returns:** Updated document
**Use When:** Updating document details

#### `delete_document`
**Purpose:** Delete a document
**Input:** `documentId`
**Returns:** Success confirmation
**Use When:** Removing obsolete documents

#### `link_document_to_task` / `unlink_document_from_task`
**Purpose:** Associate documents with specific steps
**Input:** `documentId`, `stepId`
**Returns:** Success confirmation
**Use When:** Linking specs, designs, etc. to tasks

---

### 8. Agent Assignment

#### `assign_agent_to_task`
**Purpose:** Assign a specific AI agent to a step
**Input:** `stepId`, `agentType` (v0/claude/gemini/gpt), `assignedBy`
**Returns:** Updated step
**Use When:** Routing tasks to specialized agents

#### `unassign_agent_from_task`
**Purpose:** Remove agent assignment
**Input:** `stepId`
**Returns:** Updated step
**Use When:** Making a task available to any agent

---

### 9. Progress Notes (AI Self-Documentation)

#### `add_progress_note`
**Purpose:** Document work progress, decisions, or blockers
**Input:** `projectId`, `stepId` (optional), `authorName`, `authorType` (human/agent), `noteType` (progress/blocker/question/decision/completion), `title`, `content` (markdown), `metadata`
**Returns:** New progress note
**Use When:** Documenting what you did, why you made decisions, or questions
**Best Practice:** Add notes at key decision points and after completing work

#### `get_progress_notes`
**Purpose:** Retrieve recent progress notes
**Input:** `projectId`, `limit` (default 50)
**Returns:** Chronological list of progress notes
**Use When:** Reviewing what happened in a project

---

### 10. Project Versions (Iteration Support)

#### `create_version`
**Purpose:** Create a new project version (e.g., MVP, v1.0, v1.1)
**Input:** `projectId`, `versionName`, `versionNumber`, `description`, `goals`
**Returns:** New version
**Use When:** Planning iterations beyond MVP

#### `update_version`
**Purpose:** Update version details or status
**Input:** `versionId`, any version fields
**Returns:** Updated version
**Use When:** Updating version status, goals, release notes

#### `get_versions`
**Purpose:** Get all versions for a project
**Input:** `projectId`
**Returns:** List of versions
**Use When:** Reviewing iteration history

---

### 11. Feature Requests (Continuous Improvement)

#### `create_feature_request`
**Purpose:** Create a bug report or feature request
**Input:** `projectId`, `title`, `description`, `requestType` (enhancement/bug/feature/tech_debt/refactor), `priority`, `requestedBy`, `requestedByType` (human/agent), `impact`, `effortEstimate`, `metadata`
**Returns:** New feature request
**Use When:** Logging bugs, improvements, or technical debt

#### `approve_feature_request`
**Purpose:** Approve a request and auto-create a step
**Input:** `featureRequestId`, `approvedBy`, `versionId` (optional), `assignedAgent` (optional)
**Returns:** Feature request + auto-created step
**Use When:** Approving requests for implementation
**Note:** This automatically creates a project step!

#### `get_feature_backlog`
**Purpose:** Get prioritized backlog
**Input:** `projectId`, `status` (optional), `requestType` (optional)
**Returns:** Prioritized list of feature requests
**Use When:** Reviewing pending improvements

---

### 12. Project Phases (Lifecycle Tracking)

#### `get_current_phase`
**Purpose:** Get the active project phase
**Input:** `projectId`
**Returns:** Current phase with exit criteria and deliverables
**Use When:** Checking what phase you're in
**Phases:** ideation → architecture → construction → testing → deployment → maintenance

#### `transition_to_phase`
**Purpose:** Complete current phase and start next phase
**Input:** `projectId`, `newPhase`, `completedBy`, `description` (optional)
**Returns:** Success + new phase ID
**Use When:** Moving from architecture → construction, etc.
**Note:** This automatically completes the old phase and creates the new one

---

### 13. Architecture Decisions (ADRs)

#### `create_adr`
**Purpose:** Create an Architecture Decision Record
**Input:** `projectId`, `title`, `context` (why deciding), `decision` (what decided), `consequences` (implications), `alternatives` (options considered), `tags`, `decidedBy`
**Returns:** New ADR
**Use When:** Documenting architectural choices
**Best Practice:** Always include context and alternatives

#### `update_adr`
**Purpose:** Update ADR status
**Input:** `adrId`, `status` (proposed/accepted/rejected/superseded/deprecated), `decidedBy`
**Returns:** Updated ADR
**Use When:** Accepting proposals or marking as superseded

#### `get_project_adrs`
**Purpose:** Get all ADRs for a project
**Input:** `projectId`, `status` (optional filter)
**Returns:** List of ADRs with supersede relationships
**Use When:** Reviewing architectural decisions

#### `supersede_adr`
**Purpose:** Mark an old ADR as replaced by a new one (architecture pivot)
**Input:** `oldAdrId`, `newAdrId`
**Returns:** Success confirmation
**Use When:** You made a new decision that replaces an old one
**Note:** This updates both ADRs to show the relationship

---

## Common Workflows

### Starting Work on a Project
1. `get_next_step` - Find what to work on
2. `mark_step_in_progress` - Mark step as active
3. Do the work
4. `add_progress_note` - Document what you did
5. `mark_step_complete` - Mark step as done

### Handling Architecture Changes
1. `create_adr` - Document the proposed change
2. `update_adr` - Accept the decision
3. If replacing old decision: `supersede_adr`
4. Update affected steps as needed

### Post-MVP Iteration
1. `create_version` - Create v1.1
2. `create_feature_request` - Log improvements
3. `approve_feature_request` - Auto-creates step
4. Follow normal workflow to implement

### Phase Transitions
1. Complete all exit criteria for current phase
2. `transition_to_phase` - Move to next phase
3. Update project steps as needed for new phase

---

## Best Practices

1. **Always mark steps in progress** - Use `mark_step_in_progress` when starting
2. **Document decisions** - Use `add_progress_note` at key decision points
3. **Track architecture** - Use `create_adr` for significant technical decisions
4. **Log improvements** - Use `create_feature_request` for bugs and enhancements
5. **Update progress** - Use `update_step_progress` for long-running tasks
6. **Phase awareness** - Check `get_current_phase` to understand project lifecycle
7. **Self-document** - AI agents should write progress notes explaining their work
