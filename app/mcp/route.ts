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
  verifyMcpProjectAccess,
  requireMcpProjectWriteAccess,
  verifyMcpStepAccess,
  verifyMcpDocumentOwnership,
  requireMcpScope,
  getActiveProjectId,
  setActiveProject,
  findProjectByGitRemote,
  findProjectByWorkspacePath,
  updateProjectWorkspace,
  type McpContext,
  type ProjectAccessResult,
} from "@/lib/auth/mcp-context"

// ==========================================
// Token Optimization Utilities
// ==========================================

/**
 * Compact JSON response - removes whitespace for ~30-40% token savings
 */
function compactJson(data: unknown): string {
  return JSON.stringify(data)
}

/**
 * Truncate string to max length with ellipsis
 */
function truncate(str: string | null | undefined, maxLength: number): string | null {
  if (!str) return null
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + "..."
}

/**
 * Pick only specified fields from an object
 */
function pickFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): Partial<T> {
  const result: Partial<T> = {}
  for (const field of fields) {
    if (field in obj) {
      result[field as keyof T] = obj[field as keyof T]
    }
  }
  return result
}

/**
 * Create brief summary of a project
 */
function projectBrief(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name,
    phase: p.current_phase,
    status: p.status,
  }
}

/**
 * Create brief summary of a task/step
 */
function taskBrief(t: Record<string, unknown>) {
  return {
    id: t.id,
    title: truncate(t.title as string, 60),
    status: t.status,
    agent: t.assigned_agent,
  }
}

/**
 * Create brief summary of a document
 */
function docBrief(d: Record<string, unknown>) {
  return {
    id: d.id,
    title: truncate(d.title as string, 50),
    type: d.type || (d.blob_key ? "file" : "page"),
  }
}

/**
 * Standard MCP response wrapper - always compact
 */
function mcpResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: compactJson(data) }],
  }
}

/**
 * Standard MCP error response
 */
function mcpError(message: string) {
  return {
    content: [{ type: "text" as const, text: compactJson({ error: message }) }],
  }
}

// Default pagination limits
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * Resolve projectId with fallback to active project
 * Returns [resolvedId, error] tuple
 */
function resolveProjectId(projectId: string | undefined): [string | null, string | null] {
  const resolvedId = projectId ?? getActiveProjectId()
  if (!resolvedId) {
    return [null, "No project specified. Use set_active_project first or pass projectId."]
  }
  return [resolvedId, null]
}

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
      "Get context for a project. Uses active project if projectId not specified.",
      {
        projectId: z.string().optional().describe("Project ID (uses active project if not specified)"),
        brief: z.boolean().optional().describe("Return minimal fields only"),
        fields: z.array(z.string()).optional().describe("Specific fields to return (e.g., ['name', 'phase'])"),
      },
      async ({ projectId, brief, fields }) => {
        try {
          const userId = getMcpUserId()
          const [resolvedId, error] = resolveProjectId(projectId)
          if (!resolvedId) return mcpError(error!)

          const access = await verifyMcpProjectAccess(resolvedId)
          if (!access.hasAccess) return mcpError("Project not found or access denied")

          const [project] = await sql`
            SELECT p.id, p.name, p.description, p.current_phase, p.status,
                   bc.vision, bc.target_market, bc.primary_use_case
            FROM projects p
            LEFT JOIN business_context bc ON p.id = bc.project_id
            WHERE p.id = ${resolvedId}
          `

          if (!project) return mcpError("Project not found")

          // Build response based on mode
          let result: Record<string, unknown>
          if (brief) {
            result = projectBrief(project)
          } else if (fields && fields.length > 0) {
            result = pickFields(project, fields)
          } else {
            result = {
              id: project.id,
              name: project.name,
              description: truncate(project.description as string, 200),
              phase: project.current_phase,
              status: project.status,
              vision: truncate(project.vision as string, 150),
              target_market: truncate(project.target_market as string, 100),
              use_case: truncate(project.primary_use_case as string, 100),
            }
          }

          return mcpResponse({
            project: result,
            access: { role: access.role, canWrite: access.canWrite }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
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
            RETURNING id, name, status, current_phase
          `

          if (vision || targetMarket || primaryUseCase) {
            await sql`
              INSERT INTO business_context (project_id, vision, target_market, primary_use_case, revenue_model, competitive_advantage)
              VALUES (${project.id}, ${vision || "TBD"}, ${targetMarket || "TBD"}, ${primaryUseCase || "TBD"}, 'TBD', 'TBD')
            `
          }

          await sql`
            INSERT INTO project_phases (project_id, phase_name, status, description)
            VALUES (${project.id}, 'ideation', 'active', 'Initial phase')
          `

          // Return minimal response - just ID and confirmation
          return mcpResponse({
            created: true,
            id: project.id,
            name: project.name,
            phase: project.current_phase
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: List all projects (owned + shared)
    // ==========================================
    server.tool(
      "list_projects",
      "List your projects (owned and shared). Use brief=true for minimal response. Use includeShared=false for owned only.",
      {
        brief: z.boolean().optional().describe("Return only id, name, phase, status (saves ~70% tokens)"),
        includeShared: z.boolean().optional().describe("Include projects shared with you (default: true)"),
        limit: z.number().optional().describe(`Max results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
        offset: z.number().optional().describe("Skip N results for pagination"),
      },
      async ({ brief, includeShared = true, limit, offset }) => {
        try {
          const userId = getMcpUserId()
          const actualLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT)
          const actualOffset = offset || 0

          // Query includes both owned and shared projects
          const projects = includeShared
            ? await sql`
                SELECT DISTINCT p.id, p.name, p.description, p.current_phase, p.status, p.created_at,
                       CASE WHEN p.user_id = ${userId} THEN 'owner' ELSE pc.role END as my_role
                FROM projects p
                LEFT JOIN project_collaborators pc ON p.id = pc.project_id AND pc.user_id = ${userId}
                WHERE p.deleted_at IS NULL
                  AND (p.user_id = ${userId} OR pc.id IS NOT NULL)
                ORDER BY p.created_at DESC
                LIMIT ${actualLimit} OFFSET ${actualOffset}
              `
            : await sql`
                SELECT p.id, p.name, p.description, p.current_phase, p.status, p.created_at,
                       'owner' as my_role
                FROM projects p
                WHERE p.user_id = ${userId} AND p.deleted_at IS NULL
                ORDER BY p.created_at DESC
                LIMIT ${actualLimit} OFFSET ${actualOffset}
              `

          // Get total count for pagination info
          const [{ count }] = includeShared
            ? await sql`
                SELECT COUNT(DISTINCT p.id)::int as count
                FROM projects p
                LEFT JOIN project_collaborators pc ON p.id = pc.project_id AND pc.user_id = ${userId}
                WHERE p.deleted_at IS NULL AND (p.user_id = ${userId} OR pc.id IS NOT NULL)
              `
            : await sql`
                SELECT COUNT(*)::int as count FROM projects WHERE user_id = ${userId} AND deleted_at IS NULL
              `

          const data = brief
            ? projects.map((p: Record<string, unknown>) => ({
                ...projectBrief(p),
                role: p.my_role
              }))
            : projects.map((p: Record<string, unknown>) => ({
                id: p.id,
                name: p.name,
                description: truncate(p.description as string, 100),
                phase: p.current_phase,
                status: p.status,
                role: p.my_role,
                created_at: p.created_at
              }))

          return mcpResponse({
            projects: data,
            pagination: { total: count, limit: actualLimit, offset: actualOffset }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: List phases
    // ==========================================
    server.tool(
      "list_phases",
      "List all phases for a project. Uses active project if projectId not specified.",
      {
        projectId: z.string().optional().describe("Project ID (uses active project if not specified)"),
        brief: z.boolean().optional().describe("Return minimal fields"),
      },
      async ({ projectId, brief }) => {
        try {
          const [resolvedId, error] = resolveProjectId(projectId)
          if (!resolvedId) return mcpError(error!)

          const hasAccess = await verifyMcpProjectOwnership(resolvedId)
          if (!hasAccess) return mcpError("Project not found or access denied")

          const phases = await sql`
            SELECT pp.id, pp.phase_name, pp.status, pp.started_at, pp.completed_at
            FROM project_phases pp
            WHERE pp.project_id = ${resolvedId}
            ORDER BY pp.started_at ASC
          `

          const data = brief
            ? phases.map(p => ({ name: p.phase_name, status: p.status }))
            : phases

          return mcpResponse({ phases: data })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Transition phase
    // ==========================================
    server.tool(
      "transition_phase",
      "Transition a project to the next phase. Requires write access. Uses active project if projectId not specified.",
      {
        projectId: z.string().optional().describe("Project ID (uses active project if not specified)"),
        newPhase: z.enum(["ideation", "architecture", "construction", "testing", "deployment", "maintenance"]).describe("The new phase"),
        reason: z.string().describe("Reason for transition"),
      },
      async ({ projectId, newPhase, reason }) => {
        try {
          requireMcpScope("write")
          const [resolvedId, error] = resolveProjectId(projectId)
          if (!resolvedId) return mcpError(error!)

          // Check write access (editors and admins can transition)
          await requireMcpProjectWriteAccess(resolvedId)

          const [result] = await sql`
            SELECT * FROM transition_to_phase(${resolvedId}, ${newPhase}, 'mcp-agent', ${reason})
          `

          return mcpResponse({ transitioned: true, phase: newPhase, id: result?.id })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Get project execution plan
    // ==========================================
    server.tool(
      "get_execution_plan",
      "Get execution plan (steps/dependencies). Uses active project if projectId not specified.",
      {
        projectId: z.string().optional().describe("Project ID (uses active project if not specified)"),
        brief: z.boolean().optional().describe("Return only id, title, status, deps"),
        limit: z.number().optional().describe("Limit number of steps returned"),
      },
      async ({ projectId, brief, limit }) => {
        try {
          const [resolvedId, error] = resolveProjectId(projectId)
          if (!resolvedId) return mcpError(error!)

          const hasAccess = await verifyMcpProjectOwnership(resolvedId)
          if (!hasAccess) return mcpError("Project not found or access denied")

          const actualLimit = limit || 50

          const steps = await sql`
            SELECT ps.id, ps.title, ps.status, ps.assigned_agent, ps.order_index,
                   array_agg(DISTINCT sd.depends_on_step_id) FILTER (WHERE sd.depends_on_step_id IS NOT NULL) as deps
            FROM project_steps ps
            LEFT JOIN step_dependencies sd ON ps.id = sd.step_id
            WHERE ps.project_id = ${resolvedId}
              AND ps.deleted_at IS NULL
            GROUP BY ps.id
            ORDER BY ps.order_index
            LIMIT ${actualLimit}
          `

          const data = brief
            ? steps.map(s => ({ id: s.id, title: truncate(s.title as string, 50), status: s.status, deps: s.deps }))
            : steps.map(s => ({ ...s, title: truncate(s.title as string, 80) }))

          return mcpResponse({ steps: data, count: steps.length })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Add progress note
    // ==========================================
    server.tool(
      "add_progress_note",
      "Add a progress note to track development progress. Requires write access. Uses active project if projectId not specified.",
      {
        projectId: z.string().optional().describe("Project ID (uses active project if not specified)"),
        stepId: z.string().optional().describe("The step ID (optional)"),
        noteType: z.enum(["milestone", "blocker", "decision", "update"]).describe("Type of note"),
        title: z.string().optional().describe("Note title"),
        content: z.string().describe("Note content"),
      },
      async ({ projectId, stepId, noteType, title, content }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()
          const [resolvedId, error] = resolveProjectId(projectId)
          if (!resolvedId) return mcpError(error!)

          // Check write access
          await requireMcpProjectWriteAccess(resolvedId)

          if (stepId) {
            const hasAccess = await verifyMcpStepAccess(stepId)
            if (!hasAccess) return mcpError("Step not found or access denied")
          }

          const [note] = await sql`
            INSERT INTO progress_notes (project_id, step_id, author_type, author_name, note_type, title, content, user_id)
            VALUES (${resolvedId}, ${stepId || null}, 'agent', 'mcp-client', ${noteType}, ${title || null}, ${content}, ${userId})
            RETURNING id, note_type, title
          `

          return mcpResponse({ added: true, id: note.id, type: note.note_type })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Get project tasks (for Kanban/Gantt)
    // ==========================================
    server.tool(
      "get_project_tasks",
      "Get tasks for a project. Uses active project if projectId not specified.",
      {
        projectId: z.string().optional().describe("Project ID (uses active project if not specified)"),
        brief: z.boolean().optional().describe("Return only id, title, status, agent"),
        status: z.enum(["pending", "in-progress", "completed", "blocked"]).optional().describe("Filter by status"),
        limit: z.number().optional().describe("Limit results"),
      },
      async ({ projectId, brief, status, limit }) => {
        try {
          const [resolvedId, error] = resolveProjectId(projectId)
          if (!resolvedId) return mcpError(error!)

          const hasAccess = await verifyMcpProjectOwnership(resolvedId)
          if (!hasAccess) return mcpError("Project not found or access denied")

          const actualLimit = limit || 30

          // Build dynamic query based on status filter
          const tasks = status
            ? await sql`
                SELECT ps.id, ps.title, ps.status, ps.assigned_agent, ps.order_index
                FROM project_steps ps
                WHERE ps.project_id = ${resolvedId}
                  AND ps.status = ${status}
                  AND ps.deleted_at IS NULL
                ORDER BY ps.order_index ASC
                LIMIT ${actualLimit}
              `
            : await sql`
                SELECT ps.id, ps.title, ps.status, ps.assigned_agent, ps.order_index
                FROM project_steps ps
                WHERE ps.project_id = ${resolvedId}
                  AND ps.deleted_at IS NULL
                ORDER BY ps.order_index ASC
                LIMIT ${actualLimit}
              `

          const data = brief
            ? tasks.map(taskBrief)
            : tasks.map(t => ({ ...t, title: truncate(t.title as string, 80) }))

          return mcpResponse({ tasks: data, count: tasks.length })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Assign task to agent
    // ==========================================
    server.tool(
      "assign_task",
      "Assign a task to an AI agent. Requires write access.",
      {
        taskId: z.string().describe("The task ID"),
        agentName: z.enum(["v0", "claude", "gemini", "gpt"]).describe("The agent name"),
      },
      async ({ taskId, agentName }) => {
        try {
          requireMcpScope("write")

          // Get the step's project to check write access
          const [step] = await sql`
            SELECT project_id FROM project_steps WHERE id = ${taskId}
          `
          if (!step) return mcpError("Task not found")

          // Check write access on the project
          await requireMcpProjectWriteAccess(step.project_id)

          await sql`SELECT * FROM assign_task_to_agent(${taskId}, ${agentName})`

          return mcpResponse({ assigned: true, taskId, agent: agentName })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: List documents
    // ==========================================
    server.tool(
      "list_documents",
      "List documents for a project. Uses active project if projectId not specified.",
      {
        projectId: z.string().optional().describe("Project ID (uses active project if not specified)"),
        type: z.enum(["file", "page"]).optional().describe("Filter by type (file=Blob, page=KB)"),
        brief: z.boolean().optional().describe("Return only id, title, type"),
        limit: z.number().optional().describe("Limit results"),
      },
      async ({ projectId, type, brief, limit }) => {
        try {
          const [resolvedId, error] = resolveProjectId(projectId)
          if (!resolvedId) return mcpError(error!)

          const hasAccess = await verifyMcpProjectOwnership(resolvedId)
          if (!hasAccess) return mcpError("Project not found or access denied")

          const actualLimit = limit || 30

          let documents
          if (type === "file") {
            documents = await sql`
              SELECT d.id, d.title, d.category, 'file' as type
              FROM documents d
              WHERE d.project_id = ${resolvedId} AND d.deleted_at IS NULL AND d.blob_key IS NOT NULL
              ORDER BY d.created_at DESC LIMIT ${actualLimit}
            `
          } else if (type === "page") {
            documents = await sql`
              SELECT d.id, d.title, d.category, 'page' as type
              FROM documents d
              WHERE d.project_id = ${resolvedId} AND d.deleted_at IS NULL AND d.blob_key IS NULL
              ORDER BY d.created_at DESC LIMIT ${actualLimit}
            `
          } else {
            documents = await sql`
              SELECT d.id, d.title, d.category, CASE WHEN d.blob_key IS NOT NULL THEN 'file' ELSE 'page' END as type
              FROM documents d
              WHERE d.project_id = ${resolvedId} AND d.deleted_at IS NULL
              ORDER BY d.created_at DESC LIMIT ${actualLimit}
            `
          }

          const data = brief ? documents.map(docBrief) : documents

          return mcpResponse({ documents: data, count: documents.length })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Read document content
    // ==========================================
    server.tool(
      "read_document",
      "Read document content (pages) or get URL (files). Use maxLength to limit content size.",
      {
        documentId: z.string().describe("The document ID"),
        maxLength: z.number().optional().describe("Max content length (default 2000 chars, saves tokens)"),
      },
      async ({ documentId, maxLength }) => {
        try {
          // verifyMcpDocumentOwnership now includes collaborator access
          const hasAccess = await verifyMcpDocumentOwnership(documentId)
          if (!hasAccess) return mcpError("Document not found or access denied")

          const contentLimit = maxLength || 2000

          const [doc] = await sql`
            SELECT d.id, d.title, d.content, d.blob_key, d.blob_url FROM documents d
            WHERE d.id = ${documentId}
          `

          if (!doc) return mcpError("Document not found")

          const isFile = !!doc.blob_key
          return mcpResponse({
            id: doc.id,
            title: doc.title,
            type: isFile ? "file" : "page",
            content: isFile ? null : truncate(doc.content as string, contentLimit),
            url: isFile ? (doc.blob_url || `/api/documents/${doc.id}/download`) : null,
            truncated: doc.content && (doc.content as string).length > contentLimit
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Create document (Knowledge Base Page)
    // ==========================================
    server.tool(
      "create_document",
      "Create a new knowledge base page. Requires write access. Uses active project if projectId not specified.",
      {
        projectId: z.string().optional().describe("Project ID (uses active project if not specified)"),
        title: z.string().describe("Document title"),
        content: z.string().describe("Markdown content"),
        category: z.string().optional().describe("Category"),
      },
      async ({ projectId, title, content, category }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()
          const [resolvedId, error] = resolveProjectId(projectId)
          if (!resolvedId) return mcpError(error!)

          // Check write access
          await requireMcpProjectWriteAccess(resolvedId)

          // Calculate content size in bytes
          const contentSize = Buffer.byteLength(content, 'utf8')

          const [doc] = await sql`
            INSERT INTO documents(project_id, title, content, category, doc_type, blob_key, file_type, file_size, user_id)
            VALUES(${resolvedId}, ${title}, ${content}, ${category || "general"}, 'page', NULL, 'text/markdown', ${contentSize}, ${userId})
            RETURNING id, title
          `

          return mcpResponse({ created: true, id: doc.id, title: doc.title })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: List agents
    // ==========================================
    server.tool(
      "list_agents",
      "List all AI agents and their current status. Use brief=true for minimal response.",
      {
        brief: z.boolean().optional().describe("Return only id, name, status, type (saves tokens)"),
      },
      async ({ brief }) => {
        try {
          // Agents are shared across all users (global resource)
          const agents = await sql`
            SELECT a.*, ps.title as current_task_title
            FROM agents a
            LEFT JOIN project_steps ps ON a.current_task_id = ps.id
            ORDER BY a.name
          `

          const data = brief
            ? agents.map((a: Record<string, unknown>) => ({
                id: a.id,
                name: a.name,
                status: a.status,
                type: a.type,
                current_task: a.current_task_title ? truncate(a.current_task_title as string, 40) : null
              }))
            : agents.map((a: Record<string, unknown>) => ({
                ...a,
                capabilities: truncate(a.capabilities as string, 100),
                current_task_title: truncate(a.current_task_title as string, 60)
              }))

          return mcpResponse({ agents: data, count: agents.length })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: List collaborators
    // ==========================================
    server.tool(
      "list_collaborators",
      "List all collaborators for a project. Uses active project if projectId not specified.",
      {
        projectId: z.string().optional().describe("Project ID (uses active project if not specified)"),
        brief: z.boolean().optional().describe("Return only id, email, role"),
      },
      async ({ projectId, brief }) => {
        try {
          const [resolvedId, error] = resolveProjectId(projectId)
          if (!resolvedId) return mcpError(error!)

          const hasAccess = await verifyMcpProjectOwnership(resolvedId)
          if (!hasAccess) return mcpError("Project not found or access denied")

          // Get project owner
          const [project] = await sql`
            SELECT p.user_id, u.email as owner_email, u.display_name as owner_name
            FROM projects p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ${resolvedId}
          `

          // Get collaborators
          const collaborators = await sql`
            SELECT pc.id, pc.role, pc.added_at, u.email, u.display_name as name
            FROM project_collaborators pc
            JOIN users u ON pc.user_id = u.id
            WHERE pc.project_id = ${resolvedId}
            ORDER BY pc.added_at ASC
          `

          const data = brief
            ? {
                owner: { email: project.owner_email, role: "owner" },
                collaborators: collaborators.map((c: Record<string, unknown>) => ({
                  id: c.id,
                  email: c.email,
                  role: c.role
                }))
              }
            : {
                owner: {
                  email: project.owner_email,
                  name: project.owner_name,
                  role: "owner"
                },
                collaborators: collaborators.map((c: Record<string, unknown>) => ({
                  id: c.id,
                  email: c.email,
                  name: c.name,
                  role: c.role,
                  added_at: c.added_at
                }))
              }

          return mcpResponse({
            ...data,
            count: collaborators.length + 1 // +1 for owner
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // WORKSPACE BINDING TOOLS
    // ==========================================

    // ==========================================
    // Tool: Set active project (like gh repo set-default)
    // ==========================================
    server.tool(
      "set_active_project",
      "Set the active project for this API key. Includes owned and shared projects. Like 'gh repo set-default'.",
      {
        projectId: z.string().optional().describe("Project ID to set as active"),
        name: z.string().optional().describe("Project name to search (partial match)"),
        clear: z.boolean().optional().describe("Clear the active project binding"),
      },
      async ({ projectId, name, clear }) => {
        try {
          const userId = getMcpUserId()

          // Clear binding
          if (clear) {
            const success = await setActiveProject(null)
            return mcpResponse({ cleared: success })
          }

          // Resolve project by ID or name
          let resolvedId = projectId
          if (!resolvedId && name) {
            // Search by name (partial match) - includes shared projects
            const results = await sql`
              SELECT DISTINCT p.id, p.name,
                     CASE WHEN p.user_id = ${userId} THEN 'owner' ELSE pc.role END as role
              FROM projects p
              LEFT JOIN project_collaborators pc ON p.id = pc.project_id AND pc.user_id = ${userId}
              WHERE (p.user_id = ${userId} OR pc.id IS NOT NULL)
                AND p.name ILIKE ${"%" + name + "%"}
                AND p.deleted_at IS NULL
              LIMIT 5
            `
            if (results.length === 0) {
              return mcpError(`No project found matching "${name}"`)
            }
            if (results.length > 1) {
              return mcpResponse({
                error: "Multiple matches",
                matches: results.map((p: Record<string, unknown>) => ({ id: p.id, name: p.name, role: p.role })),
                hint: "Use projectId to specify exact project"
              })
            }
            resolvedId = results[0].id as string
          }

          if (!resolvedId) {
            return mcpError("Provide projectId or name to set active project")
          }

          // Verify access (owner or collaborator) and set active
          const access = await verifyMcpProjectAccess(resolvedId)
          if (!access.hasAccess) return mcpError("Project not found or access denied")

          const success = await setActiveProject(resolvedId)
          if (!success) return mcpError("Failed to set active project")

          // Get project info to return
          const [project] = await sql`
            SELECT id, name, current_phase, status FROM projects WHERE id = ${resolvedId}
          `

          return mcpResponse({
            active: true,
            project: { id: project.id, name: project.name, phase: project.current_phase },
            access: { role: access.role, canWrite: access.canWrite }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Get active project
    // ==========================================
    server.tool(
      "get_active_project",
      "Get the currently active project for this API key. Returns null if no project is set.",
      {},
      async () => {
        try {
          const activeId = getActiveProjectId()

          if (!activeId) {
            return mcpResponse({ active: null, hint: "Use set_active_project to set one" })
          }

          // Verify access and get role
          const access = await verifyMcpProjectAccess(activeId)
          if (!access.hasAccess) {
            return mcpResponse({ active: null, hint: "Active project was deleted or access revoked" })
          }

          const [project] = await sql`
            SELECT id, name, current_phase, status, github_repo_url, workspace_path
            FROM projects
            WHERE id = ${activeId}
          `

          if (!project) {
            return mcpResponse({ active: null, hint: "Active project was deleted" })
          }

          return mcpResponse({
            active: {
              id: project.id,
              name: project.name,
              phase: project.current_phase,
              status: project.status,
              git_remote: project.github_repo_url,
              workspace_path: project.workspace_path
            },
            access: { role: access.role, canWrite: access.canWrite }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Register workspace (binds git remote or path to project)
    // ==========================================
    server.tool(
      "register_workspace",
      "Register a git remote URL or workspace path to identify this project automatically. Also sets as active project.",
      {
        projectId: z.string().optional().describe("Project ID to bind (omit to auto-detect from git_remote/workspace_path)"),
        git_remote: z.string().optional().describe("Git remote URL (e.g., git@github.com:user/repo.git)"),
        workspace_path: z.string().optional().describe("Absolute path to workspace directory"),
      },
      async ({ projectId, git_remote, workspace_path }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          if (!git_remote && !workspace_path && !projectId) {
            return mcpError("Provide at least git_remote, workspace_path, or projectId")
          }

          // Resolve project ID
          let resolvedId = projectId

          // If no projectId, try to find existing project by identifiers
          if (!resolvedId && git_remote) {
            resolvedId = await findProjectByGitRemote(git_remote) || undefined
          }
          if (!resolvedId && workspace_path) {
            resolvedId = await findProjectByWorkspacePath(workspace_path) || undefined
          }

          if (!resolvedId) {
            return mcpResponse({
              found: false,
              hint: "No matching project found. Use list_projects to find your project and pass projectId explicitly."
            })
          }

          // Verify ownership
          const isOwner = await verifyMcpProjectOwnership(resolvedId)
          if (!isOwner) return mcpError("Project not found or access denied")

          // Update workspace identifiers
          const updated = await updateProjectWorkspace(resolvedId, {
            gitRemote: git_remote,
            workspacePath: workspace_path
          })

          if (!updated) return mcpError("Failed to update workspace binding")

          // Set as active project
          await setActiveProject(resolvedId)

          // Get updated project info
          const [project] = await sql`
            SELECT id, name, github_repo_url, workspace_path FROM projects WHERE id = ${resolvedId}
          `

          return mcpResponse({
            registered: true,
            active: true,
            project: {
              id: project.id,
              name: project.name,
              git_remote: project.github_repo_url,
              workspace_path: project.workspace_path
            }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Resolve workspace (find matching project, don't persist)
    // ==========================================
    server.tool(
      "resolve_workspace",
      "Find which project matches a git remote or workspace path (read-only, does not set active project).",
      {
        git_remote: z.string().optional().describe("Git remote URL to look up"),
        workspace_path: z.string().optional().describe("Workspace path to look up"),
      },
      async ({ git_remote, workspace_path }) => {
        try {
          const userId = getMcpUserId()

          if (!git_remote && !workspace_path) {
            return mcpError("Provide git_remote or workspace_path to search")
          }

          // Try to find by git remote first (higher priority)
          let projectId: string | null = null
          let matchedBy: string | null = null

          if (git_remote) {
            projectId = await findProjectByGitRemote(git_remote)
            if (projectId) matchedBy = "git_remote"
          }

          if (!projectId && workspace_path) {
            projectId = await findProjectByWorkspacePath(workspace_path)
            if (projectId) matchedBy = "workspace_path"
          }

          if (!projectId) {
            return mcpResponse({
              found: false,
              searched: { git_remote, workspace_path },
              hint: "No project matches. Use register_workspace with explicit projectId to bind."
            })
          }

          // Get project details
          const [project] = await sql`
            SELECT id, name, current_phase, status, github_repo_url, workspace_path
            FROM projects
            WHERE id = ${projectId} AND user_id = ${userId}
          `

          if (!project) {
            return mcpResponse({ found: false, hint: "Project was deleted" })
          }

          return mcpResponse({
            found: true,
            matched_by: matchedBy,
            project: {
              id: project.id,
              name: project.name,
              phase: project.current_phase,
              status: project.status,
              git_remote: project.github_repo_url,
              workspace_path: project.workspace_path
            }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // TODO LIST TOOLS
    // ==========================================

    // ==========================================
    // Tool: List todos
    // ==========================================
    server.tool(
      "list_todos",
      "List your personal todos with optional filters. Supports view modes: today, upcoming, all, completed.",
      {
        view: z.enum(["today", "upcoming", "all", "completed"]).optional().describe("View filter (default: all)"),
        projectId: z.string().optional().describe("Filter by linked project"),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Filter by priority"),
        search: z.string().optional().describe("Search in title/description"),
        brief: z.boolean().optional().describe("Return minimal fields only"),
        limit: z.number().optional().describe(`Max results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
        offset: z.number().optional().describe("Skip N results for pagination"),
      },
      async ({ view = "all", projectId, priority, search, brief, limit, offset }) => {
        try {
          const userId = getMcpUserId()
          const actualLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT)
          const actualOffset = offset || 0

          // Build WHERE conditions based on filters
          let viewCondition = ""
          switch (view) {
            case "today":
              viewCondition = "AND due_date::date = CURRENT_DATE"
              break
            case "upcoming":
              viewCondition = "AND due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days'"
              break
            case "completed":
              viewCondition = "AND status = 'completed'"
              break
            // 'all' has no additional condition
          }

          // Query todos with dynamic conditions
          const todos = await sql`
            SELECT t.id, t.title, t.description, t.status, t.priority,
                   t.due_date, t.completed_at, t.order_index, t.created_at,
                   t.project_id, p.name as project_name
            FROM todos t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.user_id = ${userId}
              AND t.deleted_at IS NULL
              ${view === "today" ? sql`AND t.due_date::date = CURRENT_DATE` : sql``}
              ${view === "upcoming" ? sql`AND t.due_date > CURRENT_DATE AND t.due_date <= CURRENT_DATE + INTERVAL '7 days'` : sql``}
              ${view === "completed" ? sql`AND t.status = 'completed'` : sql``}
              ${projectId ? sql`AND t.project_id = ${projectId}` : sql``}
              ${priority ? sql`AND t.priority = ${priority}` : sql``}
              ${search ? sql`AND (t.title ILIKE ${"%" + search + "%"} OR t.description ILIKE ${"%" + search + "%"})` : sql``}
            ORDER BY
              CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END,
              t.order_index ASC,
              t.created_at DESC
            LIMIT ${actualLimit} OFFSET ${actualOffset}
          `

          // Get total count
          const [{ count }] = await sql`
            SELECT COUNT(*)::int as count
            FROM todos t
            WHERE t.user_id = ${userId}
              AND t.deleted_at IS NULL
              ${view === "today" ? sql`AND t.due_date::date = CURRENT_DATE` : sql``}
              ${view === "upcoming" ? sql`AND t.due_date > CURRENT_DATE AND t.due_date <= CURRENT_DATE + INTERVAL '7 days'` : sql``}
              ${view === "completed" ? sql`AND t.status = 'completed'` : sql``}
              ${projectId ? sql`AND t.project_id = ${projectId}` : sql``}
              ${priority ? sql`AND t.priority = ${priority}` : sql``}
              ${search ? sql`AND (t.title ILIKE ${"%" + search + "%"} OR t.description ILIKE ${"%" + search + "%"})` : sql``}
          `

          const data = brief
            ? todos.map((t: Record<string, unknown>) => ({
                id: t.id,
                title: truncate(t.title as string, 60),
                status: t.status,
                priority: t.priority,
                due: t.due_date,
                project: t.project_name || null
              }))
            : todos.map((t: Record<string, unknown>) => ({
                id: t.id,
                title: t.title,
                description: truncate(t.description as string, 150),
                status: t.status,
                priority: t.priority,
                due_date: t.due_date,
                completed_at: t.completed_at,
                project: t.project_id ? { id: t.project_id, name: t.project_name } : null,
                created_at: t.created_at
              }))

          return mcpResponse({
            todos: data,
            view,
            pagination: { total: count, limit: actualLimit, offset: actualOffset }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Create todo
    // ==========================================
    server.tool(
      "create_todo",
      "Create a new personal todo. Can optionally be linked to a project.",
      {
        title: z.string().describe("Todo title"),
        description: z.string().optional().describe("Todo description"),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Priority level (default: medium)"),
        dueDate: z.string().optional().describe("Due date (ISO 8601 format)"),
        projectId: z.string().optional().describe("Link to a project"),
      },
      async ({ title, description, priority = "medium", dueDate, projectId }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // If linking to project, verify access
          if (projectId) {
            const access = await verifyMcpProjectAccess(projectId)
            if (!access.hasAccess) return mcpError("Project not found or access denied")
          }

          // Get max order_index for user's todos
          const [{ maxOrder }] = await sql`
            SELECT COALESCE(MAX(order_index), -1)::int as "maxOrder"
            FROM todos
            WHERE user_id = ${userId} AND deleted_at IS NULL
          `

          const [todo] = await sql`
            INSERT INTO todos (user_id, project_id, title, description, priority, due_date, order_index)
            VALUES (${userId}, ${projectId || null}, ${title}, ${description || null}, ${priority}, ${dueDate || null}, ${maxOrder + 1})
            RETURNING id, title, status, priority, due_date
          `

          return mcpResponse({
            created: true,
            id: todo.id,
            title: todo.title,
            priority: todo.priority,
            due: todo.due_date
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Update todo
    // ==========================================
    server.tool(
      "update_todo",
      "Update an existing todo.",
      {
        todoId: z.string().describe("Todo ID to update"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        status: z.enum(["pending", "in_progress", "completed"]).optional().describe("New status"),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("New priority"),
        dueDate: z.string().nullable().optional().describe("New due date (null to clear)"),
        projectId: z.string().nullable().optional().describe("Link to project (null to unlink)"),
      },
      async ({ todoId, title, description, status, priority, dueDate, projectId }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify ownership
          const [existing] = await sql`
            SELECT id FROM todos WHERE id = ${todoId} AND user_id = ${userId} AND deleted_at IS NULL
          `
          if (!existing) return mcpError("Todo not found or access denied")

          // If linking to project, verify access
          if (projectId !== undefined && projectId !== null) {
            const access = await verifyMcpProjectAccess(projectId)
            if (!access.hasAccess) return mcpError("Project not found or access denied")
          }

          // Build update fields
          const updates: Record<string, unknown> = {}
          if (title !== undefined) updates.title = title
          if (description !== undefined) updates.description = description
          if (status !== undefined) updates.status = status
          if (priority !== undefined) updates.priority = priority
          if (dueDate !== undefined) updates.due_date = dueDate
          if (projectId !== undefined) updates.project_id = projectId

          if (Object.keys(updates).length === 0) {
            return mcpError("No fields to update")
          }

          // Perform update (manual query building for dynamic fields)
          const [updated] = await sql`
            UPDATE todos
            SET
              title = COALESCE(${title ?? null}, title),
              description = CASE WHEN ${description !== undefined} THEN ${description ?? null} ELSE description END,
              status = COALESCE(${status ?? null}, status),
              priority = COALESCE(${priority ?? null}, priority),
              due_date = CASE WHEN ${dueDate !== undefined} THEN ${dueDate ?? null} ELSE due_date END,
              project_id = CASE WHEN ${projectId !== undefined} THEN ${projectId ?? null} ELSE project_id END,
              updated_at = NOW()
            WHERE id = ${todoId}
            RETURNING id, title, status, priority, due_date
          `

          return mcpResponse({
            updated: true,
            id: updated.id,
            title: updated.title,
            status: updated.status,
            priority: updated.priority,
            due: updated.due_date
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Toggle todo
    // ==========================================
    server.tool(
      "toggle_todo",
      "Quick toggle a todo between pending and completed status.",
      {
        todoId: z.string().describe("Todo ID to toggle"),
      },
      async ({ todoId }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify ownership and get current status
          const [existing] = await sql`
            SELECT id, status FROM todos WHERE id = ${todoId} AND user_id = ${userId} AND deleted_at IS NULL
          `
          if (!existing) return mcpError("Todo not found or access denied")

          const newStatus = existing.status === "completed" ? "pending" : "completed"

          const [updated] = await sql`
            UPDATE todos
            SET status = ${newStatus}, updated_at = NOW()
            WHERE id = ${todoId}
            RETURNING id, title, status
          `

          return mcpResponse({
            toggled: true,
            id: updated.id,
            title: truncate(updated.title as string, 60),
            status: updated.status
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Delete todo
    // ==========================================
    server.tool(
      "delete_todo",
      "Delete a todo (soft delete).",
      {
        todoId: z.string().describe("Todo ID to delete"),
      },
      async ({ todoId }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify ownership
          const [existing] = await sql`
            SELECT id, title FROM todos WHERE id = ${todoId} AND user_id = ${userId} AND deleted_at IS NULL
          `
          if (!existing) return mcpError("Todo not found or access denied")

          await sql`
            UPDATE todos
            SET deleted_at = NOW(), updated_at = NOW()
            WHERE id = ${todoId}
          `

          return mcpResponse({
            deleted: true,
            id: todoId,
            title: truncate(existing.title as string, 60)
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Reorder todos
    // ==========================================
    server.tool(
      "reorder_todos",
      "Update the order of multiple todos (for drag-drop reordering).",
      {
        items: z.array(z.object({
          id: z.string().describe("Todo ID"),
          orderIndex: z.number().describe("New order index"),
        })).describe("Array of {id, orderIndex} pairs"),
      },
      async ({ items }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify all todos belong to user
          const todoIds = items.map(i => i.id)
          const existing = await sql`
            SELECT id FROM todos WHERE id = ANY(${todoIds}) AND user_id = ${userId} AND deleted_at IS NULL
          `

          if (existing.length !== items.length) {
            return mcpError("Some todos not found or access denied")
          }

          // Update each todo's order_index
          for (const item of items) {
            await sql`
              UPDATE todos SET order_index = ${item.orderIndex}, updated_at = NOW()
              WHERE id = ${item.id}
            `
          }

          return mcpResponse({
            reordered: true,
            count: items.length
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )
  },
  {},
  {
    basePath: "",
    verboseLogs: true,
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
