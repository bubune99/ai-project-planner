import { sql } from "@/lib/db/client"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")
    const stepId = searchParams.get("stepId")
    const type = searchParams.get("type") || "task"

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 })
    }

    // Fetch project data
    const projectResult = await sql`
      SELECT * FROM projects WHERE id = ${projectId}
    `
    const project = projectResult[0]

    // Fetch business context
    const businessContextResult = await sql`
      SELECT * FROM business_context WHERE project_id = ${projectId}
    `
    const businessContext = businessContextResult[0]

    // Fetch tech stack
    const techStackResult = await sql`
      SELECT * FROM tech_stack_items 
      WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY order_index
    `

    let prompt = ""
    const promptData: any = {
      hasBusinessContext: !!businessContext,
      hasTechStack: techStackResult.length > 0,
      hasDependencies: false,
      hasAcceptanceCriteria: false,
    }

    if (type === "task" && stepId) {
      // Generate task-specific prompt
      const stepResult = await sql`
        SELECT * FROM project_steps WHERE id = ${stepId}
      `
      const step = stepResult[0]

      // Get dependencies
      const depsResult = await sql`
        SELECT ps.* FROM project_steps ps
        JOIN step_dependencies sd ON ps.id = sd.depends_on_step_id
        WHERE sd.step_id = ${stepId} AND ps.status = 'completed'
      `

      promptData.hasDependencies = depsResult.length > 0
      promptData.hasAcceptanceCriteria = step.acceptance_criteria && Object.keys(step.acceptance_criteria).length > 0

      prompt = generateTaskPrompt(project, step, businessContext, techStackResult, depsResult)
    } else if (type === "phase") {
      // Generate phase-specific prompt
      const stepsResult = await sql`
        SELECT * FROM project_steps 
        WHERE project_id = ${projectId} AND phase = ${searchParams.get("phase")}
        ORDER BY order_index
      `
      prompt = generatePhasePrompt(project, stepsResult, businessContext, techStackResult)
    } else {
      // Generate project-level prompt
      prompt = generateProjectPrompt(project, businessContext, techStackResult)
    }

    return NextResponse.json({
      prompt,
      ...promptData,
    })
  } catch (error: any) {
    console.error("Generate prompt error:", error)
    return NextResponse.json({ error: "Failed to generate prompt", details: error.message }, { status: 500 })
  }
}

function generateTaskPrompt(
  project: any,
  step: any,
  businessContext: any,
  techStack: any[],
  completedDeps: any[],
): string {
  return `# AI Agent Instructions: ${step.title}

## Project Context

**Project:** ${project.name}
**Description:** ${project.description}

${
  businessContext
    ? `
### Business Vision
${businessContext.vision}

### Target Users
${businessContext.target_market}

### Primary Use Case
${businessContext.primary_use_case}

### Competitive Advantage
${businessContext.competitive_advantage}
`
    : ""
}

## Technical Stack

${techStack
  .map(
    (tech) => `- **${tech.name}** (${tech.category})${tech.version ? ` v${tech.version}` : ""}
  ${tech.rationale ? `Rationale: ${tech.rationale}` : ""}
  ${tech.documentation_url ? `Docs: ${tech.documentation_url}` : ""}`,
  )
  .join("\n")}

## Your Task

**Title:** ${step.title}
**Phase:** ${step.phase || "N/A"}
**Stage:** ${step.stage || "N/A"}
**Priority:** ${step.priority || "medium"}
**Estimated Time:** ${step.estimated_hours || "TBD"} hours

### Description
${step.description}

${
  step.tasks && step.tasks.length > 0
    ? `
### Tasks to Complete
${step.tasks.map((task: string, idx: number) => `${idx + 1}. ${task}`).join("\n")}
`
    : ""
}

${
  completedDeps.length > 0
    ? `
## Dependencies Completed
${completedDeps.map((dep: any) => `✅ ${dep.title}`).join("\n")}
`
    : ""
}

${
  step.acceptance_criteria && Object.keys(step.acceptance_criteria).length > 0
    ? `
## Acceptance Criteria
${JSON.stringify(step.acceptance_criteria, null, 2)}
`
    : ""
}

## When Done

When you complete this task:
1. Mark progress in your work log
2. Document any decisions made
3. Report any blockers encountered
4. Mark this step as complete

**MCP Command:** \`mark_step_complete(stepId: "${step.id}", hours: actual_hours_spent)\`

---

Good luck! Remember to document your progress as you work.
`
}

function generatePhasePrompt(project: any, steps: any[], businessContext: any, techStack: any[]): string {
  return `# Phase Instructions: ${project.name}

## Business Context
${businessContext?.vision || project.description}

## Phase Steps

${steps
  .map(
    (step, idx) => `
### ${idx + 1}. ${step.title}
**Status:** ${step.status}
**Priority:** ${step.priority}

${step.description}

${step.tasks && step.tasks.length > 0 ? `Tasks:\n${step.tasks.map((t: string) => `- ${t}`).join("\n")}` : ""}
`,
  )
  .join("\n")}

## Tech Stack
${techStack.map((tech) => `- ${tech.name}`).join("\n")}
`
}

function generateProjectPrompt(project: any, businessContext: any, techStack: any[]): string {
  return `# Project Brief: ${project.name}

${businessContext?.vision || project.description}

## Tech Stack
${techStack.map((tech) => `- ${tech.name}`).join("\n")}
`
}
