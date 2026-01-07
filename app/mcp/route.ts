/**
 * MCP Server Route for AI Project Planner
 * Exposes project context and tools to AI agents via Model Context Protocol
 *
 * Authentication: Per-user API keys (aipp_*) with strict data isolation
 * Each user can only access their own projects, documents, and data
 *
 * Following the pattern from vercel-labs/mcp-for-next.js
 */

import { createMcpHandler } from "mcp-handler"
import { z } from "zod"
import { sql } from "@/lib/db/client"
import { NextRequest } from "next/server"
import {
  validateMcpApiKey,
  runWithMcpContext,
  getMcpUserId,
  getMcpContext,
  verifyMcpProjectOwnership,
  verifyMcpStepAccess,
  verifyMcpDocumentOwnership,
  requireMcpScope,
  type McpContext,
} from "@/lib/auth/mcp-context"

/**
 * Authenticate MCP request and return user context
 *
 * Supports:
 * - Authorization: Bearer aipp_xxxxx
 * - X-API-Key: aipp_xxxxx
 */
async function authenticateRequest(
  request: NextRequest
): Promise<McpContext | null> {
  // Check Authorization header first (preferred)
  const authHeader = request.headers.get("authorization")
  if (authHeader) {
    const context = await validateMcpApiKey(authHeader)
    if (context) return context
  }

  // Fall back to X-API-Key header
  const xApiKey = request.headers.get("x-api-key")
  if (xApiKey) {
    const context = await validateMcpApiKey(xApiKey)
    if (context) return context
  }

  // In development only: allow requests if no key provided but env var is set
  // This maintains backward compatibility during development
  if (process.env.NODE_ENV === "development") {
    const devKey = process.env.MCP_API_KEY
    if (devKey && (authHeader === `Bearer ${devKey}` || xApiKey === devKey)) {
      // Dev mode with old shared key - return system user context
      console.warn(
        "MCP: Using deprecated MCP_API_KEY - please switch to per-user API keys"
      )
      return {
        userId: "00000000-0000-0000-0000-000000000001", // System user
        apiKeyId: "dev-key",
        scopes: ["read", "write"],
      }
    }
  }

  return null
}

// Create MCP handler with tools and resources
const handler = createMcpHandler(
  async (server) => {
    // ==========================================
    // Tool: Get project context
    // ==========================================
    server.tool(
      "get_project_context",
      "Get full context for a project including business context, tech stack, and current phase",
      {
        projectId: z.string().describe("The project ID"),
      },
      async ({ projectId }) => {
        try {
          const userId = getMcpUserId()

          // Verify ownership
          const isOwner = await verifyMcpProjectOwnership(projectId)
          if (!isOwner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Project not found or access denied",
                  }),
                },
              ],
            }
          }

          const [project] = await sql`
            SELECT p.*, bc.vision, bc.target_market, bc.primary_use_case
            FROM projects p
            LEFT JOIN business_context bc ON p.id = bc.project_id
            WHERE p.id = ${projectId} AND p.user_id = ${userId}
          `

          if (!project) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: "Project not found" }),
                },
              ],
            }
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    project: {
                      id: project.id,
                      name: project.name,
                      description: project.description,
                      current_phase: project.current_phase,
                      vision: project.vision,
                      target_market: project.target_market,
                      primary_use_case: project.primary_use_case,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: Create a new project
    // ==========================================
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
          requireMcpScope("write")
          const userId = getMcpUserId()

          const [project] = await sql`
            INSERT INTO projects (name, description, status, priority, current_phase, user_id)
            VALUES (${name}, ${description}, 'planning', 'medium', 'ideation', ${userId})
            RETURNING *
          `

          // Initialize business context if provided
          if (vision || targetMarket || primaryUseCase) {
            await sql`
              INSERT INTO business_context (project_id, vision, target_market, primary_use_case, revenue_model, competitive_advantage)
              VALUES (
                ${project.id},
                ${vision || "TBD"},
                ${targetMarket || "TBD"},
                ${primaryUseCase || "TBD"},
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
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, project }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: List all projects (user's projects only)
    // ==========================================
    server.tool(
      "list_projects",
      "List all your projects",
      {},
      async () => {
        try {
          const userId = getMcpUserId()

          const projects = await sql`
            SELECT id, name, description, current_phase, created_at
            FROM projects
            WHERE user_id = ${userId}
            ORDER BY created_at DESC
          `

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ projects }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: List phases
    // ==========================================
    server.tool(
      "list_phases",
      "List all phases for a project",
      {
        projectId: z.string().describe("The project ID"),
      },
      async ({ projectId }) => {
        try {
          const userId = getMcpUserId()

          // Verify ownership
          const isOwner = await verifyMcpProjectOwnership(projectId)
          if (!isOwner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Project not found or access denied",
                  }),
                },
              ],
            }
          }

          const phases = await sql`
            SELECT pp.* FROM project_phases pp
            JOIN projects p ON pp.project_id = p.id
            WHERE pp.project_id = ${projectId} AND p.user_id = ${userId}
            ORDER BY pp.started_at ASC
          `

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ phases }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: Transition phase
    // ==========================================
    server.tool(
      "transition_phase",
      "Transition a project to the next phase",
      {
        projectId: z.string().describe("The project ID"),
        newPhase: z
          .enum([
            "ideation",
            "architecture",
            "construction",
            "testing",
            "deployment",
            "maintenance",
          ])
          .describe("The new phase"),
        reason: z.string().describe("Reason for transition"),
      },
      async ({ projectId, newPhase, reason }) => {
        try {
          requireMcpScope("write")

          // Verify ownership
          const isOwner = await verifyMcpProjectOwnership(projectId)
          if (!isOwner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Project not found or access denied",
                  }),
                },
              ],
            }
          }

          const context = getMcpContext()

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
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, result }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: Get project execution plan
    // ==========================================
    server.tool(
      "get_execution_plan",
      "Get the execution plan (steps and dependencies) for a project",
      {
        projectId: z.string().describe("The project ID"),
      },
      async ({ projectId }) => {
        try {
          // Verify ownership
          const isOwner = await verifyMcpProjectOwnership(projectId)
          if (!isOwner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Project not found or access denied",
                  }),
                },
              ],
            }
          }

          const userId = getMcpUserId()

          const steps = await sql`
            SELECT ps.*,
                   array_agg(DISTINCT sd.depends_on_step_id) as dependencies
            FROM project_steps ps
            JOIN projects p ON ps.project_id = p.id
            LEFT JOIN step_dependencies sd ON ps.id = sd.step_id
            WHERE ps.project_id = ${projectId}
              AND p.user_id = ${userId}
              AND ps.deleted_at IS NULL
            GROUP BY ps.id
            ORDER BY ps.order_index
          `

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ steps }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: Add progress note
    // ==========================================
    server.tool(
      "add_progress_note",
      "Add a progress note to track development progress",
      {
        projectId: z.string().describe("The project ID"),
        stepId: z.string().optional().describe("The step ID (optional)"),
        noteType: z
          .enum(["milestone", "blocker", "decision", "update"])
          .describe("Type of note"),
        title: z.string().optional().describe("Note title"),
        content: z.string().describe("Note content"),
      },
      async ({ projectId, stepId, noteType, title, content }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify project ownership
          const isOwner = await verifyMcpProjectOwnership(projectId)
          if (!isOwner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Project not found or access denied",
                  }),
                },
              ],
            }
          }

          // If stepId provided, verify step access
          if (stepId) {
            const hasAccess = await verifyMcpStepAccess(stepId)
            if (!hasAccess) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      error: "Step not found or access denied",
                    }),
                  },
                ],
              }
            }
          }

          const [note] = await sql`
            INSERT INTO progress_notes (
              project_id, step_id, author_type, author_name,
              note_type, title, content, user_id
            ) VALUES (
              ${projectId}, ${stepId || null}, 'agent', 'mcp-client',
              ${noteType}, ${title || null}, ${content}, ${userId}
            )
            RETURNING *
          `

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, note }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: Get project tasks (for Kanban/Gantt)
    // ==========================================
    server.tool(
      "get_project_tasks",
      "Get all tasks for a project with detailed status and assignment info",
      {
        projectId: z.string().describe("The project ID"),
      },
      async ({ projectId }) => {
        try {
          // Verify ownership
          const isOwner = await verifyMcpProjectOwnership(projectId)
          if (!isOwner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Project not found or access denied",
                  }),
                },
              ],
            }
          }

          const userId = getMcpUserId()

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
            JOIN projects p ON ps.project_id = p.id
            LEFT JOIN step_dependencies sd ON ps.id = sd.step_id
            WHERE ps.project_id = ${projectId}
              AND p.user_id = ${userId}
            GROUP BY ps.id
            ORDER BY ps.order_index ASC
          `

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ tasks }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: Assign task to agent
    // ==========================================
    server.tool(
      "assign_task",
      "Assign a task to an AI agent",
      {
        taskId: z.string().describe("The task ID"),
        agentName: z
          .enum(["v0", "claude", "gemini", "gpt"])
          .describe("The agent name"),
      },
      async ({ taskId, agentName }) => {
        try {
          requireMcpScope("write")

          // Verify step access
          const hasAccess = await verifyMcpStepAccess(taskId)
          if (!hasAccess) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Task not found or access denied",
                  }),
                },
              ],
            }
          }

          const [result] = await sql`
            SELECT * FROM assign_task_to_agent(${taskId}, ${agentName})
          `

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, result }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: List documents
    // ==========================================
    server.tool(
      "list_documents",
      "List documents for a project, optionally filtered by type",
      {
        projectId: z.string().describe("The project ID"),
        type: z
          .enum(["file", "page"])
          .optional()
          .describe(
            "Filter by document type (file=Blob storage, page=Knowledge Base)"
          ),
      },
      async ({ projectId, type }) => {
        try {
          // Verify project ownership
          const isOwner = await verifyMcpProjectOwnership(projectId)
          if (!isOwner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Project not found or access denied",
                  }),
                },
              ],
            }
          }

          const userId = getMcpUserId()

          // Build query based on type filter
          let documents
          if (type === "file") {
            documents = await sql`
              SELECT d.id, d.title, d.doc_type, d.category, d.created_at, d.updated_at,
                     'file' as type
              FROM documents d
              JOIN projects p ON d.project_id = p.id
              WHERE d.project_id = ${projectId}
                AND d.deleted_at IS NULL
                AND d.blob_key IS NOT NULL
                AND p.user_id = ${userId}
              ORDER BY d.created_at DESC
            `
          } else if (type === "page") {
            documents = await sql`
              SELECT d.id, d.title, d.doc_type, d.category, d.created_at, d.updated_at,
                     'page' as type
              FROM documents d
              JOIN projects p ON d.project_id = p.id
              WHERE d.project_id = ${projectId}
                AND d.deleted_at IS NULL
                AND d.blob_key IS NULL
                AND p.user_id = ${userId}
              ORDER BY d.created_at DESC
            `
          } else {
            documents = await sql`
              SELECT d.id, d.title, d.doc_type, d.category, d.created_at, d.updated_at,
                     CASE WHEN d.blob_key IS NOT NULL THEN 'file' ELSE 'page' END as type
              FROM documents d
              JOIN projects p ON d.project_id = p.id
              WHERE d.project_id = ${projectId}
                AND d.deleted_at IS NULL
                AND p.user_id = ${userId}
              ORDER BY d.created_at DESC
            `
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ documents }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: Read document content
    // ==========================================
    server.tool(
      "read_document",
      "Read the content of a document (for pages) or get download URL (for files)",
      {
        documentId: z.string().describe("The document ID"),
      },
      async ({ documentId }) => {
        try {
          // Verify document ownership
          const isOwner = await verifyMcpDocumentOwnership(documentId)
          if (!isOwner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Document not found or access denied",
                  }),
                },
              ],
            }
          }

          const userId = getMcpUserId()

          const [doc] = await sql`
            SELECT d.* FROM documents d
            WHERE d.id = ${documentId} AND d.user_id = ${userId}
          `

          if (!doc) throw new Error("Document not found")

          const result = {
            id: doc.id,
            title: doc.title,
            type: doc.blob_key ? "file" : "page",
            content: doc.content, // Will be null for files
            url:
              doc.blob_url ||
              (doc.blob_key ? `/api/documents/${doc.id}/download` : null),
            metadata: doc.metadata,
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ document: result }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: Create document (Knowledge Base Page)
    // ==========================================
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
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify project ownership
          const isOwner = await verifyMcpProjectOwnership(projectId)
          if (!isOwner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "Project not found or access denied",
                  }),
                },
              ],
            }
          }

          const [doc] = await sql`
            INSERT INTO documents(
              project_id, title, content, category,
              doc_type, blob_key, file_type, file_size, user_id
            ) VALUES(
              ${projectId}, ${title}, ${content}, ${category || "general"},
              'page', NULL, NULL, NULL, ${userId}
            )
            RETURNING *
          `

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, document: doc }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )

    // ==========================================
    // Tool: List agents
    // ==========================================
    server.tool(
      "list_agents",
      "List all AI agents and their current status",
      {},
      async () => {
        try {
          // Agents are shared across all users (global resource)
          const agents = await sql`
            SELECT a.*, ps.title as current_task_title
            FROM agents a
            LEFT JOIN project_steps ps ON a.current_task_id = ps.id
            ORDER BY a.name
          `

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ agents }, null, 2),
              },
            ],
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage }),
              },
            ],
          }
        }
      }
    )
  },
  {},
  {
    basePath: "/mcp",
    verboseLogs: process.env.NODE_ENV === "development",
    maxDuration: 60,
    disableSse: true, // Use simple HTTP polling instead of SSE
  }
)

/**
 * Handle MCP request with authentication
 */
async function handleWithAuth(request: NextRequest) {
  const context = await authenticateRequest(request)

  if (!context) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message:
          "Invalid or missing API key. Use Authorization: Bearer aipp_xxxxx header.",
        hint: "Generate an API key from your dashboard settings.",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  // Run handler with MCP context
  return runWithMcpContext(context, () => handler(request))
}

// Export handlers with authentication wrapper
export const GET = handleWithAuth
export const POST = handleWithAuth
export const DELETE = handleWithAuth
