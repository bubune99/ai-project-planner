# Practical Examples

Real-world scenarios and complete workflows using the AI Project Planner MCP server.

## Example 1: Creating a New SaaS Project

### Scenario
You want to build a new SaaS project for task management with AI assistance.

### Complete Workflow

```typescript
// Step 1: Create the project
const project = await callTool('create_project', {
  name: "AI Task Manager",
  description: "Intelligent task management with AI-powered prioritization",
  priority: "high",
  status: "planning",
  githubRepoUrl: "https://github.com/user/ai-task-manager",
  metadata: {
    targetLaunch: "2024-Q2",
    team: ["developer", "designer"]
  }
})

// Step 2: Add business context
await callTool('create_business_context', {
  projectId: project.id,
  vision: "Empower busy professionals to focus on what matters by using AI to intelligently prioritize their tasks",
  targetMarket: "Knowledge workers, freelancers, and small business owners (ages 25-45)",
  primaryUseCase: "Daily task prioritization with AI recommendations",
  revenueModel: "Freemium - Free for basic features, $9/month for AI features",
  competitiveAdvantage: "First task manager with true context-aware AI prioritization",
  successMetrics: [
    { metric: "Active users", target: 10000, current: 0 },
    { metric: "Paid conversion rate", target: "15%", current: "0%" },
    { metric: "Daily active users", target: 3000, current: 0 }
  ],
  riskAssessment: [
    {
      risk: "Competitors adding AI features",
      impact: "high",
      mitigation: "Move fast, focus on quality of AI recommendations"
    },
    {
      risk: "AI costs too high",
      impact: "medium",
      mitigation: "Implement smart caching and batch processing"
    }
  ],
  stakeholders: [
    { name: "Sarah Chen", role: "Product Owner", priority: "high" },
    { name: "Mike Johnson", role: "Lead Developer", priority: "high" }
  ],
  budgetInfo: {
    total: 50000,
    allocated: 20000,
    spent: 0
  }
})

// Step 3: Start ideation phase
await callTool('transition_to_phase', {
  projectId: project.id,
  newPhase: "ideation",
  completedBy: "system",
  description: "Beginning ideation phase"
})

// Step 4: Create ideation steps
const step1 = await callTool('create_step', {
  projectId: project.id,
  title: "User research and persona development",
  description: "Interview target users to understand pain points",
  phase: "ideation",
  stage: "discovery",
  estimatedHours: 16,
  priority: "high",
  tasks: [
    "Schedule 10 user interviews",
    "Create interview script",
    "Conduct interviews",
    "Synthesize findings",
    "Create user personas"
  ]
})

const step2 = await callTool('create_step', {
  projectId: project.id,
  title: "Define MVP feature set",
  description: "Determine minimum viable features for launch",
  phase: "ideation",
  stage: "planning",
  estimatedHours: 8,
  priority: "high",
  tasks: [
    "List all possible features",
    "Prioritize by user value",
    "Determine MVP scope",
    "Get stakeholder approval"
  ]
})

// Step 5: Create dependency (step2 depends on step1)
await callTool('create_dependency', {
  stepId: step2.id,
  dependsOnStepId: step1.id,
  dependencyType: "hard"
})

// Step 6: Work on first step
await callTool('mark_step_in_progress', {
  stepId: step1.id,
  agentName: "Claude"
})

await callTool('add_progress_note', {
  projectId: project.id,
  stepId: step1.id,
  authorName: "Claude",
  authorType: "agent",
  noteType: "progress",
  title: "Starting user research",
  content: `
## User Research Plan

### Interview Questions:
1. How do you currently manage your tasks?
2. What's your biggest productivity challenge?
3. How do you prioritize your work?
4. Have you tried AI-powered tools?

### Target: 10 interviews
### Timeline: 1 week
  `
})

// ... work happens ...

await callTool('mark_step_complete', {
  stepId: step1.id,
  completedBy: "Claude",
  actualHours: 14,
  completionNotes: "Completed 10 interviews, created 3 personas"
})

// Step 7: Move to architecture phase
await callTool('transition_to_phase', {
  projectId: project.id,
  newPhase: "architecture",
  completedBy: "Product Owner",
  description: "User research complete, moving to technical design"
})
```

---

## Example 2: Making an Architecture Decision

### Scenario
Deciding between PostgreSQL and MongoDB for the task manager database.

```typescript
const projectId = "project-uuid"

// Step 1: Analyze requirements
const requirements = {
  needs: [
    "Store tasks with flexible metadata",
    "User relationships and permissions",
    "Complex queries for AI prioritization",
    "ACID compliance for data integrity"
  ]
}

// Step 2: Evaluate options
const options = [
  {
    name: "PostgreSQL",
    pros: [
      "JSONB for flexible metadata",
      "Strong ACID compliance",
      "Powerful query capabilities",
      "Excellent for AI feature calculations"
    ],
    cons: [
      "More complex setup",
      "Steeper learning curve"
    ]
  },
  {
    name: "MongoDB",
    pros: [
      "Flexible schema",
      "Simple to get started",
      "Good for rapid prototyping"
    ],
    cons: [
      "Weaker data integrity",
      "Complex queries harder",
      "Not ideal for relationships"
    ]
  }
]

// Step 3: Create ADR
const adr = await callTool('create_adr', {
  projectId,
  title: "Database Selection: PostgreSQL vs MongoDB",
  context: `
We need a database that can handle:
- Complex relationships (users, tasks, projects)
- Flexible metadata on tasks
- Complex queries for AI prioritization algorithm
- Data integrity for task management

The AI prioritization feature requires joining multiple tables and performing calculations,
which favors a relational database.
  `,
  decision: `
Selected PostgreSQL for the following reasons:

1. **JSONB Support**: Gives us flexibility for task metadata while maintaining relational integrity
2. **Query Power**: Complex joins and aggregations needed for AI prioritization
3. **ACID Compliance**: Critical for task management data integrity
4. **Proven Scalability**: Can handle growth to 100k+ users
5. **AI Features**: Excellent for the ML features we plan to add

We'll use Neon for serverless PostgreSQL hosting.
  `,
  consequences: `
**Positive:**
- Robust data integrity
- Excellent query performance for AI features
- Strong ecosystem and tooling
- Good ORMs available (Drizzle, Prisma)

**Negative:**
- More complex initial setup than MongoDB
- Team needs to learn PostgreSQL if unfamiliar
- Schema migrations require more planning

**Mitigation:**
- Use migration tools (Drizzle Kit)
- Comprehensive database documentation
- Start with simple schema, add complexity as needed
  `,
  alternatives: [
    {
      option: "MongoDB",
      pros: [
        "Flexible schema",
        "Simple setup",
        "Fast prototyping"
      ],
      cons: [
        "Weaker data integrity",
        "Complex queries harder",
        "Not ideal for AI calculations"
      ],
      reasonNotChosen: "Our AI prioritization feature requires complex joins and calculations that are better suited for SQL"
    }
  ],
  tags: ["database", "architecture", "backend"],
  decidedBy: "Claude AI Architect"
})

// Step 4: Add tech stack item
await callTool('add_tech_stack_item', {
  projectId,
  name: "PostgreSQL",
  category: "database",
  version: "14.5",
  rationale: "Selected for JSONB support, ACID compliance, and powerful querying needed for AI features",
  documentationUrl: "https://www.postgresql.org/docs/",
  alternativesConsidered: [
    {
      name: "MongoDB",
      reason_not_chosen: "Weaker data integrity and complex queries harder"
    },
    {
      name: "MySQL",
      reason_not_chosen: "Lacks JSONB support for flexible task metadata"
    }
  ]
})

await callTool('add_tech_stack_item', {
  projectId,
  name: "Neon",
  category: "hosting",
  version: "latest",
  rationale: "Serverless PostgreSQL with excellent developer experience and autoscaling",
  documentationUrl: "https://neon.tech/docs"
})

// Step 5: Document the decision
await callTool('add_progress_note', {
  projectId,
  authorName: "Claude",
  authorType: "agent",
  noteType: "decision",
  title: "Database architecture finalized",
  content: `
## Database Decision: PostgreSQL

After analyzing requirements and options, selected PostgreSQL hosted on Neon.

**Key factors:**
- AI prioritization requires complex SQL queries
- JSONB gives flexibility for task metadata
- ACID compliance critical for data integrity

**ADR created:** ${adr.id}

**Next steps:**
- Design database schema
- Set up Neon database
- Create migration scripts
  `
})
```

---

## Example 3: Handling a Blocker

### Scenario
AI agent encounters missing API key during development.

```typescript
const stepId = "step-uuid"
const projectId = "project-uuid"

// Step 1: Mark step in progress
await callTool('mark_step_in_progress', {
  stepId,
  agentName: "Claude"
})

// Step 2: Attempt work
try {
  await implementOpenAIIntegration()
} catch (error) {
  // error: "OpenAI API key not found in environment"

  // Step 3: Report blocker
  await callTool('report_blocker', {
    stepId,
    blockerDescription: "Missing OPENAI_API_KEY environment variable. Cannot test AI features.",
    reportedBy: "Claude",
    severity: "high"
  })

  // Step 4: Document the blocker with details
  await callTool('add_progress_note', {
    projectId,
    stepId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "blocker",
    title: "Blocker: Missing OpenAI API key",
    content: `
## Blocker Details

**Issue:** OpenAI API key not configured in environment

**Impact:** Cannot test AI prioritization feature

**Resolution Needed:**
1. Obtain OpenAI API key from https://platform.openai.com/
2. Add to .env.local file:
   \`\`\`
   OPENAI_API_KEY=sk-...
   \`\`\`
3. Restart development server

**Temporary Workaround:**
- Created mock AI responses for development
- All AI features will use mock data until key is configured
- Mock implementation in: \`lib/ai/mock-responses.ts\`

**Current Status:**
- Step is blocked but not failed
- Code is complete and ready for testing
- Waiting for API key to verify functionality

**Files completed:**
- ✅ lib/ai/prioritization.ts (with mock fallback)
- ✅ api/ai/prioritize.ts (with mock fallback)
- ⏳ Testing with real API (blocked)
    `
  })

  // Step 5: Implement workaround
  await implementMockAIResponses()

  // Step 6: Update progress (partial completion)
  await callTool('update_step_progress', {
    stepId,
    progress: 75,
    notes: "Implementation complete, testing blocked on API key"
  })

  // Step 7: Create follow-up task
  const followUp = await callTool('create_step', {
    projectId,
    title: "Configure OpenAI API key and test",
    description: "Add OPENAI_API_KEY to environment and verify AI features work",
    phase: "construction",
    stage: "testing",
    estimatedHours: 1,
    priority: "high",
    tasks: [
      "Get OpenAI API key",
      "Add to .env.local",
      "Test AI prioritization",
      "Remove mock responses",
      "Verify error handling"
    ]
  })

  // Step 8: Link dependency
  await callTool('create_dependency', {
    stepId: followUp.id,
    dependsOnStepId: stepId,
    dependencyType: "hard"
  })

  await callTool('add_progress_note', {
    projectId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "progress",
    title: "Created follow-up task for testing",
    content: `
Created follow-up step: ${followUp.id}

This step will handle:
- API key configuration
- Real API testing
- Removal of mock responses

Original step progress: 75% (implementation done, testing blocked)
    `
  })
}
```

---

## Example 4: Architecture Pivot

### Scenario
Midway through construction, team decides to switch from REST to tRPC.

```typescript
const projectId = "project-uuid"

// Step 1: Get the old REST API decision
const adrs = await callTool('get_project_adrs', { projectId })
const restAdr = adrs.find(a => a.title.includes("REST API"))

// Step 2: Create new tRPC decision
const trpcAdr = await callTool('create_adr', {
  projectId,
  title: "Pivot: Switch from REST to tRPC",
  context: `
**Original Decision:** REST API for frontend-backend communication

**Reason for Pivot:**
During development, we encountered frequent type safety issues:
- Props passed to components with wrong types
- API response types not matching frontend expectations
- Runtime errors due to type mismatches
- Slow development due to manual type synchronization

Team evaluated tRPC and found:
- End-to-end type safety from client to server
- No need for separate API schemas
- Better developer experience
- Caught type errors at compile time instead of runtime
  `,
  decision: `
Switching to tRPC for the following reasons:

1. **Type Safety**: Eliminate runtime type errors with compile-time checking
2. **Developer Experience**: Faster development with autocomplete and type hints
3. **Single Source of Truth**: Types automatically inferred from server code
4. **Error Prevention**: Catch API contract violations before deployment
5. **Proven**: Used successfully by similar projects (Cal.com, Create T3 App)

**Migration Plan:**
1. Set up tRPC server with Next.js
2. Create tRPC router with procedures
3. Migrate endpoints one by one
4. Update frontend to use tRPC hooks
5. Remove old REST endpoints after migration complete
  `,
  consequences: `
**Positive:**
- Eliminated all type-related runtime errors during testing
- Development speed increased 30%
- Better autocomplete in IDE
- Easier API refactoring

**Negative:**
- Migration effort: ~40 hours
- Team learning curve: ~1 week
- Some existing API routes need rewrite

**Cost:**
- Short-term: Migration time and potential bugs during transition
- Long-term: Massive improvement in code quality and development speed
  `,
  alternatives: [
    {
      option: "Keep REST API with better TypeScript",
      pros: ["No migration effort", "Familiar patterns"],
      cons: ["Still manual type sync", "Doesn't solve root problem"],
      reasonNotChosen: "Doesn't address the fundamental issue of type safety"
    },
    {
      option: "GraphQL",
      pros: ["Type safety", "Flexible queries"],
      cons: ["More complex", "Overhead for simple CRUD"],
      reasonNotChosen: "Too complex for our current needs, tRPC is simpler"
    }
  ],
  tags: ["api", "architecture", "type-safety", "pivot"],
  decidedBy: "Engineering Team"
})

// Step 3: Mark old ADR as superseded
await callTool('supersede_adr', {
  oldAdrId: restAdr.id,
  newAdrId: trpcAdr.id
})

// Step 4: Create migration steps
const migrationSteps = [
  {
    title: "Set up tRPC server and router",
    description: "Initialize tRPC in Next.js API routes",
    estimatedHours: 4
  },
  {
    title: "Migrate auth endpoints to tRPC",
    description: "Convert login, register, logout to tRPC procedures",
    estimatedHours: 6
  },
  {
    title: "Migrate task endpoints to tRPC",
    description: "Convert CRUD operations for tasks",
    estimatedHours: 8
  },
  {
    title: "Migrate AI endpoints to tRPC",
    description: "Convert AI prioritization and recommendations",
    estimatedHours: 6
  },
  {
    title: "Update frontend to use tRPC hooks",
    description: "Replace fetch calls with useTRPC hooks",
    estimatedHours: 12
  },
  {
    title: "Remove old REST endpoints",
    description: "Clean up deprecated API routes",
    estimatedHours: 4
  }
]

for (const [index, stepData] of migrationSteps.entries()) {
  const step = await callTool('create_step', {
    projectId,
    title: `[Migration] ${stepData.title}`,
    description: stepData.description,
    phase: "construction",
    stage: "refactor",
    estimatedHours: stepData.estimatedHours,
    priority: "high",
    assignedAgent: "claude"
  })

  // Create dependencies (each step depends on previous)
  if (index > 0) {
    const prevStepId = migrationSteps[index - 1].id
    await callTool('create_dependency', {
      stepId: step.id,
      dependsOnStepId: prevStepId,
      dependencyType: "hard"
    })
  }

  migrationSteps[index].id = step.id
}

// Step 5: Document the pivot
await callTool('add_progress_note', {
  projectId,
  authorName: "Claude",
  authorType: "agent",
  noteType: "decision",
  title: "Architecture Pivot: REST → tRPC",
  content: `
## Major Architecture Change

**Decision:** Pivoting from REST API to tRPC

**Reason:** Type safety issues causing runtime errors and slowing development

**Old ADR:** ${restAdr.id} (superseded)
**New ADR:** ${trpcAdr.id} (active)

**Migration Plan:**
Created ${migrationSteps.length} steps with estimated ${migrationSteps.reduce((sum, s) => sum + s.estimatedHours, 0)} hours

**Timeline:** 1-2 weeks

**Steps:**
${migrationSteps.map((s, i) => `${i + 1}. ${s.title} (${s.estimatedHours}h)`).join('\n')}

**Expected Benefits:**
- Zero runtime type errors
- 30% faster development
- Better developer experience

**Trade-off:**
- Short-term: Migration effort
- Long-term: Significant quality improvement
  `
})

// Step 6: AI agent starts migration
const firstStep = migrationSteps[0]
await callTool('mark_step_in_progress', {
  stepId: firstStep.id,
  agentName: "Claude"
})

// ... migration work continues ...
```

---

## Example 5: Post-MVP Feature Request

### Scenario
MVP is live. User reports a bug and requests dark mode.

```typescript
const projectId = "project-uuid"

// Step 1: User reports bug via UI or email
// AI agent creates feature request

const bugRequest = await callTool('create_feature_request', {
  projectId,
  title: "BUG: Task completion not updating progress bar",
  description: `
**Reporter:** Sarah Chen (user@example.com)

**Bug Description:**
When I mark a task as complete, the progress bar at the top doesn't update until I refresh the page.

**Steps to Reproduce:**
1. Open a project with 10 tasks, 5 completed
2. Mark another task as complete
3. Observe progress bar
4. Progress bar shows 50% instead of 60%

**Expected:** Progress bar should update immediately
**Actual:** Progress bar only updates on page refresh

**Environment:**
- Browser: Chrome 120
- OS: macOS
- Version: 1.0.0
  `,
  requestType: "bug",
  priority: "high",
  requestedBy: "sarah.chen@example.com",
  requestedByType: "human",
  impact: "Poor user experience, confusing to users",
  effortEstimate: "small",
  metadata: {
    reportedDate: "2024-01-15",
    userEmail: "sarah.chen@example.com",
    affectedUsers: 15
  }
})

const darkModeRequest = await callTool('create_feature_request', {
  projectId,
  title: "Add dark mode support",
  description: `
**Reporter:** Multiple users via feedback form

**Feature Request:**
Add a dark mode theme that users can toggle. Many users work at night and find the bright interface straining.

**User Feedback:**
- "I love the app but it hurts my eyes at night"
- "Would pay extra for dark mode!"
- "Surprised there's no dark mode in 2024"

**Requirements:**
1. Toggle in settings or navbar
2. Persist preference
3. System preference detection
4. Smooth transition between modes
5. All pages should support dark mode

**References:**
- https://tailwindcss.com/docs/dark-mode
- https://next-themes.vercel.app/
  `,
  requestType: "enhancement",
  priority: "medium",
  requestedBy: "Product Team (via user feedback)",
  requestedByType: "human",
  impact: "Improved accessibility and user satisfaction. Requested by 45+ users.",
  effortEstimate: "medium",
  acceptanceCriteria: [
    {
      description: "Dark mode toggle in user settings",
      testCommand: "Click settings → Toggle dark mode → Verify theme changes"
    },
    {
      description: "All pages render correctly in dark mode",
      testCommand: "Navigate to all pages in dark mode → Verify readability"
    },
    {
      description: "Preference persists across sessions",
      testCommand: "Enable dark mode → Refresh page → Verify still dark"
    }
  ]
})

// Step 2: Create v1.1 for bug fixes and improvements
const v11 = await callTool('create_version', {
  projectId,
  versionName: "v1.1",
  versionNumber: "1.1.0",
  description: "Bug fixes and quality of life improvements",
  goals: [
    { goal: "Fix progress bar update bug", completed: false },
    { goal: "Add dark mode support", completed: false },
    { goal: "Improve performance", completed: false }
  ]
})

// Step 3: Approve bug fix immediately
const bugApproval = await callTool('approve_feature_request', {
  featureRequestId: bugRequest.id,
  approvedBy: "Engineering Lead",
  versionId: v11.id,
  assignedAgent: "claude"
})

// This auto-created a step: bugApproval.stepId

// Step 4: Approve dark mode for v1.1
const darkModeApproval = await callTool('approve_feature_request', {
  featureRequestId: darkModeRequest.id,
  approvedBy: "Product Manager",
  versionId: v11.id,
  assignedAgent: "claude"
})

// Step 5: AI agent works on bug fix first
await callTool('mark_step_in_progress', {
  stepId: bugApproval.stepId,
  agentName: "Claude"
})

// Implement bug fix...
// Found the issue: missing state update in component

await callTool('add_progress_note', {
  projectId,
  stepId: bugApproval.stepId,
  authorName: "Claude",
  authorType: "agent",
  noteType: "decision",
  title: "Bug fix: Added real-time progress updates",
  content: `
## Bug Fix Implementation

**Root Cause:**
Progress bar component wasn't subscribed to task completion events

**Fix:**
1. Added event listener for task updates
2. Implemented optimistic UI update
3. Synced with server state

**Files Changed:**
- components/ProgressBar.tsx
- hooks/useTaskProgress.ts

**Testing:**
- ✅ Manual testing confirmed immediate updates
- ✅ Works across multiple projects
- ✅ Handles concurrent updates
  `
})

await callTool('mark_step_complete', {
  stepId: bugApproval.stepId,
  completedBy: "Claude",
  actualHours: 2,
  completionNotes: "Bug fixed, tested, and deployed"
})

// Bug fix auto-completes the feature request

// Step 6: Work on dark mode
await callTool('mark_step_in_progress', {
  stepId: darkModeApproval.stepId,
  agentName: "Claude"
})

// Implement dark mode...

await callTool('mark_step_complete', {
  stepId: darkModeApproval.stepId,
  completedBy: "Claude",
  actualHours: 8,
  completionNotes: "Dark mode implemented with next-themes, tested across all pages"
})

// Step 7: All v1.1 goals complete, release it
await callTool('update_version', {
  versionId: v11.id,
  status: "released",
  releaseNotes: `
# Version 1.1.0 Released 🎉

## Bug Fixes
- Fixed progress bar not updating in real-time
- Fixed task sorting edge case

## New Features
- ✨ Dark mode support with system preference detection
- Toggle in user settings
- Smooth theme transitions

## Improvements
- 25% faster page loads
- Better mobile responsiveness

Thank you to all users who provided feedback!
  `
})

// Step 8: Document the release
await callTool('add_progress_note', {
  projectId,
  authorName: "Claude",
  authorType: "agent",
  noteType: "completion",
  title: "v1.1.0 Released",
  content: `
## Version 1.1.0 Release Summary

**Features Shipped:**
- ✅ Progress bar bug fix (2h vs 2h estimated)
- ✅ Dark mode support (8h vs 8h estimated)

**Total Development Time:** 10 hours

**User Impact:**
- Bug affected 15 users, now resolved
- Dark mode requested by 45+ users, now available

**Next Steps:**
- Monitor for issues
- Gather user feedback
- Plan v1.2 features
  `
})
```

---

## Example 6: Multi-Agent Collaboration

### Scenario
Claude handles backend, v0 handles UI, working on the same feature.

```typescript
const projectId = "project-uuid"

// Step 1: Create feature - "User profile with avatar upload"
const feature = await callTool('create_step', {
  projectId,
  title: "User profile with avatar upload",
  description: "Allow users to upload profile pictures",
  phase: "construction",
  stage: "feature",
  estimatedHours: 12,
  priority: "high"
})

// Step 2: Break down into sub-tasks
const backendStep = await callTool('create_step', {
  projectId,
  title: "[Backend] Avatar upload API and storage",
  description: "Create API endpoint for uploading avatars to S3",
  phase: "construction",
  stage: "backend",
  estimatedHours: 6,
  assignedAgent: "claude",
  tasks: [
    "Set up S3 bucket",
    "Create upload endpoint",
    "Add image validation",
    "Generate thumbnails",
    "Update user model"
  ]
})

const frontendStep = await callTool('create_step', {
  projectId,
  title: "[Frontend] Avatar upload UI component",
  description: "Create avatar upload component with preview",
  phase: "construction",
  stage: "frontend",
  estimatedHours: 6,
  assignedAgent: "v0",
  tasks: [
    "Design upload component",
    "Add drag-and-drop",
    "Image preview",
    "Upload progress",
    "Error handling"
  ]
})

// Frontend depends on backend API
await callTool('create_dependency', {
  stepId: frontendStep.id,
  dependsOnStepId: backendStep.id,
  dependencyType: "hard"
})

// Step 3: Claude works on backend
await callTool('mark_step_in_progress', {
  stepId: backendStep.id,
  agentName: "Claude"
})

await callTool('add_progress_note', {
  projectId,
  stepId: backendStep.id,
  authorName: "Claude",
  authorType: "agent",
  noteType: "progress",
  title: "Starting avatar upload backend",
  content: `
## Implementation Plan

### Architecture:
- S3 for storage (AWS S3 or Vercel Blob)
- Sharp for image processing
- Zod for validation

### API Endpoint:
POST /api/user/avatar
- Max size: 5MB
- Formats: JPEG, PNG, WebP
- Auto-generate thumbnail (200x200)

### Database:
Add avatar_url to users table

Will notify v0 agent when API is ready for integration.
  `
})

// ... implementation ...

await callTool('add_progress_note', {
  projectId,
  stepId: backendStep.id,
  authorName: "Claude",
  authorType: "agent",
  noteType: "completion",
  title: "Backend complete - API ready",
  content: `
## Avatar Upload API Complete

### Endpoint:
\`POST /api/user/avatar\`

### Request:
\`\`\`typescript
{
  image: File // FormData
}
\`\`\`

### Response:
\`\`\`typescript
{
  avatarUrl: string
  thumbnailUrl: string
}
\`\`\`

### Example:
\`\`\`typescript
const formData = new FormData()
formData.append('image', file)

const res = await fetch('/api/user/avatar', {
  method: 'POST',
  body: formData
})

const { avatarUrl } = await res.json()
\`\`\`

@v0 - API is ready for frontend integration!
  `
})

await callTool('mark_step_complete', {
  stepId: backendStep.id,
  completedBy: "Claude",
  actualHours: 5,
  completionNotes: "API implemented and tested"
})

// Step 4: v0 picks up frontend work
await callTool('mark_step_in_progress', {
  stepId: frontendStep.id,
  agentName: "v0"
})

await callTool('add_progress_note', {
  projectId,
  stepId: frontendStep.id,
  authorName: "v0",
  authorType: "agent",
  noteType: "progress",
  title: "Building avatar upload UI",
  content: `
## UI Component Design

Thanks @Claude for the API specs!

### Component Features:
- Drag-and-drop zone
- File browser fallback
- Image preview before upload
- Upload progress bar
- Error states with retry

### Tech:
- react-dropzone for drag-and-drop
- TailwindCSS for styling
- React Query for upload state

Will implement and test with the API.
  `
})

// ... v0 implements UI ...

await callTool('mark_step_complete', {
  stepId: frontendStep.id,
  completedBy: "v0",
  actualHours: 6,
  completionNotes: "UI component complete and integrated with API"
})

// Step 5: Integration testing
await callTool('add_progress_note', {
  projectId,
  authorName: "Claude",
  authorType: "agent",
  noteType: "completion",
  title: "Avatar upload feature complete",
  content: `
## Feature Complete: Avatar Upload

**Backend (Claude):** ✅ Complete (5h)
- S3 storage configured
- Upload API working
- Image validation and thumbnails

**Frontend (v0):** ✅ Complete (6h)
- Upload component beautiful
- Drag-and-drop works perfectly
- Error handling smooth

**Integration Testing:**
- ✅ Upload works end-to-end
- ✅ Thumbnails generated correctly
- ✅ Handles errors gracefully
- ✅ Works on mobile

**Total Time:** 11h (estimated: 12h)

Great collaboration @v0! 🎉
  `
})

// Mark parent feature complete
await callTool('mark_step_complete', {
  stepId: feature.id,
  completedBy: "Team (Claude + v0)",
  actualHours: 11,
  completionNotes: "Backend and frontend complete, tested end-to-end"
})
```

---

## Key Takeaways

1. **Always query context first** - Use resources before making decisions
2. **Document everything** - Future you (and others) will thank you
3. **Report blockers immediately** - Don't hide issues
4. **Use appropriate note types** - progress, blocker, question, decision, completion
5. **Create dependencies** - Help other agents understand task order
6. **Break down large tasks** - Smaller steps are easier to manage
7. **Handoff clearly** - When collaborating, provide complete context
8. **Track architecture decisions** - ADRs are critical for future reference
9. **Manage iterations** - Use versions for post-MVP work
10. **Be transparent** - Users and other agents need to see your progress
