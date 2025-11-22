# Project Lifecycle Guide

Complete workflow from ideation to deployment and beyond.

## Lifecycle Phases

The AI Project Planner follows a 6-phase software development lifecycle:

\`\`\`
1. Ideation       → Initial concept and planning
2. Architecture   → Technical design and decisions
3. Construction   → Active development
4. Testing        → Quality assurance
5. Deployment     → Production release
6. Maintenance    → Ongoing support and iteration
\`\`\`

Each phase has:
- **Entry criteria** - What must be true to enter this phase
- **Exit criteria** - What must be done to complete this phase
- **Deliverables** - Key outputs from this phase
- **Recommended steps** - Typical tasks in this phase

---

## Phase 1: Ideation

**Purpose:** Define what you're building and why

**Entry Criteria:**
- None (starting point)

**Exit Criteria:**
- [ ] Vision and goals clearly defined
- [ ] Target market identified
- [ ] Primary use case documented
- [ ] Success metrics established
- [ ] Competitive landscape analyzed

**Deliverables:**
1. Business Context document
2. Market analysis
3. Stakeholder map
4. Success metrics dashboard

**Typical Steps:**
1. Create business context (`create_business_context`)
2. Document vision and target market
3. Define success metrics
4. Conduct competitive analysis
5. Identify key stakeholders
6. Establish budget parameters

**MCP Workflow:**
\`\`\`typescript
// 1. Create the project
create_project({
  name: "SaaS Project Management Platform",
  description: "AI-assisted project planning for developers",
  priority: "high",
  status: "planning"
})

// 2. Initialize ideation phase
transition_to_phase({
  projectId: project.id,
  newPhase: "ideation",
  completedBy: "system",
  description: "Starting project ideation"
})

// 3. Add business context
create_business_context({
  projectId: project.id,
  vision: "Enable developers to focus on architecture while AI handles execution",
  targetMarket: "Solo developers and small dev teams",
  primaryUseCase: "Autonomous AI development workflow",
  revenueModel: "Freemium SaaS",
  competitiveAdvantage: "First platform with true AI autonomous development",
  successMetrics: [
    { metric: "Active projects", target: 1000, current: 0 },
    { metric: "AI completion rate", target: "80%", current: "0%" }
  ]
})

// 4. Create ideation steps
create_step({
  projectId: project.id,
  title: "Define product vision",
  phase: "ideation",
  stage: "discovery",
  description: "Write comprehensive vision statement"
})

// 5. Document progress
add_progress_note({
  projectId: project.id,
  authorName: "Claude",
  authorType: "agent",
  noteType: "decision",
  title: "Vision defined",
  content: "Vision focuses on AI autonomy for development..."
})
\`\`\`

**Transition to Architecture:**
When all ideation exit criteria are met:
\`\`\`typescript
transition_to_phase({
  projectId: project.id,
  newPhase: "architecture",
  completedBy: "Human Architect",
  description: "Vision and market validated, moving to technical design"
})
\`\`\`

---

## Phase 2: Architecture

**Purpose:** Design the technical solution

**Entry Criteria:**
- [ ] Ideation phase completed
- [ ] Business requirements clear
- [ ] Success metrics defined

**Exit Criteria:**
- [ ] System architecture designed
- [ ] Tech stack selected and documented
- [ ] Database schema designed
- [ ] API contracts defined
- [ ] Key architecture decisions recorded (ADRs)
- [ ] Security and scalability considered

**Deliverables:**
1. System architecture diagram
2. Tech stack documentation with rationale
3. Database ERD
4. API specification
5. Architecture Decision Records (ADRs)
6. Security design document

**Typical Steps:**
1. Design system architecture
2. Select tech stack
3. Design database schema
4. Define API contracts
5. Plan infrastructure
6. Document architecture decisions
7. Review and approve architecture

**MCP Workflow:**
\`\`\`typescript
// 1. Add tech stack items
add_tech_stack_item({
  projectId: project.id,
  name: "PostgreSQL",
  category: "database",
  version: "14.5",
  rationale: "Need JSONB for flexible metadata + ACID compliance",
  documentationUrl: "https://postgresql.org/docs",
  alternativesConsidered: [
    {
      name: "MongoDB",
      reason_not_chosen: "Need relational integrity for dependencies"
    },
    {
      name: "MySQL",
      reason_not_chosen: "Lacks JSONB support"
    }
  ]
})

add_tech_stack_item({
  projectId: project.id,
  name: "Next.js",
  category: "frontend",
  version: "14",
  rationale: "SSR for SEO, React Server Components, built-in API routes"
})

// 2. Create Architecture Decision Records
create_adr({
  projectId: project.id,
  title: "Use Model Context Protocol for AI integration",
  context: "Need standardized way for AI agents to interact with project data",
  decision: "Implement MCP server exposing resources and tools",
  consequences: "Enables any MCP-compatible AI to work with our platform. Requires maintaining MCP server.",
  alternatives: [
    {
      option: "Custom REST API",
      pros: ["Full control", "Simpler initially"],
      cons: ["Not standardized", "Each AI needs custom integration"],
      reasonNotChosen: "MCP provides standardization and better AI ecosystem integration"
    }
  ],
  tags: ["integration", "ai", "architecture"],
  decidedBy: "Lead Architect"
})

create_adr({
  projectId: project.id,
  title: "PostgreSQL triggers for computed fields",
  context: "Need real-time computation of can_work, should_work flags on steps",
  decision: "Use PostgreSQL triggers to auto-compute step workflow flags",
  consequences: "Database handles complexity. Simpler application code. Must understand triggers.",
  tags: ["database", "performance"],
  decidedBy: "Database Architect"
})

// 3. Create architecture phase steps
create_step({
  projectId: project.id,
  title: "Design database schema",
  phase: "architecture",
  stage: "design",
  description: "Create comprehensive ERD with all tables and relationships",
  estimatedHours: 8,
  assignedAgent: "claude"
})

create_step({
  projectId: project.id,
  title: "Define MCP tools and resources",
  phase: "architecture",
  stage: "design",
  description: "Spec out all MCP tools AI agents will use",
  estimatedHours: 4,
  assignedAgent: "claude"
})

// 4. Document architectural decisions
add_progress_note({
  projectId: project.id,
  authorName: "Claude",
  authorType: "agent",
  noteType: "decision",
  title: "MCP integration architecture finalized",
  content: `
## Decision: Model Context Protocol Integration

### Context
We need AI agents to autonomously interact with project data. Options:
1. Custom REST API
2. GraphQL API
3. Model Context Protocol (MCP)

### Decision
Implementing MCP server with:
- 34 tools for CRUD operations
- 4 resources for read-only context
- Full TypeScript type safety

### Rationale
- MCP is emerging standard for AI-app integration
- Works with Claude Desktop, CLI, and custom agents
- Resources provide efficient context access
- Tools enable write operations

### Consequences
+ Standardized integration
+ Ecosystem compatibility
+ Future-proof for new AI tools
- Learning curve for MCP protocol
- Must maintain MCP server alongside REST API
  `
})
\`\`\`

**Architecture Pivots:**
When a key decision changes:
\`\`\`typescript
// 1. Create new ADR
const newAdr = create_adr({
  projectId: project.id,
  title: "Switch from REST to tRPC for type safety",
  context: "Discovered type safety issues in REST API during development",
  decision: "Migrate to tRPC for end-to-end type safety",
  consequences: "Better DX, fewer runtime errors. Migration effort required.",
  decidedBy: "Engineering Team"
})

// 2. Supersede old ADR
supersede_adr({
  oldAdrId: "uuid-of-rest-api-decision",
  newAdrId: newAdr.id
})

// 3. Create migration steps
create_step({
  projectId: project.id,
  title: "Migrate REST API to tRPC",
  phase: "architecture",
  stage: "refactor",
  description: "Convert all API routes to tRPC procedures",
  estimatedHours: 16
})
\`\`\`

**Transition to Construction:**
\`\`\`typescript
transition_to_phase({
  projectId: project.id,
  newPhase: "construction",
  completedBy: "Architect Name",
  description: "Architecture approved and documented, ready for development"
})
\`\`\`

---

## Phase 3: Construction

**Purpose:** Build the product

**Entry Criteria:**
- [ ] Architecture phase completed
- [ ] Tech stack finalized
- [ ] Database schema designed
- [ ] Architecture decisions documented

**Exit Criteria:**
- [ ] All features implemented
- [ ] Code follows architecture decisions
- [ ] Documentation complete
- [ ] No critical bugs
- [ ] Ready for testing

**Deliverables:**
1. Working codebase
2. Database migrations
3. API implementation
4. UI components
5. Documentation

**Typical Steps:**

**Phase Setup:**
1. Set up repository and development environment
2. Run database migrations
3. Configure CI/CD pipeline
4. Set up monitoring and logging

**Backend Development:**
5. Implement database models
6. Create API endpoints
7. Add authentication/authorization
8. Implement business logic
9. Set up MCP server

**Frontend Development:**
10. Build UI components
11. Implement pages and routing
12. Connect to backend APIs
13. Add state management
14. Implement real-time features

**Integration:**
15. Integrate frontend + backend
16. Add error handling
17. Implement logging
18. Performance optimization

**MCP Workflow (AI Agent Perspective):**

\`\`\`typescript
// AI agent workflow for autonomous development

// 1. Get next recommended step
const { nextStep } = get_next_step({ projectId })

// 2. Mark step as in progress
mark_step_in_progress({
  stepId: nextStep.id,
  agentName: "Claude"
})

// 3. Add progress note (starting work)
add_progress_note({
  projectId,
  stepId: nextStep.id,
  authorName: "Claude",
  authorType: "agent",
  noteType: "progress",
  title: "Starting implementation",
  content: `
## Starting: ${nextStep.title}

### Plan
1. Review acceptance criteria
2. Implement core functionality
3. Add error handling
4. Write tests
5. Update documentation

### Estimated time: ${nextStep.estimatedHours} hours
  `
})

// 4. Do the work...
// AI agent implements the feature

// 5. Document decisions made during implementation
add_progress_note({
  projectId,
  stepId: nextStep.id,
  authorName: "Claude",
  authorType: "agent",
  noteType: "decision",
  title: "Implementation approach for step dependency calculation",
  content: `
## Decision: Recursive dependency checking

Used PostgreSQL recursive CTE to calculate can_work flag:
- Checks all dependencies transitively
- Handles circular dependency detection
- Updates in real-time via triggers

Alternative considered: Application-level calculation
Rejected because: Database triggers are more reliable and performant
  `
})

// 6. Report blockers if encountered
if (blocked) {
  report_blocker({
    stepId: nextStep.id,
    blockerDescription: "Missing DATABASE_URL environment variable",
    reportedBy: "Claude",
    severity: "high"
  })

  add_progress_note({
    projectId,
    stepId: nextStep.id,
    authorName: "Claude",
    authorType: "agent",
    noteType: "blocker",
    title: "Blocker: Missing environment variable",
    content: `
## Blocker Identified

Cannot connect to database - DATABASE_URL not configured.

### Resolution needed:
1. Add DATABASE_URL to .env.local
2. Verify Neon database is accessible

### Temporary workaround:
Using mock data for development until database is configured.
    `
  })
}

// 7. Update progress incrementally
update_step_progress({
  stepId: nextStep.id,
  progress: 50,
  notes: "Core functionality implemented, adding error handling"
})

// 8. Mark step complete
mark_step_complete({
  stepId: nextStep.id,
  completedBy: "Claude",
  actualHours: 3.5,
  completionNotes: "Implemented with full type safety and error handling"
})

// 9. Add completion note
add_progress_note({
  projectId,
  stepId: nextStep.id,
  authorName: "Claude",
  authorType: "agent",
  noteType: "completion",
  title: "Step completed successfully",
  content: `
## Completion Summary

Implemented ${nextStep.title} with the following outcomes:

### What was done:
- ✅ Created database migration for dependencies table
- ✅ Implemented recursive dependency checking
- ✅ Added PostgreSQL triggers for auto-computation
- ✅ Created TypeScript types
- ✅ Added MCP tools: create_dependency, remove_dependency
- ✅ Updated documentation

### Testing:
- ✅ Manual testing with sample dependencies
- ✅ Verified circular dependency detection
- ✅ Tested cascade behavior

### Actual time: 3.5 hours (estimated: 4 hours)

### Next recommended: Testing and validation
  `
})

// 10. Loop back to step 1 for next task
\`\`\`

**Human-AI Collaboration:**
\`\`\`typescript
// Human adds a feature request during construction
create_feature_request({
  projectId,
  title: "Add dark mode support",
  description: "Users want dark mode for better UX at night",
  requestType: "enhancement",
  priority: "medium",
  requestedBy: "User Research Team",
  requestedByType: "human",
  impact: "Improved user satisfaction and accessibility",
  effortEstimate: "medium"
})

// Human approves the request
approve_feature_request({
  featureRequestId: request.id,
  approvedBy: "Product Manager",
  versionId: null, // Add to current version
  assignedAgent: "claude"
})

// This auto-creates a step that AI can pick up
// AI agent discovers it via get_next_step
\`\`\`

**Transition to Testing:**
\`\`\`typescript
transition_to_phase({
  projectId,
  newPhase: "testing",
  completedBy: "Development Lead",
  description: "Core features complete, ready for QA"
})
\`\`\`

---

## Phase 4: Testing

**Purpose:** Ensure quality and reliability

**Entry Criteria:**
- [ ] Construction phase completed
- [ ] All features implemented
- [ ] Documentation updated

**Exit Criteria:**
- [ ] All critical bugs fixed
- [ ] Test coverage meets requirements
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] User acceptance testing passed

**Deliverables:**
1. Test suite (unit, integration, e2e)
2. Bug reports and fixes
3. Performance benchmarks
4. Security audit report
5. UAT results

**Typical Steps:**
1. Write unit tests
2. Write integration tests
3. Write e2e tests
4. Run security audit
5. Performance testing
6. User acceptance testing
7. Fix bugs
8. Regression testing

**MCP Workflow:**
\`\`\`typescript
// AI agent finds bugs during testing
create_feature_request({
  projectId,
  title: "BUG: Step dependencies not updating after deletion",
  description: "When a step is deleted, dependent steps still show blocked status",
  requestType: "bug",
  priority: "high",
  requestedBy: "Claude Testing Agent",
  requestedByType: "agent",
  impact: "Users cannot work on steps that should be unblocked",
  effortEstimate: "small",
  metadata: {
    reproducedOn: "2024-01-15",
    affectedUsers: "all",
    stackTrace: "..."
  }
})

// Bug is approved and auto-creates step
approve_feature_request({
  featureRequestId: bug.id,
  approvedBy: "QA Lead",
  assignedAgent: "claude"
})

// AI agent fixes the bug
// ... implementation ...

// AI documents the fix
add_progress_note({
  projectId,
  stepId: bugFixStep.id,
  authorName: "Claude",
  authorType: "agent",
  noteType: "completion",
  title: "Bug fix: Dependency cleanup",
  content: `
## Bug Fix Summary

### Root Cause
ON DELETE CASCADE was not configured for step_dependencies table

### Fix Applied
Added CASCADE to foreign key:
\`\`\`sql
ALTER TABLE step_dependencies
  DROP CONSTRAINT fk_step,
  ADD CONSTRAINT fk_step
    FOREIGN KEY (step_id)
    REFERENCES project_steps(id)
    ON DELETE CASCADE;
\`\`\`

### Testing
- ✅ Deleted step with dependencies
- ✅ Verified dependent steps updated
- ✅ Regression tests pass
  `
})
\`\`\`

**Transition to Deployment:**
\`\`\`typescript
transition_to_phase({
  projectId,
  newPhase: "deployment",
  completedBy: "QA Lead",
  description: "All tests passed, ready for production"
})
\`\`\`

---

## Phase 5: Deployment

**Purpose:** Release to production

**Entry Criteria:**
- [ ] Testing phase completed
- [ ] All critical bugs fixed
- [ ] Performance requirements met
- [ ] Security audit passed

**Exit Criteria:**
- [ ] Production environment configured
- [ ] Database migrations run
- [ ] Application deployed
- [ ] Monitoring configured
- [ ] Smoke tests passed
- [ ] Rollback plan tested

**Deliverables:**
1. Production deployment
2. Monitoring dashboards
3. Deployment documentation
4. Rollback procedures
5. Release notes

**Typical Steps:**
1. Configure production environment
2. Set up monitoring and alerts
3. Run database migrations
4. Deploy application
5. Run smoke tests
6. Monitor for issues
7. Write release notes

**Transition to Maintenance:**
\`\`\`typescript
transition_to_phase({
  projectId,
  newPhase: "maintenance",
  completedBy: "DevOps Lead",
  description: "Deployed to production, entering maintenance mode"
})
\`\`\`

---

## Phase 6: Maintenance

**Purpose:** Ongoing support and iteration

**Entry Criteria:**
- [ ] Deployment phase completed
- [ ] Application live in production

**Exit Criteria:**
- None (ongoing)

**Deliverables:**
1. Bug fixes
2. Performance improvements
3. New features
4. Security updates
5. Version releases

**Version Management:**
\`\`\`typescript
// Create v1.1 for next iteration
create_version({
  projectId,
  versionName: "v1.1",
  versionNumber: "1.1.0",
  description: "First feature update",
  goals: [
    { goal: "Dark mode support", completed: false },
    { goal: "Export to CSV", completed: false },
    { goal: "Collaborative editing", completed: false }
  ]
})

// Feature requests are assigned to v1.1
approve_feature_request({
  featureRequestId: darkModeRequest.id,
  approvedBy: "Product Manager",
  versionId: v11.id,
  assignedAgent: "claude"
})

// Steps for v1.1 are tagged
create_step({
  projectId,
  title: "Implement dark mode",
  phase: "construction",
  versionId: v11.id,
  assignedAgent: "claude"
})

// When all v1.1 steps are complete, version auto-completes
// Then release it
update_version({
  versionId: v11.id,
  status: "released",
  releaseNotes: "Added dark mode, CSV export, and collaborative editing"
})
\`\`\`

---

## Cross-Phase Best Practices

### 1. Continuous Documentation
\`\`\`typescript
// AI agents should document continuously
add_progress_note({
  projectId,
  authorName: "Claude",
  authorType: "agent",
  noteType: "decision",
  title: "...",
  content: "..."
})
\`\`\`

### 2. Architecture Decision Tracking
\`\`\`typescript
// Record all significant decisions
create_adr({
  projectId,
  title: "...",
  context: "...",
  decision: "...",
  consequences: "...",
  alternatives: [...],
  tags: [...]
})
\`\`\`

### 3. Feature Request Workflow
\`\`\`typescript
// Log all improvements
create_feature_request({ ... })

// Approve and auto-create steps
approve_feature_request({ ... })

// Auto-completes when step is done
\`\`\`

### 4. Progress Transparency
\`\`\`typescript
// Always mark steps in progress
mark_step_in_progress({ ... })

// Update progress incrementally
update_step_progress({ progress: 50 })

// Add notes explaining what's happening
add_progress_note({ noteType: "progress", ... })
\`\`\`

### 5. Blocker Reporting
\`\`\`typescript
// Report blockers immediately
report_blocker({
  stepId,
  blockerDescription: "...",
  reportedBy: "Claude",
  severity: "high"
})

// Document in progress notes
add_progress_note({
  noteType: "blocker",
  content: "Detailed blocker explanation..."
})
\`\`\`

---

## Autonomous AI Agent Loop

The ideal AI agent workflow for autonomous development:

\`\`\`typescript
async function autonomousAgentLoop(projectId: string) {
  while (true) {
    // 1. Get current phase
    const { phase } = await get_current_phase({ projectId })

    // 2. Get next recommended step
    const { nextStep } = await get_next_step({ projectId })

    if (!nextStep) {
      console.log("No more work available!")

      // Check if phase is complete
      if (phaseExitCriteriaMet) {
        // Transition to next phase
        await transition_to_phase({
          projectId,
          newPhase: getNextPhase(phase),
          completedBy: "AI Agent"
        })
        continue
      } else {
        break // Wait for human input
      }
    }

    // 3. Mark step in progress
    await mark_step_in_progress({
      stepId: nextStep.id,
      agentName: "Claude"
    })

    // 4. Document start
    await add_progress_note({
      projectId,
      stepId: nextStep.id,
      authorName: "Claude",
      authorType: "agent",
      noteType: "progress",
      title: `Starting: ${nextStep.title}`,
      content: `Beginning work on this step...`
    })

    // 5. Do the work
    try {
      await implementStep(nextStep)

      // 6. Document completion
      await add_progress_note({
        projectId,
        stepId: nextStep.id,
        authorName: "Claude",
        authorType: "agent",
        noteType: "completion",
        content: "Implementation complete..."
      })

      // 7. Mark complete
      await mark_step_complete({
        stepId: nextStep.id,
        completedBy: "Claude",
        actualHours: 2.5,
        completionNotes: "Successfully implemented"
      })
    } catch (error) {
      // 8. Report blocker
      await report_blocker({
        stepId: nextStep.id,
        blockerDescription: error.message,
        reportedBy: "Claude",
        severity: "high"
      })

      await add_progress_note({
        projectId,
        stepId: nextStep.id,
        authorName: "Claude",
        authorType: "agent",
        noteType: "blocker",
        content: `Encountered blocker: ${error.message}`
      })

      break // Wait for human to resolve
    }
  }
}
\`\`\`

---

## Summary

**Phase Transitions:**
1. **Ideation** → **Architecture**: Vision validated
2. **Architecture** → **Construction**: Design approved
3. **Construction** → **Testing**: Features complete
4. **Testing** → **Deployment**: Quality validated
5. **Deployment** → **Maintenance**: Production live
6. **Maintenance** (ongoing): Continuous iteration via versions

**Key Tools by Phase:**
- **Ideation**: `create_business_context`, `create_adr`
- **Architecture**: `add_tech_stack_item`, `create_adr`, `create_step`
- **Construction**: `get_next_step`, `mark_step_in_progress`, `mark_step_complete`, `add_progress_note`
- **Testing**: `create_feature_request` (bugs), `approve_feature_request`
- **Deployment**: (external tools + monitoring)
- **Maintenance**: `create_version`, `create_feature_request`, `approve_feature_request`

**Always Remember:**
1. Document everything via `add_progress_note`
2. Track decisions via `create_adr`
3. Log improvements via `create_feature_request`
4. Mark work in progress via `mark_step_in_progress`
5. Be transparent about blockers via `report_blocker`
