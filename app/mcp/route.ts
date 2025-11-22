/**
 * MCP Server Route for AI Project Planner
 * Exposes project context and tools to AI agents via Model Context Protocol
 *
 * Following the pattern from vercel-labs/mcp-for-next.js
 */

import { createMcpHandler } from "mcp-handler"
import { z } from "zod"
import { sql } from "@/lib/db/client"

// Create MCP handler with tools and resources
const handler = createMcpHandler(
  async (server) => {
    // Tool: Get project context
    server.tool(
      "get_project_context",
      "Get full context for a project including business context, tech stack, and current phase",
      {
        projectId: z.string().describe("The project ID"),
      },
      async ({ projectId }) => {
        try {
          const [project] = await sql`
            SELECT p.*, bc.vision, bc.target_market, bc.primary_use_case
            FROM projects p
            LEFT JOIN business_context bc ON p.id = bc.project_id
            WHERE p.id = ${projectId}
          `

          if (!project) {
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({ error: "Project not found" })
              }],
            }
          }

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                project: {
                  id: project.id,
                  name: project.name,
                  description: project.description,
                  current_phase: project.current_phase,
                  vision: project.vision,
                  target_market: project.target_market,
                  primary_use_case: project.primary_use_case,
                }
              }, null, 2)
            }],
          }
        } catch (error: any) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ error: error.message })
            }],
          }
        }
      }
    )

    // Tool: List all projects
    server.tool(
      "list_projects",
      "List all projects in the system",
      {},
      async () => {
        try {
          const projects = await sql`
            SELECT id, name, description, current_phase, created_at
            FROM projects
            ORDER BY created_at DESC
          `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ projects }, null, 2)
            }],
          }
        } catch (error: any) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ error: error.message })
            }],
          }
        }
      }
    )

    // Tool: Get project execution plan
    server.tool(
      "get_execution_plan",
      "Get the execution plan (steps and dependencies) for a project",
      {
        projectId: z.string().describe("The project ID"),
      },
      async ({ projectId }) => {
        try {
          const steps = await sql`
            SELECT ps.*,
                   array_agg(DISTINCT sd.depends_on_step_id) as dependencies
            FROM project_steps ps
            LEFT JOIN step_dependencies sd ON ps.id = sd.step_id
            WHERE ps.project_id = ${projectId}
            GROUP BY ps.id
            ORDER BY ps.step_order
          `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ steps }, null, 2)
            }],
          }
        } catch (error: any) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ error: error.message })
            }],
          }
        }
      }
    )

    // Tool: Add progress note
    server.tool(
      "add_progress_note",
      "Add a progress note to track development progress",
      {
        projectId: z.string().describe("The project ID"),
        stepId: z.string().optional().describe("The step ID (optional)"),
        noteType: z.enum(["milestone", "blocker", "decision", "update"]).describe("Type of note"),
        title: z.string().optional().describe("Note title"),
        content: z.string().describe("Note content"),
      },
      async ({ projectId, stepId, noteType, title, content }) => {
        try {
          const [note] = await sql`
            INSERT INTO progress_notes (
              project_id, step_id, author_type, author_name,
              note_type, title, content
            ) VALUES (
              ${projectId}, ${stepId || null}, 'agent', 'mcp-client',
              ${noteType}, ${title || null}, ${content}
            )
            RETURNING *
          `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ success: true, note }, null, 2)
            }],
          }
        } catch (error: any) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ error: error.message })
            }],
          }
        }
      }
    )
  },
  {
    capabilities: {
      tools: {
        get_project_context: {
          description: "Get full context for a project",
        },
        list_projects: {
          description: "List all projects",
        },
        get_execution_plan: {
          description: "Get project execution plan",
        },
        add_progress_note: {
          description: "Add a progress note",
        },
      },
    },
  },
  {
    basePath: "/mcp",
    verboseLogs: process.env.NODE_ENV === "development",
    maxDuration: 60,
    disableSse: true, // Use simple HTTP polling instead of SSE
  }
)

// Export the same handler for GET, POST, and DELETE
export { handler as GET, handler as POST, handler as DELETE }
