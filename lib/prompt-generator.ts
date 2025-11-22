/**
 * AI Agent Prompt Generator
 * Generates comprehensive instructions for AI agents based on project context
 */

import type {
  Project,
  ProjectStep,
  BusinessContext,
  TechStackItem,
  StepDependency,
} from './db/schema'

export interface PromptGeneratorOptions {
  includeBusinessContext?: boolean
  includeTechStack?: boolean
  includeDependencies?: boolean
  includeAcceptanceCriteria?: boolean
  includeMCPInstructions?: boolean
  format?: 'markdown' | 'plain' | 'json'
  mcpServerUrl?: string
}

export interface AgentPromptData {
  project: Project
  step: ProjectStep
  businessContext?: BusinessContext
  techStack?: TechStackItem[]
  dependencies?: {
    step: ProjectStep
    type: 'hard' | 'soft'
    completed: boolean
  }[]
  completedDependencies?: ProjectStep[]
  blockedBy?: ProjectStep[]
}

const DEFAULT_OPTIONS: PromptGeneratorOptions = {
  includeBusinessContext: true,
  includeTechStack: true,
  includeDependencies: true,
  includeAcceptanceCriteria: true,
  includeMCPInstructions: true,
  format: 'markdown',
  mcpServerUrl: process.env.NEXT_PUBLIC_MCP_URL || 'http://localhost:3000/mcp/sse',
}

/**
 * Generates a comprehensive prompt for an AI agent to work on a specific task
 */
export function generateAgentPrompt(
  data: AgentPromptData,
  options: PromptGeneratorOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (opts.format === 'json') {
    return generateJSONPrompt(data, opts)
  }

  return generateMarkdownPrompt(data, opts)
}

function generateMarkdownPrompt(
  data: AgentPromptData,
  opts: PromptGeneratorOptions
): string {
  const { project, step, businessContext, techStack, dependencies, completedDependencies, blockedBy } = data

  let prompt = ''

  // Header
  prompt += `# AI Agent Instructions: ${step.title}\n\n`
  prompt += `Project: **${project.name}**\n`
  prompt += `Phase: **${step.phase}** | Stage: **${step.stage}**\n`
  if (step.assigned_agent) {
    prompt += `Assigned Agent: **${step.assigned_agent}**\n`
  }
  prompt += `\n---\n\n`

  // Business Context
  if (opts.includeBusinessContext && businessContext) {
    prompt += `## 📋 Business Context\n\n`
    prompt += `**Vision:** ${businessContext.vision}\n\n`
    prompt += `**Target Users:** ${businessContext.target_market}\n\n`
    prompt += `**Primary Use Case:** ${businessContext.primary_use_case}\n\n`
    prompt += `**Revenue Model:** ${businessContext.revenue_model}\n\n`

    if (businessContext.success_metrics && businessContext.success_metrics.length > 0) {
      prompt += `**Success Metrics:**\n`
      businessContext.success_metrics.forEach((metric) => {
        prompt += `- ${metric.metric}: Target ${metric.target}, Currently ${metric.current}\n`
      })
      prompt += `\n`
    }

    prompt += `---\n\n`
  }

  // Technical Stack
  if (opts.includeTechStack && techStack && techStack.length > 0) {
    prompt += `## ⚙️ Technical Stack\n\n`

    // Group by category
    const grouped = techStack.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = []
      acc[item.category].push(item)
      return acc
    }, {} as Record<string, TechStackItem[]>)

    Object.entries(grouped).forEach(([category, items]) => {
      prompt += `### ${category}\n\n`
      items.forEach((item) => {
        prompt += `**${item.name}**`
        if (item.version) prompt += ` v${item.version}`
        prompt += `\n`
        prompt += `- **Why:** ${item.rationale}\n`
        if (item.documentation_url) {
          prompt += `- **Docs:** ${item.documentation_url}\n`
        }
        if (item.alternatives_considered && item.alternatives_considered.length > 0) {
          prompt += `- **Alternatives considered:**\n`
          item.alternatives_considered.forEach((alt) => {
            prompt += `  - ❌ ${alt.name}: ${alt.reason_not_chosen}\n`
          })
        }
        prompt += `\n`
      })
    })

    prompt += `---\n\n`
  }

  // Task Details
  prompt += `## 🎯 Your Task\n\n`
  prompt += `**Title:** ${step.title}\n\n`
  prompt += `**Description:** ${step.description}\n\n`

  if (step.priority) {
    prompt += `**Priority:** ${step.priority.toUpperCase()}\n\n`
  }

  if (step.estimated_hours > 0) {
    prompt += `**Estimated Time:** ${step.estimated_hours} hours\n\n`
  }

  // Tasks breakdown
  if (step.tasks && Array.isArray(step.tasks) && step.tasks.length > 0) {
    prompt += `**Tasks to Complete:**\n\n`
    step.tasks.forEach((task, idx) => {
      prompt += `${idx + 1}. ${task}\n`
    })
    prompt += `\n`
  }

  prompt += `---\n\n`

  // Dependencies
  if (opts.includeDependencies && dependencies && dependencies.length > 0) {
    prompt += `## 🔗 Dependencies\n\n`

    const completed = dependencies.filter(d => d.completed)
    const pending = dependencies.filter(d => !d.completed)

    if (completed.length > 0) {
      prompt += `### ✅ Completed Dependencies\n\n`
      completed.forEach((dep) => {
        prompt += `- **${dep.step.title}** (${dep.type} dependency)\n`
        prompt += `  - Status: ${dep.step.status}\n`
        prompt += `  - Progress: ${dep.step.progress}%\n`
      })
      prompt += `\n`
    }

    if (pending.length > 0) {
      prompt += `### ⏳ Pending Dependencies\n\n`
      pending.forEach((dep) => {
        prompt += `- **${dep.step.title}** (${dep.type} dependency)\n`
        prompt += `  - Status: ${dep.step.status}\n`
        prompt += `  - Progress: ${dep.step.progress}%\n`
      })
      prompt += `\n`
      prompt += `⚠️ **Note:** Some dependencies are not yet complete. Proceed with caution or wait for completion.\n\n`
    }

    if (blockedBy && blockedBy.length > 0) {
      prompt += `### 🚫 Blocked By\n\n`
      blockedBy.forEach((blocker) => {
        prompt += `- **${blocker.title}**\n`
        prompt += `  - Status: ${blocker.status}\n`
        prompt += `  - Progress: ${blocker.progress}%\n`
      })
      prompt += `\n`
    }

    prompt += `---\n\n`
  }

  // Acceptance Criteria
  if (opts.includeAcceptanceCriteria && step.acceptance_criteria && Array.isArray(step.acceptance_criteria)) {
    prompt += `## ✓ Acceptance Criteria\n\n`
    prompt += `Your implementation must meet these criteria:\n\n`

    step.acceptance_criteria.forEach((criteria: any, idx: number) => {
      prompt += `${idx + 1}. ${criteria.description}\n`
      if (criteria.testCommand) {
        prompt += `   - Test: \`${criteria.testCommand}\`\n`
      }
    })
    prompt += `\n`
    prompt += `All criteria must be satisfied before marking this task as complete.\n\n`
    prompt += `---\n\n`
  }

  // MCP Instructions
  if (opts.includeMCPInstructions) {
    prompt += `## 🤖 MCP Integration\n\n`
    prompt += `You are connected to the AI Project Planner MCP server.\n\n`
    prompt += `**Server URL:** ${opts.mcpServerUrl}\n\n`
    prompt += `**Available Tools:**\n\n`
    prompt += `1. **mark_step_in_progress** - Mark this step as in progress when you start\n`
    prompt += `   \`\`\`json\n`
    prompt += `   {\n`
    prompt += `     "projectId": "${project.id}",\n`
    prompt += `     "stepId": "${step.id}"\n`
    prompt += `   }\n`
    prompt += `   \`\`\`\n\n`
    prompt += `2. **update_step_progress** - Update progress as you work (0-100%)\n`
    prompt += `   \`\`\`json\n`
    prompt += `   {\n`
    prompt += `     "projectId": "${project.id}",\n`
    prompt += `     "stepId": "${step.id}",\n`
    prompt += `     "progress": 50\n`
    prompt += `   }\n`
    prompt += `   \`\`\`\n\n`
    prompt += `3. **mark_step_complete** - Mark as complete when done\n`
    prompt += `   \`\`\`json\n`
    prompt += `   {\n`
    prompt += `     "projectId": "${project.id}",\n`
    prompt += `     "stepId": "${step.id}",\n`
    prompt += `     "actualHours": 3.5,\n`
    prompt += `     "notes": "Completed with all tests passing"\n`
    prompt += `   }\n`
    prompt += `   \`\`\`\n\n`
    prompt += `4. **report_blocker** - Report if you're blocked\n`
    prompt += `   \`\`\`json\n`
    prompt += `   {\n`
    prompt += `     "projectId": "${project.id}",\n`
    prompt += `     "stepId": "${step.id}",\n`
    prompt += `     "blocker": "Missing API keys",\n`
    prompt += `     "severity": "high"\n`
    prompt += `   }\n`
    prompt += `   \`\`\`\n\n`
    prompt += `---\n\n`
  }

  // Footer
  prompt += `## 📝 Workflow\n\n`
  prompt += `1. **Start:** Call \`mark_step_in_progress\` to signal you're beginning\n`
  prompt += `2. **Implement:** Work through each task in the "Tasks to Complete" section\n`
  prompt += `3. **Update:** Periodically call \`update_step_progress\` with your progress percentage\n`
  prompt += `4. **Test:** Verify all acceptance criteria are met\n`
  prompt += `5. **Complete:** Call \`mark_step_complete\` with actual hours spent and completion notes\n`
  prompt += `6. **Next:** System will automatically suggest the next available task\n\n`
  prompt += `If you encounter blockers, immediately call \`report_blocker\` with details.\n\n`
  prompt += `---\n\n`
  prompt += `**Good luck! 🚀**\n`

  return prompt
}

function generateJSONPrompt(
  data: AgentPromptData,
  opts: PromptGeneratorOptions
): string {
  const { project, step, businessContext, techStack, dependencies } = data

  const jsonPrompt = {
    task: {
      id: step.id,
      title: step.title,
      description: step.description,
      phase: step.phase,
      stage: step.stage,
      priority: step.priority,
      estimatedHours: step.estimated_hours,
      assignedAgent: step.assigned_agent,
      tasks: step.tasks,
      acceptanceCriteria: step.acceptance_criteria,
    },
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
    },
    ...(opts.includeBusinessContext &&
      businessContext && {
        businessContext: {
          vision: businessContext.vision,
          targetMarket: businessContext.target_market,
          primaryUseCase: businessContext.primary_use_case,
          revenueModel: businessContext.revenue_model,
          successMetrics: businessContext.success_metrics,
        },
      }),
    ...(opts.includeTechStack &&
      techStack && {
        techStack: techStack.map((item) => ({
          name: item.name,
          category: item.category,
          version: item.version,
          rationale: item.rationale,
          documentationUrl: item.documentation_url,
          alternativesConsidered: item.alternatives_considered,
        })),
      }),
    ...(opts.includeDependencies &&
      dependencies && {
        dependencies: dependencies.map((dep) => ({
          id: dep.step.id,
          title: dep.step.title,
          type: dep.type,
          status: dep.step.status,
          completed: dep.completed,
        })),
      }),
    ...(opts.includeMCPInstructions && {
      mcp: {
        serverUrl: opts.mcpServerUrl,
        projectId: project.id,
        stepId: step.id,
        tools: ['mark_step_in_progress', 'update_step_progress', 'mark_step_complete', 'report_blocker'],
      },
    }),
  }

  return JSON.stringify(jsonPrompt, null, 2)
}

/**
 * Generates a prompt for an entire phase
 */
export function generatePhasePrompt(
  project: Project,
  phaseSteps: ProjectStep[],
  businessContext?: BusinessContext,
  techStack?: TechStackItem[]
): string {
  if (phaseSteps.length === 0) return ''

  const phaseName = phaseSteps[0].phase

  let prompt = `# Phase Instructions: ${phaseName}\n\n`
  prompt += `Project: **${project.name}**\n\n`
  prompt += `---\n\n`

  if (businessContext) {
    prompt += `## Business Context\n\n`
    prompt += `${businessContext.vision}\n\n`
    prompt += `**Target Users:** ${businessContext.target_market}\n\n`
  }

  prompt += `## Phase Overview\n\n`
  prompt += `This phase contains ${phaseSteps.length} steps:\n\n`

  phaseSteps.forEach((step, idx) => {
    const status = step.status === 'completed' ? '✅' : step.status === 'in-progress' ? '🔄' : '⏸️'
    prompt += `${idx + 1}. ${status} **${step.title}** (${step.progress}%)\n`
  })

  prompt += `\n---\n\n`
  prompt += `## Execution Order\n\n`

  phaseSteps.forEach((step, idx) => {
    prompt += `### Step ${idx + 1}: ${step.title}\n\n`
    prompt += `**Status:** ${step.status} | **Progress:** ${step.progress}%\n\n`
    prompt += `${step.description}\n\n`

    if (step.tasks && Array.isArray(step.tasks)) {
      prompt += `**Tasks:**\n`
      step.tasks.forEach((task) => {
        prompt += `- ${task}\n`
      })
      prompt += `\n`
    }

    prompt += `---\n\n`
  })

  return prompt
}

/**
 * Export options for different AI tools
 */
export function formatForTool(prompt: string, tool: 'claude' | 'cursor' | 'gpt' | 'v0'): string {
  switch (tool) {
    case 'claude':
      return `<task>\n${prompt}\n</task>`
    case 'cursor':
      return `// AI Task Instructions\n${prompt}`
    case 'v0':
      return prompt.replace(/^#/gm, '##') // Bump headers for v0
    case 'gpt':
    default:
      return prompt
  }
}
