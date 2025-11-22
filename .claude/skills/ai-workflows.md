# AI Agent Workflows

Best practices and patterns for AI agents using the AI Project Planner via MCP.

## Core Principles

1. **Autonomy** - AI agents should work independently with minimal human intervention
2. **Transparency** - Document all decisions and progress via progress notes
3. **Collaboration** - Work alongside humans and other AI agents
4. **Self-awareness** - Know when to ask for help or report blockers
5. **Context preservation** - Always query project context before making decisions

---

## Workflow Pattern: Task Execution

### Standard Task Loop

\`\`\`typescript
async function executeTask(projectId: string) {
  // 1. Get full project context
  const context = await fetchResource(`project://${projectId}/context`)

  // 2. Get next recommended step
  const { nextStep } = await callTool('get_next_step', { projectId })

  if (!nextStep) {
    return "No available work"
  }

  // 3. Mark as in progress
  await callTool('mark_step_in_progress', {
    stepId: nextStep.id,
    agentName: "Claude"
  })

  // 4. Document start
  await callTool('add_progress_note', {
    projectId,
    stepId: nextStep.id,
    authorName: "Claude",
    authorType: "agent",
    noteType: "progress",
    title: `Starting: ${nextStep.title}`,
    content: `
## Starting Implementation

### Context
${context.businessContext.vision}

### Acceptance Criteria
${nextStep.acceptanceCriteria.map(c => `- ${c.description}`).join('\n')}

### Approach
1. Review requirements
2. Implement core functionality
3. Add error handling
4. Test thoroughly
5. Document decisions
    `
  })

  // 5. Execute the work
  try {
    const result = await implementStep(nextStep, context)

    // 6. Document completion
    await callTool('add_progress_note', {
      projectId,
      stepId: nextStep.id,
      authorName: "Claude",
      authorType: "agent",
      noteType: "completion",
      title: "Implementation complete",
      content: `
## Completion Summary

### What was implemented:
${result.summary}

### Key decisions:
${result.decisions.map(d => `- ${d}`).join('\n')}

### Files modified:
${result.files.map(f => `- ${f}`).join('\n')}

### Testing:
${result.tests.map(t => `- ✅ ${t}`).join('\n')}

### Time: ${result.actualHours} hours (estimated: ${nextStep.estimatedHours})
      `
    })

    // 7. Mark complete
    await callTool('mark_step_complete', {
      stepId: nextStep.id,
      completedBy: "Claude",
      actualHours: result.actualHours,
      completionNotes: result.summary
    })

    return "success"
  } catch (error) {
    // 8. Report blocker
    await callTool('report_blocker', {
      stepId: nextStep.id,
      blockerDescription: error.message,
      reportedBy: "Claude",
      severity: error.severity || "high"
    })

    await callTool('add_progress_note', {
      projectId,
      stepId: nextStep.id,
      authorName: "Claude",
      authorType: "agent",
      noteType: "blocker",
      title: "Blocker encountered",
      content: `
## Blocker Details

**Error:** ${error.message}

**Context:** ${error.context}

**Resolution needed:**
${error.resolutionSteps.map(s => `- ${s}`).join('\n')}

**Temporary workaround:**
${error.workaround || "None available"}
      `
    })

    return "blocked"
  }
}
\`\`\`

---

## Workflow Pattern: Architecture Decision

### Making Architectural Decisions

\`\`\`typescript
async function makeArchitectureDecision(
  projectId: string,
  decision: {
    title: string
    context: string
    options: Array<{
      name: string
      pros: string[]
      cons: string[]
    }>
  }
) {
  // 1. Get current phase
  const { phase } = await callTool('get_current_phase', { projectId })

  if (phase.phase_name !== 'architecture' && phase.phase_name !== 'construction') {
    // Architecture decisions can happen in architecture or construction phases
    // If in other phases, may need approval
    console.warn("Not in architecture phase, documenting decision for review")
  }

  // 2. Analyze options
  const analysis = analyzeOptions(decision.options)
  const recommendedOption = analysis.best

  // 3. Create ADR
  const adr = await callTool('create_adr', {
    projectId,
    title: decision.title,
    context: decision.context,
    decision: `Selected: ${recommendedOption.name}\n\n${recommendedOption.rationale}`,
    consequences: recommendedOption.consequences,
    alternatives: decision.options
      .filter(opt => opt.name !== recommendedOption.name)
      .map(opt => ({
        option: opt.name,
        pros: opt.pros,
        cons: opt.cons,
        reasonNotChosen: opt.whyNot
      })),
    tags: extractTags(decision.title),
    decidedBy: "Claude AI Agent"
  })

  // 4. Document in progress notes
  await callTool('add_progress_note', {
    projectId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "decision",
    title: decision.title,
    content: `
## Architecture Decision

${decision.context}

### Options Considered:
${decision.options.map(opt => `
**${opt.name}**
Pros: ${opt.pros.join(', ')}
Cons: ${opt.cons.join(', ')}
`).join('\n')}

### Decision:
Selected **${recommendedOption.name}**

### Rationale:
${recommendedOption.rationale}

**ADR ID:** ${adr.id}
    `
  })

  return adr
}
\`\`\`

### Pivoting Architecture

\`\`\`typescript
async function pivotArchitecture(
  projectId: string,
  oldAdrId: string,
  pivot: {
    title: string
    reason: string
    newDecision: string
  }
) {
  // 1. Get old ADR
  const adrs = await callTool('get_project_adrs', { projectId })
  const oldAdr = adrs.find(a => a.id === oldAdrId)

  // 2. Create new ADR
  const newAdr = await callTool('create_adr', {
    projectId,
    title: pivot.title,
    context: `
Previous decision: ${oldAdr.title}

Reason for change: ${pivot.reason}
    `,
    decision: pivot.newDecision,
    consequences: "This supersedes a previous architectural decision. Migration work required.",
    tags: oldAdr.tags,
    decidedBy: "Claude AI Agent (pivot)"
  })

  // 3. Mark old ADR as superseded
  await callTool('supersede_adr', {
    oldAdrId,
    newAdrId: newAdr.id
  })

  // 4. Create migration steps if needed
  const migrationStep = await callTool('create_step', {
    projectId,
    title: `Migrate from ${oldAdr.title} to ${pivot.title}`,
    description: `Architecture pivot requires migration work`,
    phase: "construction",
    stage: "refactor",
    estimatedHours: estimateMigrationEffort(oldAdr, newAdr),
    assignedAgent: "claude",
    priority: "high"
  })

  // 5. Document the pivot
  await callTool('add_progress_note', {
    projectId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "decision",
    title: "Architecture Pivot",
    content: `
## Architecture Pivot Executed

### Previous Decision:
${oldAdr.title}: ${oldAdr.decision}

### New Decision:
${pivot.title}: ${pivot.newDecision}

### Reason for Change:
${pivot.reason}

### Migration Required:
Created step: ${migrationStep.id}
Estimated effort: ${migrationStep.estimatedHours} hours

**Old ADR:** ${oldAdrId} (superseded)
**New ADR:** ${newAdr.id} (active)
    `
  })

  return { oldAdr, newAdr, migrationStep }
}
\`\`\`

---

## Workflow Pattern: Feature Request Management

### Logging Feature Requests During Development

\`\`\`typescript
async function logFeatureIdea(
  projectId: string,
  idea: {
    title: string
    description: string
    impact: string
  }
) {
  // AI agents can propose enhancements during development
  const request = await callTool('create_feature_request', {
    projectId,
    title: idea.title,
    description: idea.description,
    requestType: "enhancement",
    priority: "medium",
    requestedBy: "Claude AI Agent",
    requestedByType: "agent",
    impact: idea.impact,
    effortEstimate: estimateEffort(idea),
    metadata: {
      discoveredDuring: "development",
      timestamp: new Date().toISOString()
    }
  })

  await callTool('add_progress_note', {
    projectId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "question",
    title: "Feature enhancement proposed",
    content: `
## Enhancement Proposal

While working on the current features, I identified an opportunity for improvement:

**${idea.title}**

${idea.description}

**Impact:** ${idea.impact}

**Effort:** ${estimateEffort(idea)}

This has been logged as feature request ${request.id} for review.

Would you like me to:
1. Implement this now (requires approval)
2. Defer to next version
3. Discard this idea

Please approve via: \`approve_feature_request\` tool
    `
  })

  return request
}
\`\`\`

### Logging Bugs

\`\`\`typescript
async function reportBug(
  projectId: string,
  bug: {
    title: string
    description: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    stepsToReproduce: string[]
    expectedBehavior: string
    actualBehavior: string
  }
) {
  const request = await callTool('create_feature_request', {
    projectId,
    title: `BUG: ${bug.title}`,
    description: `
## Bug Description
${bug.description}

## Steps to Reproduce
${bug.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Expected Behavior
${bug.expectedBehavior}

## Actual Behavior
${bug.actualBehavior}
    `,
    requestType: "bug",
    priority: bug.severity,
    requestedBy: "Claude Testing Agent",
    requestedByType: "agent",
    impact: `Severity: ${bug.severity}`,
    effortEstimate: "TBD",
    metadata: {
      discovered: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      stackTrace: bug.stackTrace
    }
  })

  await callTool('add_progress_note', {
    projectId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "blocker",
    title: `Bug discovered: ${bug.title}`,
    content: `
## Bug Report

${bug.description}

**Severity:** ${bug.severity}
**Feature Request ID:** ${request.id}

This bug should be prioritized based on severity.
    `
  })

  return request
}
\`\`\`

---

## Workflow Pattern: Version Management

### Planning Next Iteration

\`\`\`typescript
async function planNextVersion(
  projectId: string,
  backlogLimit: number = 20
) {
  // 1. Get all pending feature requests
  const backlog = await callTool('get_feature_backlog', {
    projectId,
    status: "proposed"
  })

  // 2. Analyze and prioritize
  const prioritized = prioritizeFeatures(backlog.backlog)

  // 3. Create new version
  const topFeatures = prioritized.slice(0, backlogLimit)

  const version = await callTool('create_version', {
    projectId,
    versionName: `v${getNextVersion()}`,
    description: "Next planned iteration",
    goals: topFeatures.map(f => ({
      goal: f.title,
      completed: false
    }))
  })

  // 4. Approve selected features for this version
  for (const feature of topFeatures) {
    await callTool('approve_feature_request', {
      featureRequestId: feature.id,
      approvedBy: "Claude AI Agent",
      versionId: version.id,
      assignedAgent: "claude"
    })
  }

  // 5. Document the plan
  await callTool('add_progress_note', {
    projectId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "decision",
    title: `${version.versionName} iteration planned`,
    content: `
## Version Planning: ${version.versionName}

Analyzed ${backlog.count} feature requests and selected ${topFeatures.length} for this iteration.

### Selected Features:
${topFeatures.map(f => `- [${f.priority}] ${f.title}`).join('\n')}

### Criteria:
- Priority: ${prioritized.length} high/critical items
- Effort: Estimated ${estimateTotalEffort(topFeatures)} hours
- Impact: ${topFeatures.filter(f => f.impact === 'high').length} high-impact items

Auto-created steps for approved features.
    `
  })

  return version
}
\`\`\`

---

## Workflow Pattern: Multi-Agent Collaboration

### Agent Handoff

\`\`\`typescript
async function handoffToAgent(
  projectId: string,
  stepId: string,
  targetAgent: 'v0' | 'claude' | 'gemini' | 'gpt',
  reason: string
) {
  // 1. Get current step details
  const steps = await callTool('get_project_steps', { projectId })
  const step = steps.find(s => s.id === stepId)

  // 2. Add handoff note
  await callTool('add_progress_note', {
    projectId,
    stepId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "progress",
    title: `Handing off to ${targetAgent}`,
    content: `
## Agent Handoff

Transferring this task to ${targetAgent} agent.

### Reason:
${reason}

### Current State:
- Progress: ${step.progress}%
- Status: ${step.status}

### Context for ${targetAgent}:
${step.description}

### Next Steps:
${step.tasks.filter(t => !t.completed).map(t => `- ${t}`).join('\n')}
    `
  })

  // 3. Assign to target agent
  await callTool('assign_agent_to_task', {
    stepId,
    agentType: targetAgent,
    assignedBy: "Claude"
  })

  // 4. If task was in progress, mark as pending for new agent
  if (step.status === 'in-progress') {
    await callTool('update_step', {
      stepId,
      status: 'pending'
    })
  }

  return { success: true, assignedTo: targetAgent }
}
\`\`\`

### Requesting Help

\`\`\`typescript
async function requestHelp(
  projectId: string,
  stepId: string,
  question: string
) {
  await callTool('add_progress_note', {
    projectId,
    stepId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "question",
    title: "Help needed",
    content: `
## Question / Help Request

${question}

### Context:
I'm working on: ${step.title}

Current progress: ${step.progress}%

### What I've tried:
${attempts.map(a => `- ${a}`).join('\n')}

### What I need:
Guidance on the best approach or architectural decision approval.

**Status:** Paused pending response
    `
  })

  // Mark step as blocked
  await callTool('report_blocker', {
    stepId,
    blockerDescription: `Awaiting guidance: ${question}`,
    reportedBy: "Claude",
    severity: "medium"
  })

  return { blocked: true, awaitingResponse: true }
}
\`\`\`

---

## Workflow Pattern: Progress Transparency

### Incremental Updates

\`\`\`typescript
async function provideProgressUpdate(
  projectId: string,
  stepId: string,
  progress: number,
  milestone: string
) {
  await callTool('update_step_progress', {
    stepId,
    progress,
    notes: milestone
  })

  await callTool('add_progress_note', {
    projectId,
    stepId,
    authorName: "Claude",
    authorType: "agent",
    noteType: "progress",
    title: `Progress update: ${progress}%`,
    content: `
## Milestone Reached: ${milestone}

Current progress: ${progress}%

### What's complete:
${completedWork.map(w => `- ✅ ${w}`).join('\n')}

### In progress:
${currentWork.map(w => `- 🔄 ${w}`).join('\n')}

### Next up:
${upcomingWork.map(w => `- ⏳ ${w}`).join('\n')}

**ETA:** ${estimateCompletion()} hours remaining
    `
  })
}
\`\`\`

---

## Best Practices for AI Agents

### 1. Always Query Context First

\`\`\`typescript
// ✅ GOOD
const context = await fetchResource(`project://${projectId}/context`)
const decision = makeDecision(context)

// ❌ BAD
const decision = makeDecisionWithoutContext()
\`\`\`

### 2. Document Everything

\`\`\`typescript
// Every significant action should have a progress note
await callTool('add_progress_note', {
  projectId,
  stepId,
  authorName: "Claude",
  authorType: "agent",
  noteType: "decision",
  content: "Detailed explanation..."
})
\`\`\`

### 3. Report Blockers Immediately

\`\`\`typescript
// Don't silently fail
try {
  await doWork()
} catch (error) {
  await callTool('report_blocker', { ... })
  await callTool('add_progress_note', { noteType: "blocker", ... })
  throw error // or return
}
\`\`\`

### 4. Use Appropriate Note Types

\`\`\`typescript
// progress - Regular updates
// blocker - Issues preventing work
// question - Need human input
// decision - Architectural/technical decisions
// completion - Work finished
\`\`\`

### 5. Respect Phase Boundaries

\`\`\`typescript
const { phase } = await callTool('get_current_phase', { projectId })

if (phase.phase_name === 'architecture') {
  // Don't start coding yet
  // Focus on design and ADRs
}

if (phase.phase_name === 'construction') {
  // Now you can code
}
\`\`\`

### 6. Keep Humans in the Loop

\`\`\`typescript
// For significant decisions, ask first
await callTool('add_progress_note', {
  noteType: "question",
  content: "Should I proceed with approach A or B?"
})

await callTool('report_blocker', {
  blockerDescription: "Awaiting decision on architecture approach"
})
\`\`\`

### 7. Update Progress Incrementally

\`\`\`typescript
// Don't go silent for hours
await callTool('update_step_progress', {
  stepId,
  progress: 25,
  notes: "Database schema designed"
})

await callTool('update_step_progress', {
  stepId,
  progress: 50,
  notes: "API endpoints implemented"
})
\`\`\`

### 8. Clean Up After Yourself

\`\`\`typescript
// If you create test data, document it
await callTool('add_progress_note', {
  noteType: "progress",
  content: "Created test project for development. ID: ${testProjectId}"
})

// If you discover issues, log them
await callTool('create_feature_request', {
  requestType: "tech_debt",
  title: "Refactor X for better performance"
})
\`\`\`

---

## Anti-Patterns to Avoid

### ❌ Silent Execution
\`\`\`typescript
// BAD: No documentation
await implementFeature()
await markComplete()
\`\`\`

### ❌ Skipping In-Progress Status
\`\`\`typescript
// BAD: Jump straight to complete
const step = await get_next_step()
await mark_step_complete({ stepId: step.id })

// GOOD: Mark in-progress first
await mark_step_in_progress({ stepId: step.id })
await doWork()
await mark_step_complete({ stepId: step.id })
\`\`\`

### ❌ Ignoring Blockers
\`\`\`typescript
// BAD: Continue despite errors
try {
  await doWork()
} catch (error) {
  console.log(error)
  // Just keep going?
}

// GOOD: Report and stop
try {
  await doWork()
} catch (error) {
  await report_blocker({ ... })
  return
}
\`\`\`

### ❌ Making Decisions Without Documentation
\`\`\`typescript
// BAD: Just do it
usePostgreSQL()

// GOOD: Document why
await create_adr({
  title: "Use PostgreSQL",
  context: "Need JSONB for metadata",
  decision: "PostgreSQL selected",
  alternatives: [...]
})
\`\`\`

---

## Summary

**Core Loop:**
1. Query context
2. Get next step
3. Mark in-progress
4. Document start
5. Do work
6. Document decisions
7. Update progress
8. Report blockers if needed
9. Document completion
10. Mark complete
11. Repeat

**Key Principles:**
- **Transparency** - Document everything
- **Autonomy** - Make informed decisions
- **Collaboration** - Work with humans and other agents
- **Quality** - Don't skip steps
- **Communication** - Ask when unsure
