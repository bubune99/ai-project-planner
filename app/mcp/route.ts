/**
 * MCP Server Route for AI Project Planner
 * Exposes project context and tools to AI agents via Model Context Protocol
 *
 * Following the pattern from vercel-labs/mcp-for-next.js
 */

import { createMcpHandler } from "mcp-handler"
import { z } from "zod"
import { sql } from "@/lib/db/client"
import { NextRequest } from "next/server"

// Simple API key authentication for production
function authenticateRequest(request: NextRequest): boolean {
  // In development, allow all requests
  if (process.env.NODE_ENV === 'development') {
    return true
  }

  // In production, require API key
  const apiKey = request.headers.get('x-api-key')
  const validKey = process.env.MCP_API_KEY

  if (!validKey) {
    console.warn('MCP_API_KEY not set in production - MCP server is unprotected!')
    return true // Allow if no key configured (for initial setup)
  }

  return apiKey === validKey
}

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

    // Tool: Create a new project
    server.tool(
      "create_project",
      "Create a new project with initial details",
      {
        name: z.string().describe("Project name"),
        description: z.string().describe("Project description"),
        vision: z.string().optional().describe("Project vision/goal"),
        targetMarket: z.string().optional().describe("Target market"),
        primaryUseCase: z.string().optional().describe("Primary use case"),
      },
      async ({ name, description, vision, targetMarket, primaryUseCase }) => {
        try {
          const [project] = await sql`
            INSERT INTO projects (name, description, status, priority, current_phase)
            VALUES (${name}, ${description}, 'planning', 'medium', 'ideation')
            RETURNING *
          `

          // Initialize business context if provided
          if (vision || targetMarket || primaryUseCase) {
            await sql`
              INSERT INTO business_context (project_id, vision, target_market, primary_use_case, revenue_model, competitive_advantage)
              VALUES (
                ${project.id},
                ${vision || 'TBD'},
                ${targetMarket || 'TBD'},
                ${primaryUseCase || 'TBD'},
                'TBD',
                'TBD'
              )
            `
          }

          // Create initial phase
          await sql`
            INSERT INTO project_phases (project_id, phase_name, status, description)
            VALUES (${project.id}, 'ideation', 'active', 'Initial phase')
          `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ success: true, project }, null, 2)
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

    // Tool: List phases
    server.tool(
      "list_phases",
      "List all phases for a project",
      {
        projectId: z.string().describe("The project ID"),
      },
      async ({ projectId }) => {
        try {
          const phases = await sql`
            SELECT * FROM project_phases
            WHERE project_id = ${projectId}
            ORDER BY started_at ASC
          `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ phases }, null, 2)
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

    // Tool: Transition phase
    server.tool(
      "transition_phase",
      "Transition a project to the next phase",
      {
        projectId: z.string().describe("The project ID"),
        newPhase: z.enum(['ideation', 'architecture', 'construction', 'testing', 'deployment', 'maintenance']).describe("The new phase"),
        reason: z.string().describe("Reason for transition"),
      },
      async ({ projectId, newPhase, reason }) => {
        try {
          // Use the DB function we created in migration 015
          const [result] = await sql`
            SELECT * FROM transition_to_phase(
              ${projectId},
              ${newPhase},
              'mcp-agent',
              ${reason}
            )
          `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ success: true, result }, null, 2)
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
              AND ps.deleted_at IS NULL
            GROUP BY ps.id
            ORDER BY ps.order_index
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

    // Tool: Get project tasks (for Kanban/Gantt)
    server.tool(
      "get_project_tasks",
      "Get all tasks for a project with detailed status and assignment info",
      {
        projectId: z.string().describe("The project ID"),
      },
      async ({ projectId }) => {
        try {
          const tasks = await sql`
            SELECT
              ps.*,
              array_agg(DISTINCT sd.depends_on_step_id) as dependencies,
              (
                SELECT json_build_object(
                  'id', a.id,
                  'name', a.name,
                  'status', a.status
                )
                FROM agents a
                WHERE a.name = ps.assigned_agent
              ) as agent_details
            FROM project_steps ps
            LEFT JOIN step_dependencies sd ON ps.id = sd.step_id
            WHERE ps.project_id = ${projectId}
            GROUP BY ps.id
            ORDER BY ps.order_index ASC
          `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ tasks }, null, 2)
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

    // Tool: Assign task to agent
    server.tool(
      "assign_task",
      "Assign a task to an AI agent",
      {
        taskId: z.string().describe("The task ID"),
        agentName: z.enum(['v0', 'claude', 'gemini', 'gpt']).describe("The agent name"),
      },
      async ({ taskId, agentName }) => {
        try {
          const [result] = await sql`
            SELECT * FROM assign_task_to_agent(${taskId}, ${agentName})
          `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ success: true, result }, null, 2)
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

    // Tool: List documents
    server.tool(
      "list_documents",
      "List documents for a project, optionally filtered by type",
      {
        projectId: z.string().describe("The project ID"),
        type: z.enum(['file', 'page']).optional().describe("Filter by document type (file=Blob storage, page=Knowledge Base)"),
      },
      async ({ projectId, type }) => {
        try {
          // Build query based on type filter
          // Note: Using blob_key (Vercel Blob) instead of s3_key
          let documents
          if (type === 'file') {
            documents = await sql`
              SELECT id, title, doc_type, category, created_at, updated_at,
                     'file' as type
              FROM documents
              WHERE project_id = ${projectId}
                AND deleted_at IS NULL
                AND blob_key IS NOT NULL
              ORDER BY created_at DESC
            `
          } else if (type === 'page') {
            documents = await sql`
              SELECT id, title, doc_type, category, created_at, updated_at,
                     'page' as type
              FROM documents
              WHERE project_id = ${projectId}
                AND deleted_at IS NULL
                AND blob_key IS NULL
              ORDER BY created_at DESC
            `
          } else {
            documents = await sql`
              SELECT id, title, doc_type, category, created_at, updated_at,
                     CASE WHEN blob_key IS NOT NULL THEN 'file' ELSE 'page' END as type
              FROM documents
              WHERE project_id = ${projectId}
                AND deleted_at IS NULL
              ORDER BY created_at DESC
            `
          }

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ documents }, null, 2)
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

    // Tool: Read document content
    server.tool(
      "read_document",
      "Read the content of a document (for pages) or get download URL (for files)",
      {
        documentId: z.string().describe("The document ID"),
      },
      async ({ documentId }) => {
        try {
          const [doc] = await sql`
            SELECT * FROM documents WHERE id = ${documentId}
          `

          if (!doc) throw new Error('Document not found')

          // Using blob_key/blob_url (Vercel Blob) instead of s3_key
          const result = {
            id: doc.id,
            title: doc.title,
            type: doc.blob_key ? 'file' : 'page',
            content: doc.content, // Will be null for files
            url: doc.blob_url || (doc.blob_key ? `/api/documents/${doc.id}/download` : null),
            metadata: doc.metadata
          }

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ document: result }, null, 2)
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

    // Tool: Create document (Knowledge Base Page)
    server.tool(
      "create_document",
      "Create a new knowledge base page",
      {
        projectId: z.string().describe("The project ID"),
        title: z.string().describe("Document title"),
        content: z.string().describe("Markdown content"),
        category: z.string().optional().describe("Category"),
      },
      async ({ projectId, title, content, category }) => {
        try {
          // Note: Using blob_key (Vercel Blob) instead of s3_key
          const [doc] = await sql`
            INSERT INTO documents(
              project_id, title, content, category,
              doc_type, blob_key, file_type, file_size
            ) VALUES(
              ${projectId}, ${title}, ${content}, ${category || 'general'},
              'page', NULL, NULL, NULL
            )
            RETURNING *
          `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ success: true, document: doc }, null, 2)
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

    // Tool: List agents
    server.tool(
      "list_agents",
      "List all AI agents and their current status",
      {},
      async () => {
        try {
          const agents = await sql`
            SELECT a.*, ps.title as current_task_title
            FROM agents a
            LEFT JOIN project_steps ps ON a.current_task_id = ps.id
            ORDER BY a.name
      `

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ agents }, null, 2)
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
        create_project: {
          description: "Create a new project",
        },
        list_phases: {
          description: "List project phases",
        },
        transition_phase: {
          description: "Transition to next phase",
        },
        get_execution_plan: {
          description: "Get project execution plan",
        },
        add_progress_note: {
          description: "Add a progress note",
        },
        get_project_tasks: {
          description: "Get project tasks for Kanban",
        },
        assign_task: {
          description: "Assign task to agent",
        },
        list_documents: {
          description: "List documents",
        },
        read_document: {
          description: "Read document content",
        },
        create_document: {
          description: "Create knowledge base page",
        },
        list_agents: {
          description: "List AI agents",
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

// Export handler with authentication wrapper
export const GET = async (request: NextRequest) => {
  if (!authenticateRequest(request)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized - Invalid or missing API key' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return handler(request)
}

export const POST = async (request: NextRequest) => {
  if (!authenticateRequest(request)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized - Invalid or missing API key' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return handler(request)
}

export const DELETE = async (request: NextRequest) => {
  if (!authenticateRequest(request)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized - Invalid or missing API key' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return handler(request)
}
