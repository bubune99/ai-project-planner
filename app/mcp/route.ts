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
import {
  createWorker,
  listWorkers,
  getWorker,
  updateWorkerStatus,
  claimJob,
  transitionJobToUnlock,
  resolveUnlock,
  listAwaitingUnlocks,
  createSource,
  listSourcesForStep,
  listSourcesForJob,
} from "@/lib/db/backbone"
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

    // ==========================================
    // IDEAS MODULE TOOLS
    // ==========================================

    // ==========================================
    // Tool: List ideas
    // ==========================================
    server.tool(
      "list_ideas",
      "List your ideas with optional filters. Ideas are brainstorming items that can be promoted to projects.",
      {
        lifecycle: z.enum(["seed", "exploring", "refined", "promoted", "archived"]).optional().describe("Filter by lifecycle stage"),
        category: z.string().optional().describe("Filter by category"),
        search: z.string().optional().describe("Search in title/description"),
        includeArchived: z.boolean().optional().describe("Include archived ideas (default: false)"),
        brief: z.boolean().optional().describe("Return minimal fields only"),
        limit: z.number().optional().describe(`Max results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
        offset: z.number().optional().describe("Skip N results for pagination"),
      },
      async ({ lifecycle, category, search, includeArchived, brief, limit, offset }) => {
        try {
          const userId = getMcpUserId()
          const actualLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT)
          const actualOffset = offset || 0

          const ideas = await sql`
            SELECT
              i.id, i.title, i.description, i.category, i.tags, i.lifecycle, i.visibility,
              i.promoted_to_project_id, i.created_at, i.updated_at,
              p.name as project_name,
              (SELECT COUNT(*) FROM idea_facets f WHERE f.idea_id = i.id) as facet_count,
              (SELECT COUNT(*) FROM idea_branches b WHERE b.idea_id = i.id) as branch_count
            FROM ideas i
            LEFT JOIN projects p ON i.promoted_to_project_id = p.id
            WHERE i.user_id = ${userId}
              AND i.deleted_at IS NULL
              ${!includeArchived ? sql`AND i.lifecycle != 'archived'` : sql``}
              ${lifecycle ? sql`AND i.lifecycle = ${lifecycle}` : sql``}
              ${category ? sql`AND i.category = ${category}` : sql``}
              ${search ? sql`AND (i.title ILIKE ${'%' + search + '%'} OR i.description ILIKE ${'%' + search + '%'})` : sql``}
            ORDER BY i.updated_at DESC
            LIMIT ${actualLimit} OFFSET ${actualOffset}
          `

          const [{ count }] = await sql`
            SELECT COUNT(*)::int as count FROM ideas
            WHERE user_id = ${userId} AND deleted_at IS NULL
              ${!includeArchived ? sql`AND lifecycle != 'archived'` : sql``}
              ${lifecycle ? sql`AND lifecycle = ${lifecycle}` : sql``}
              ${category ? sql`AND category = ${category}` : sql``}
              ${search ? sql`AND (title ILIKE ${'%' + search + '%'} OR description ILIKE ${'%' + search + '%'})` : sql``}
          `

          const data = brief
            ? ideas.map((i: Record<string, unknown>) => ({
                id: i.id,
                title: truncate(i.title as string, 60),
                lifecycle: i.lifecycle,
                category: i.category,
                facets: parseInt(i.facet_count as string || '0')
              }))
            : ideas.map((i: Record<string, unknown>) => ({
                id: i.id,
                title: i.title,
                description: truncate(i.description as string, 150),
                category: i.category,
                tags: i.tags,
                lifecycle: i.lifecycle,
                visibility: i.visibility,
                promotedTo: i.promoted_to_project_id ? { id: i.promoted_to_project_id, name: i.project_name } : null,
                facetCount: parseInt(i.facet_count as string || '0'),
                branchCount: parseInt(i.branch_count as string || '0'),
                created_at: i.created_at
              }))

          return mcpResponse({
            ideas: data,
            pagination: { total: count, limit: actualLimit, offset: actualOffset }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Create idea
    // ==========================================
    server.tool(
      "create_idea",
      "Create a new idea for brainstorming. Ideas start in 'seed' lifecycle and can be promoted to projects.",
      {
        title: z.string().describe("Idea title"),
        description: z.string().optional().describe("Idea description"),
        category: z.string().optional().describe("Category (e.g., 'product', 'feature', 'business')"),
        tags: z.array(z.string()).optional().describe("Tags for organization"),
      },
      async ({ title, description, category, tags }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          const [idea] = await sql`
            INSERT INTO ideas (user_id, title, description, category, tags, lifecycle, visibility)
            VALUES (${userId}, ${title}, ${description || null}, ${category || null}, ${tags || []}, 'seed', 'private')
            RETURNING id, title, lifecycle
          `

          // Create default main branch
          await sql`
            INSERT INTO idea_branches (idea_id, name, is_main, is_active, created_by)
            VALUES (${idea.id}, 'main', true, true, ${userId})
          `

          return mcpResponse({
            created: true,
            id: idea.id,
            title: idea.title,
            lifecycle: idea.lifecycle
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Get idea details
    // ==========================================
    server.tool(
      "get_idea",
      "Get detailed information about a specific idea including facets and branches.",
      {
        ideaId: z.string().describe("Idea ID"),
        includeFacets: z.boolean().optional().describe("Include facets data (default: true)"),
      },
      async ({ ideaId, includeFacets = true }) => {
        try {
          const userId = getMcpUserId()

          const [idea] = await sql`
            SELECT i.*, p.name as project_name
            FROM ideas i
            LEFT JOIN projects p ON i.promoted_to_project_id = p.id
            WHERE i.id = ${ideaId} AND i.user_id = ${userId} AND i.deleted_at IS NULL
          `

          if (!idea) return mcpError("Idea not found or access denied")

          let facets: Record<string, unknown>[] = []
          if (includeFacets) {
            facets = await sql`
              SELECT id, facet_type, name, data, order_index
              FROM idea_facets
              WHERE idea_id = ${ideaId}
              ORDER BY order_index
            `
          }

          const branches = await sql`
            SELECT id, name, is_main, is_active
            FROM idea_branches
            WHERE idea_id = ${ideaId}
            ORDER BY is_main DESC, created_at ASC
          `

          return mcpResponse({
            idea: {
              id: idea.id,
              title: idea.title,
              description: idea.description,
              category: idea.category,
              tags: idea.tags,
              lifecycle: idea.lifecycle,
              visibility: idea.visibility,
              promotedTo: idea.promoted_to_project_id ? { id: idea.promoted_to_project_id, name: idea.project_name } : null,
              created_at: idea.created_at
            },
            branches: branches.map((b: Record<string, unknown>) => ({ id: b.id, name: b.name, isMain: b.is_main, isActive: b.is_active })),
            facets: facets.map((f: Record<string, unknown>) => ({
              id: f.id,
              type: f.facet_type,
              name: f.name,
              data: f.data
            }))
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Update idea
    // ==========================================
    server.tool(
      "update_idea",
      "Update an existing idea.",
      {
        ideaId: z.string().describe("Idea ID to update"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        category: z.string().optional().describe("New category"),
        tags: z.array(z.string()).optional().describe("New tags"),
        lifecycle: z.enum(["seed", "exploring", "refined", "archived"]).optional().describe("New lifecycle stage"),
      },
      async ({ ideaId, title, description, category, tags, lifecycle }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify ownership
          const [existing] = await sql`
            SELECT id FROM ideas WHERE id = ${ideaId} AND user_id = ${userId} AND deleted_at IS NULL
          `
          if (!existing) return mcpError("Idea not found or access denied")

          const [updated] = await sql`
            UPDATE ideas
            SET
              title = COALESCE(${title ?? null}, title),
              description = CASE WHEN ${description !== undefined} THEN ${description ?? null} ELSE description END,
              category = CASE WHEN ${category !== undefined} THEN ${category ?? null} ELSE category END,
              tags = COALESCE(${tags ?? null}, tags),
              lifecycle = COALESCE(${lifecycle ?? null}, lifecycle),
              updated_at = NOW()
            WHERE id = ${ideaId}
            RETURNING id, title, lifecycle
          `

          return mcpResponse({
            updated: true,
            id: updated.id,
            title: updated.title,
            lifecycle: updated.lifecycle
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Add facet to idea
    // ==========================================
    server.tool(
      "add_idea_facet",
      "Add a facet (analysis module) to an idea. Facets include pros/cons, timeline, market research, etc.",
      {
        ideaId: z.string().describe("Idea ID"),
        facetType: z.enum(["pros_cons", "timeline", "market_research", "technical_specs", "financials", "dependencies", "risks", "alternatives", "custom"]).describe("Type of facet"),
        name: z.string().optional().describe("Custom name for the facet"),
        data: z.record(z.unknown()).describe("Facet data (structure depends on facet type)"),
      },
      async ({ ideaId, facetType, name, data }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify ownership
          const [idea] = await sql`
            SELECT id FROM ideas WHERE id = ${ideaId} AND user_id = ${userId} AND deleted_at IS NULL
          `
          if (!idea) return mcpError("Idea not found or access denied")

          // Get max order_index
          const [{ maxOrder }] = await sql`
            SELECT COALESCE(MAX(order_index), -1)::int as "maxOrder"
            FROM idea_facets WHERE idea_id = ${ideaId}
          `

          const [facet] = await sql`
            INSERT INTO idea_facets (idea_id, facet_type, name, data, order_index)
            VALUES (${ideaId}, ${facetType}, ${name || null}, ${JSON.stringify(data)}, ${maxOrder + 1})
            RETURNING id, facet_type, name
          `

          return mcpResponse({
            created: true,
            id: facet.id,
            type: facet.facet_type,
            name: facet.name
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Promote idea to project
    // ==========================================
    server.tool(
      "promote_idea",
      "Promote an idea to become a full project. This creates a new project linked to the idea.",
      {
        ideaId: z.string().describe("Idea ID to promote"),
        projectName: z.string().optional().describe("Project name (defaults to idea title)"),
        projectDescription: z.string().optional().describe("Project description (defaults to idea description)"),
      },
      async ({ ideaId, projectName, projectDescription }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Get idea
          const [idea] = await sql`
            SELECT * FROM ideas WHERE id = ${ideaId} AND user_id = ${userId} AND deleted_at IS NULL
          `
          if (!idea) return mcpError("Idea not found or access denied")
          if (idea.promoted_to_project_id) return mcpError("Idea already promoted to a project")

          // Create project
          const [project] = await sql`
            INSERT INTO projects (name, description, status, priority, current_phase, user_id)
            VALUES (
              ${projectName || idea.title},
              ${projectDescription || idea.description || 'Promoted from idea'},
              'planning', 'medium', 'ideation', ${userId}
            )
            RETURNING id, name, status
          `

          // Update idea with project link
          await sql`
            UPDATE ideas
            SET promoted_to_project_id = ${project.id}, lifecycle = 'promoted', promoted_at = NOW(), updated_at = NOW()
            WHERE id = ${ideaId}
          `

          // Create initial phase
          await sql`
            INSERT INTO project_phases (project_id, phase_name, status, description)
            VALUES (${project.id}, 'ideation', 'active', 'Promoted from idea')
          `

          return mcpResponse({
            promoted: true,
            idea: { id: ideaId, title: idea.title },
            project: { id: project.id, name: project.name }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // MEMORY 5W+H MODULE TOOLS
    // ==========================================

    // ==========================================
    // Tool: List decisions (WHY layer)
    // ==========================================
    server.tool(
      "list_decisions",
      "List decision episodes from the WHY memory layer. Decisions track reasoning, alternatives, and lessons learned.",
      {
        projectId: z.string().optional().describe("Filter by project"),
        ideaId: z.string().optional().describe("Filter by idea"),
        status: z.enum(["active", "resolved", "revisit", "deprecated"]).optional().describe("Filter by status"),
        domain: z.string().optional().describe("Filter by domain (e.g., 'architecture', 'business')"),
        search: z.string().optional().describe("Search in title/summary"),
        brief: z.boolean().optional().describe("Return minimal fields"),
        limit: z.number().optional().describe("Max results"),
      },
      async ({ projectId, ideaId, status, domain, search, brief, limit }) => {
        try {
          const userId = getMcpUserId()
          const actualLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT)

          const decisions = await sql`
            SELECT
              d.id, d.title, d.status, d.summary, d.tags, d.domains, d.project_id, d.idea_id,
              d.created_at, d.updated_at,
              COUNT(DISTINCT n.id) as node_count,
              COUNT(DISTINCT a.id) as attempt_count
            FROM mlp_why_decisions d
            LEFT JOIN mlp_why_nodes n ON n.episode_id = d.id
            LEFT JOIN mlp_why_attempts a ON a.episode_id = d.id
            WHERE d.user_id = ${userId}
              ${projectId ? sql`AND d.project_id = ${projectId}` : sql``}
              ${ideaId ? sql`AND d.idea_id = ${ideaId}` : sql``}
              ${status ? sql`AND d.status = ${status}` : sql``}
              ${domain ? sql`AND ${domain} = ANY(d.domains)` : sql``}
              ${search ? sql`AND (d.title ILIKE ${'%' + search + '%'} OR d.summary ILIKE ${'%' + search + '%'})` : sql``}
            GROUP BY d.id
            ORDER BY d.updated_at DESC
            LIMIT ${actualLimit}
          `

          const data = brief
            ? decisions.map((d: Record<string, unknown>) => ({
                id: d.id,
                title: truncate(d.title as string, 60),
                status: d.status,
                domains: d.domains
              }))
            : decisions.map((d: Record<string, unknown>) => ({
                id: d.id,
                title: d.title,
                summary: truncate(d.summary as string, 200),
                status: d.status,
                tags: d.tags,
                domains: d.domains,
                projectId: d.project_id,
                ideaId: d.idea_id,
                nodeCount: parseInt(d.node_count as string || '0'),
                attemptCount: parseInt(d.attempt_count as string || '0')
              }))

          return mcpResponse({ decisions: data, count: decisions.length })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Create decision
    // ==========================================
    server.tool(
      "create_decision",
      "Create a new decision episode to track reasoning and alternatives.",
      {
        title: z.string().describe("Decision title"),
        projectId: z.string().optional().describe("Link to project"),
        ideaId: z.string().optional().describe("Link to idea"),
        summary: z.string().optional().describe("Decision summary"),
        tags: z.array(z.string()).optional().describe("Tags"),
        domains: z.array(z.string()).optional().describe("Domains (e.g., 'architecture', 'business')"),
        businessDrivers: z.array(z.string()).optional().describe("Business drivers"),
        technicalConstraints: z.array(z.string()).optional().describe("Technical constraints"),
      },
      async ({ title, projectId, ideaId, summary, tags, domains, businessDrivers, technicalConstraints }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify project access if specified
          if (projectId) {
            const access = await verifyMcpProjectAccess(projectId)
            if (!access.hasAccess) return mcpError("Project not found or access denied")
          }

          const [decision] = await sql`
            INSERT INTO mlp_why_decisions (
              user_id, project_id, idea_id, title, summary, tags, domains,
              business_drivers, technical_constraints
            )
            VALUES (
              ${userId}, ${projectId || null}, ${ideaId || null}, ${title}, ${summary || null},
              ${tags || []}, ${domains || []}, ${businessDrivers || []}, ${technicalConstraints || []}
            )
            RETURNING id, title, status
          `

          return mcpResponse({
            created: true,
            id: decision.id,
            title: decision.title,
            status: decision.status
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Add decision node
    // ==========================================
    server.tool(
      "add_decision_node",
      "Add a reasoning node to a decision episode. Nodes capture reasoning steps and alternatives.",
      {
        decisionId: z.string().describe("Decision episode ID"),
        reasoning: z.string().describe("The reasoning or decision point"),
        alternatives: z.array(z.object({
          name: z.string(),
          pros: z.array(z.string()),
          cons: z.array(z.string())
        })).optional().describe("Alternatives considered"),
        constraints: z.array(z.string()).optional().describe("Constraints that influenced this decision"),
        confidenceLevel: z.number().min(0).max(100).optional().describe("Confidence level (0-100)"),
      },
      async ({ decisionId, reasoning, alternatives, constraints, confidenceLevel }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify decision ownership
          const [decision] = await sql`
            SELECT id FROM mlp_why_decisions WHERE id = ${decisionId} AND user_id = ${userId}
          `
          if (!decision) return mcpError("Decision not found or access denied")

          // Get max order_index
          const [{ maxOrder }] = await sql`
            SELECT COALESCE(MAX(order_index), -1)::int as "maxOrder"
            FROM mlp_why_nodes WHERE episode_id = ${decisionId}
          `

          const [node] = await sql`
            INSERT INTO mlp_why_nodes (
              episode_id, reasoning, alternatives, constraints, confidence_level, order_index
            )
            VALUES (
              ${decisionId}, ${reasoning}, ${JSON.stringify(alternatives || [])},
              ${constraints || []}, ${confidenceLevel || null}, ${maxOrder + 1}
            )
            RETURNING id
          `

          return mcpResponse({ created: true, id: node.id, decisionId })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Record failed attempt
    // ==========================================
    server.tool(
      "record_attempt",
      "Record a failed attempt or lesson learned for a decision. Helps prevent repeating mistakes.",
      {
        decisionId: z.string().describe("Decision episode ID"),
        problem: z.string().describe("The problem encountered"),
        approachTried: z.string().describe("What approach was tried"),
        failureMode: z.string().describe("How it failed"),
        rootCause: z.string().optional().describe("Root cause analysis"),
        lessonLearned: z.string().describe("Lesson learned from this attempt"),
        preventionStrategy: z.string().optional().describe("How to prevent this in future"),
      },
      async ({ decisionId, problem, approachTried, failureMode, rootCause, lessonLearned, preventionStrategy }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify decision ownership
          const [decision] = await sql`
            SELECT id FROM mlp_why_decisions WHERE id = ${decisionId} AND user_id = ${userId}
          `
          if (!decision) return mcpError("Decision not found or access denied")

          const [attempt] = await sql`
            INSERT INTO mlp_why_attempts (
              episode_id, problem, approach_tried, failure_mode, root_cause, lesson_learned, prevention_strategy
            )
            VALUES (
              ${decisionId}, ${problem}, ${approachTried}, ${failureMode},
              ${rootCause || null}, ${lessonLearned}, ${preventionStrategy || null}
            )
            RETURNING id
          `

          return mcpResponse({ recorded: true, id: attempt.id, decisionId })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Search memory
    // ==========================================
    server.tool(
      "search_memory",
      "Search across all memory layers (decisions, lessons, milestones) using full-text search.",
      {
        query: z.string().describe("Search query"),
        layers: z.array(z.enum(["why", "when", "who"])).optional().describe("Layers to search (default: all)"),
        projectId: z.string().optional().describe("Limit to specific project"),
        limit: z.number().optional().describe("Max results per layer"),
      },
      async ({ query, layers, projectId, limit }) => {
        try {
          const userId = getMcpUserId()
          const actualLimit = Math.min(limit || 10, 30)
          const searchLayers = layers || ["why", "when", "who"]
          const results: Record<string, unknown[]> = {}

          // Search WHY layer (decisions)
          if (searchLayers.includes("why")) {
            const decisions = await sql`
              SELECT id, title, summary, 'decision' as type
              FROM mlp_why_decisions
              WHERE user_id = ${userId}
                ${projectId ? sql`AND project_id = ${projectId}` : sql``}
                AND (title ILIKE ${'%' + query + '%'} OR summary ILIKE ${'%' + query + '%'})
              ORDER BY updated_at DESC
              LIMIT ${actualLimit}
            `
            results.decisions = decisions.map((d: Record<string, unknown>) => ({
              id: d.id,
              title: d.title,
              summary: truncate(d.summary as string, 100),
              type: d.type
            }))
          }

          // Search WHEN layer (milestones)
          if (searchLayers.includes("when")) {
            const milestones = await sql`
              SELECT id, title, description, status, 'milestone' as type
              FROM mlp_when_milestones
              WHERE user_id = ${userId}
                ${projectId ? sql`AND project_id = ${projectId}` : sql``}
                AND (title ILIKE ${'%' + query + '%'} OR description ILIKE ${'%' + query + '%'})
              ORDER BY created_at DESC
              LIMIT ${actualLimit}
            `
            results.milestones = milestones.map((m: Record<string, unknown>) => ({
              id: m.id,
              title: m.title,
              description: truncate(m.description as string, 100),
              status: m.status,
              type: m.type
            }))
          }

          // Search WHO layer (collaborators)
          if (searchLayers.includes("who")) {
            const collaborators = await sql`
              SELECT id, name, collaborator_type, expertise, 'collaborator' as type
              FROM mlp_who_collaborators
              WHERE user_id = ${userId}
                AND (name ILIKE ${'%' + query + '%'} OR ${query} = ANY(expertise))
              LIMIT ${actualLimit}
            `
            results.collaborators = collaborators.map((c: Record<string, unknown>) => ({
              id: c.id,
              name: c.name,
              type: c.collaborator_type,
              expertise: c.expertise
            }))
          }

          return mcpResponse({
            query,
            results,
            totalMatches: Object.values(results).reduce((sum, arr) => sum + arr.length, 0)
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // FINANCE MODULE TOOLS
    // ==========================================

    // ==========================================
    // Tool: Get finance summary
    // ==========================================
    server.tool(
      "get_finance_summary",
      "Get financial summary including net worth, cash flow, budgets, and upcoming bills.",
      {
        period: z.enum(["week", "month", "quarter", "year"]).optional().describe("Time period for cash flow (default: month)"),
      },
      async ({ period = "month" }) => {
        try {
          const userId = getMcpUserId()

          // Determine date range
          let startDateExpr: string
          switch (period) {
            case "week": startDateExpr = "CURRENT_DATE - INTERVAL '7 days'"; break
            case "quarter": startDateExpr = "date_trunc('quarter', CURRENT_DATE)"; break
            case "year": startDateExpr = "date_trunc('year', CURRENT_DATE)"; break
            default: startDateExpr = "date_trunc('month', CURRENT_DATE)"
          }

          // Account summary
          const [accounts] = await sql`
            SELECT
              SUM(CASE WHEN account_type NOT IN ('credit_card', 'loan') THEN current_balance ELSE 0 END) as assets,
              SUM(CASE WHEN account_type IN ('credit_card', 'loan') THEN ABS(current_balance) ELSE 0 END) as liabilities,
              COUNT(*) as account_count
            FROM finance_accounts
            WHERE user_id = ${userId} AND deleted_at IS NULL AND is_active = true
          `

          // Transaction summary
          const [transactions] = await sql`
            SELECT
              SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income,
              SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expenses,
              COUNT(*) as count
            FROM finance_transactions
            WHERE user_id = ${userId} AND transaction_date >= ${sql.unsafe(startDateExpr)}
          `

          // Budget status
          const [budgets] = await sql`
            SELECT
              COUNT(*) as total,
              SUM(amount) as budgeted
            FROM finance_budgets
            WHERE user_id = ${userId} AND is_active = true AND deleted_at IS NULL
          `

          // Goals
          const [goals] = await sql`
            SELECT
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE is_completed) as completed,
              SUM(current_amount) as saved,
              SUM(target_amount) as target
            FROM finance_goals
            WHERE user_id = ${userId} AND is_active = true AND deleted_at IS NULL
          `

          const assets = parseFloat(accounts?.assets || '0')
          const liabilities = parseFloat(accounts?.liabilities || '0')
          const income = parseFloat(transactions?.income || '0')
          const expenses = parseFloat(transactions?.expenses || '0')

          return mcpResponse({
            period,
            netWorth: {
              total: assets - liabilities,
              assets,
              liabilities,
              accounts: parseInt(accounts?.account_count || '0')
            },
            cashFlow: {
              income,
              expenses,
              net: income - expenses,
              transactions: parseInt(transactions?.count || '0')
            },
            budgets: {
              total: parseInt(budgets?.total || '0'),
              budgeted: parseFloat(budgets?.budgeted || '0')
            },
            goals: {
              total: parseInt(goals?.total || '0'),
              completed: parseInt(goals?.completed || '0'),
              saved: parseFloat(goals?.saved || '0'),
              target: parseFloat(goals?.target || '0')
            }
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: List transactions
    // ==========================================
    server.tool(
      "list_transactions",
      "List financial transactions with optional filters.",
      {
        type: z.enum(["income", "expense", "transfer"]).optional().describe("Filter by type"),
        accountId: z.string().optional().describe("Filter by account"),
        categoryId: z.string().optional().describe("Filter by category"),
        startDate: z.string().optional().describe("Start date (ISO format)"),
        endDate: z.string().optional().describe("End date (ISO format)"),
        search: z.string().optional().describe("Search description/merchant"),
        brief: z.boolean().optional().describe("Return minimal fields"),
        limit: z.number().optional().describe("Max results"),
      },
      async ({ type, accountId, categoryId, startDate, endDate, search, brief, limit }) => {
        try {
          const userId = getMcpUserId()
          const actualLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT)

          const transactions = await sql`
            SELECT t.*, a.name as account_name, c.name as category_name
            FROM finance_transactions t
            LEFT JOIN finance_accounts a ON t.account_id = a.id
            LEFT JOIN finance_categories c ON t.category_id = c.id
            WHERE t.user_id = ${userId}
              ${type ? sql`AND t.transaction_type = ${type}` : sql``}
              ${accountId ? sql`AND t.account_id = ${accountId}` : sql``}
              ${categoryId ? sql`AND t.category_id = ${categoryId}` : sql``}
              ${startDate ? sql`AND t.transaction_date >= ${startDate}` : sql``}
              ${endDate ? sql`AND t.transaction_date <= ${endDate}` : sql``}
              ${search ? sql`AND (t.description ILIKE ${'%' + search + '%'} OR t.merchant ILIKE ${'%' + search + '%'})` : sql``}
            ORDER BY t.transaction_date DESC, t.created_at DESC
            LIMIT ${actualLimit}
          `

          const data = brief
            ? transactions.map((t: Record<string, unknown>) => ({
                id: t.id,
                date: t.transaction_date,
                type: t.transaction_type,
                amount: parseFloat(t.amount as string),
                merchant: truncate(t.merchant as string, 30) || truncate(t.description as string, 30)
              }))
            : transactions.map((t: Record<string, unknown>) => ({
                id: t.id,
                date: t.transaction_date,
                type: t.transaction_type,
                amount: parseFloat(t.amount as string),
                description: t.description,
                merchant: t.merchant,
                account: t.account_name,
                category: t.category_name
              }))

          return mcpResponse({ transactions: data, count: transactions.length })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Create transaction
    // ==========================================
    server.tool(
      "create_transaction",
      "Create a new financial transaction.",
      {
        accountId: z.string().describe("Account ID"),
        type: z.enum(["income", "expense", "transfer"]).describe("Transaction type"),
        amount: z.number().positive().describe("Amount (positive number)"),
        description: z.string().optional().describe("Description"),
        merchant: z.string().optional().describe("Merchant name"),
        categoryId: z.string().optional().describe("Category ID"),
        date: z.string().optional().describe("Transaction date (ISO format, defaults to today)"),
      },
      async ({ accountId, type, amount, description, merchant, categoryId, date }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify account ownership
          const [account] = await sql`
            SELECT id FROM finance_accounts WHERE id = ${accountId} AND user_id = ${userId} AND deleted_at IS NULL
          `
          if (!account) return mcpError("Account not found or access denied")

          const [transaction] = await sql`
            INSERT INTO finance_transactions (
              user_id, account_id, transaction_type, amount, description, merchant, category_id, transaction_date
            )
            VALUES (
              ${userId}, ${accountId}, ${type}, ${amount}, ${description || null},
              ${merchant || null}, ${categoryId || null}, ${date || sql`CURRENT_DATE`}
            )
            RETURNING id, transaction_type, amount, transaction_date
          `

          // Update account balance
          const balanceChange = type === "income" ? amount : -amount
          await sql`
            UPDATE finance_accounts
            SET current_balance = current_balance + ${balanceChange}, updated_at = NOW()
            WHERE id = ${accountId}
          `

          return mcpResponse({
            created: true,
            id: transaction.id,
            type: transaction.transaction_type,
            amount: parseFloat(transaction.amount),
            date: transaction.transaction_date
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: List accounts
    // ==========================================
    server.tool(
      "list_accounts",
      "List financial accounts.",
      {
        type: z.enum(["checking", "savings", "credit_card", "investment", "cash", "loan", "other"]).optional().describe("Filter by type"),
        brief: z.boolean().optional().describe("Return minimal fields"),
      },
      async ({ type, brief }) => {
        try {
          const userId = getMcpUserId()

          const accounts = await sql`
            SELECT * FROM finance_accounts
            WHERE user_id = ${userId} AND deleted_at IS NULL AND is_active = true
              ${type ? sql`AND account_type = ${type}` : sql``}
            ORDER BY account_type, name
          `

          const data = brief
            ? accounts.map((a: Record<string, unknown>) => ({
                id: a.id,
                name: a.name,
                type: a.account_type,
                balance: parseFloat(a.current_balance as string)
              }))
            : accounts.map((a: Record<string, unknown>) => ({
                id: a.id,
                name: a.name,
                type: a.account_type,
                institution: a.institution,
                balance: parseFloat(a.current_balance as string),
                currency: a.currency,
                lastSync: a.last_synced_at
              }))

          return mcpResponse({ accounts: data, count: accounts.length })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // CALENDAR MODULE TOOLS
    // ==========================================

    // ==========================================
    // Tool: Get agenda
    // ==========================================
    server.tool(
      "get_agenda",
      "Get calendar agenda for a date range. Combines events, todos with due dates, and milestones.",
      {
        startDate: z.string().optional().describe("Start date (ISO format, defaults to today)"),
        endDate: z.string().optional().describe("End date (ISO format, defaults to +7 days)"),
        includeTodos: z.boolean().optional().describe("Include todos with due dates (default: true)"),
        includeMilestones: z.boolean().optional().describe("Include project milestones (default: true)"),
      },
      async ({ startDate, endDate, includeTodos = true, includeMilestones = true }) => {
        try {
          const userId = getMcpUserId()

          // Get calendar events
          const events = await sql`
            SELECT e.*, c.name as category_name, c.color as category_color
            FROM calendar_events e
            LEFT JOIN calendar_categories c ON e.category_id = c.id
            WHERE e.user_id = ${userId}
              AND e.deleted_at IS NULL
              AND e.start_time >= ${startDate || sql`CURRENT_DATE`}
              AND e.start_time <= ${endDate || sql`CURRENT_DATE + INTERVAL '7 days'`}
            ORDER BY e.start_time
          `

          const agendaItems: Record<string, unknown>[] = events.map((e: Record<string, unknown>) => ({
            id: e.id,
            type: "event",
            title: e.title,
            start: e.start_time,
            end: e.end_time,
            allDay: e.all_day,
            category: e.category_name,
            color: e.category_color,
            location: e.location
          }))

          // Get todos with due dates
          if (includeTodos) {
            const todos = await sql`
              SELECT id, title, priority, due_date, status
              FROM todos
              WHERE user_id = ${userId}
                AND deleted_at IS NULL
                AND due_date IS NOT NULL
                AND due_date >= ${startDate || sql`CURRENT_DATE`}
                AND due_date <= ${endDate || sql`CURRENT_DATE + INTERVAL '7 days'`}
              ORDER BY due_date
            `
            for (const t of todos) {
              agendaItems.push({
                id: t.id,
                type: "todo",
                title: t.title,
                start: t.due_date,
                priority: t.priority,
                status: t.status
              })
            }
          }

          // Get milestones
          if (includeMilestones) {
            const milestones = await sql`
              SELECT m.id, m.title, m.target_date, m.status, p.name as project_name
              FROM mlp_when_milestones m
              LEFT JOIN projects p ON m.project_id = p.id
              WHERE m.user_id = ${userId}
                AND m.target_date IS NOT NULL
                AND m.target_date >= ${startDate || sql`CURRENT_DATE`}
                AND m.target_date <= ${endDate || sql`CURRENT_DATE + INTERVAL '7 days'`}
              ORDER BY m.target_date
            `
            for (const m of milestones) {
              agendaItems.push({
                id: m.id,
                type: "milestone",
                title: m.title,
                start: m.target_date,
                status: m.status,
                project: m.project_name
              })
            }
          }

          // Sort by start date/time
          agendaItems.sort((a, b) => new Date(a.start as string).getTime() - new Date(b.start as string).getTime())

          return mcpResponse({
            agenda: agendaItems,
            range: { start: startDate || "today", end: endDate || "+7 days" },
            count: agendaItems.length
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Create calendar event
    // ==========================================
    server.tool(
      "create_event",
      "Create a new calendar event.",
      {
        title: z.string().describe("Event title"),
        startTime: z.string().describe("Start time (ISO format)"),
        endTime: z.string().optional().describe("End time (ISO format)"),
        allDay: z.boolean().optional().describe("Is all-day event"),
        description: z.string().optional().describe("Event description"),
        location: z.string().optional().describe("Event location"),
        categoryId: z.string().optional().describe("Category ID"),
        projectId: z.string().optional().describe("Link to project"),
        todoId: z.string().optional().describe("Link to todo"),
      },
      async ({ title, startTime, endTime, allDay, description, location, categoryId, projectId, todoId }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          const [event] = await sql`
            INSERT INTO calendar_events (
              user_id, title, start_time, end_time, all_day, description, location,
              category_id, project_id, todo_id
            )
            VALUES (
              ${userId}, ${title}, ${startTime}, ${endTime || null}, ${allDay || false},
              ${description || null}, ${location || null}, ${categoryId || null},
              ${projectId || null}, ${todoId || null}
            )
            RETURNING id, title, start_time, end_time
          `

          return mcpResponse({
            created: true,
            id: event.id,
            title: event.title,
            start: event.start_time,
            end: event.end_time
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // AGENT JOBS TOOLS
    // ==========================================

    // ==========================================
    // Tool: List agent jobs
    // ==========================================
    server.tool(
      "list_agent_jobs",
      "List agent jobs (tasks assigned to AI agents) with optional filters.",
      {
        status: z.enum(["pending", "claimed", "in_progress", "completed", "failed", "cancelled"]).optional().describe("Filter by status"),
        agentId: z.string().optional().describe("Filter by agent"),
        projectId: z.string().optional().describe("Filter by project"),
        brief: z.boolean().optional().describe("Return minimal fields"),
        limit: z.number().optional().describe("Max results"),
      },
      async ({ status, agentId, projectId, brief, limit }) => {
        try {
          const userId = getMcpUserId()
          const actualLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT)

          const jobs = await sql`
            SELECT j.*, p.name as project_name, a.name as agent_name
            FROM agent_jobs j
            LEFT JOIN projects p ON j.project_id = p.id
            LEFT JOIN agents a ON j.agent_id = a.id
            WHERE j.created_by = ${userId}
              ${status ? sql`AND j.status = ${status}` : sql``}
              ${agentId ? sql`AND j.agent_id = ${agentId}` : sql``}
              ${projectId ? sql`AND j.project_id = ${projectId}` : sql``}
            ORDER BY j.created_at DESC
            LIMIT ${actualLimit}
          `

          const data = brief
            ? jobs.map((j: Record<string, unknown>) => ({
                id: j.id,
                title: truncate(j.title as string, 50),
                status: j.status,
                agent: j.agent_name,
                priority: j.priority
              }))
            : jobs.map((j: Record<string, unknown>) => ({
                id: j.id,
                title: j.title,
                description: truncate(j.description as string, 150),
                status: j.status,
                priority: j.priority,
                agent: j.agent_name,
                project: j.project_name,
                checkpoint: j.checkpoint,
                created_at: j.created_at,
                started_at: j.started_at,
                completed_at: j.completed_at
              }))

          return mcpResponse({ jobs: data, count: jobs.length })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Create agent job
    // ==========================================
    server.tool(
      "create_agent_job",
      "Create a new job for an AI agent to work on.",
      {
        title: z.string().describe("Job title"),
        description: z.string().optional().describe("Job description/instructions"),
        projectId: z.string().optional().describe("Link to project"),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Priority (default: medium)"),
        metadata: z.record(z.unknown()).optional().describe("Additional metadata"),
      },
      async ({ title, description, projectId, priority = "medium", metadata }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify project access if specified
          if (projectId) {
            const access = await verifyMcpProjectAccess(projectId)
            if (!access.hasAccess) return mcpError("Project not found or access denied")
          }

          const [job] = await sql`
            INSERT INTO agent_jobs (
              created_by, project_id, title, description, priority, status, metadata
            )
            VALUES (
              ${userId}, ${projectId || null}, ${title}, ${description || null},
              ${priority}, 'pending', ${JSON.stringify(metadata || {})}
            )
            RETURNING id, title, status, priority
          `

          return mcpResponse({
            created: true,
            id: job.id,
            title: job.title,
            status: job.status,
            priority: job.priority
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // Tool: Update agent job status
    // ==========================================
    server.tool(
      "update_job_status",
      "Update the status of an agent job. Agents use this to claim, start, complete, or fail jobs.",
      {
        jobId: z.string().describe("Job ID"),
        status: z.enum(["claimed", "in_progress", "completed", "failed", "cancelled"]).describe("New status"),
        checkpoint: z.string().optional().describe("Checkpoint data for resuming"),
        result: z.record(z.unknown()).optional().describe("Result data (for completed jobs)"),
        error: z.string().optional().describe("Error message (for failed jobs)"),
      },
      async ({ jobId, status, checkpoint, result, error }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()

          // Verify job exists and user has access
          const [job] = await sql`
            SELECT id, status, created_by FROM agent_jobs WHERE id = ${jobId}
          `
          if (!job) return mcpError("Job not found")
          if (job.created_by !== userId) return mcpError("Access denied")

          // Update based on status
          let updateFields: Record<string, unknown> = { status }
          if (status === "claimed") updateFields.claimed_at = sql`NOW()`
          if (status === "in_progress") updateFields.started_at = sql`NOW()`
          if (status === "completed") updateFields.completed_at = sql`NOW()`
          if (checkpoint) updateFields.checkpoint = checkpoint
          if (result) updateFields.result = JSON.stringify(result)
          if (error) updateFields.error_message = error

          const [updated] = await sql`
            UPDATE agent_jobs
            SET
              status = ${status},
              checkpoint = COALESCE(${checkpoint ?? null}, checkpoint),
              result = CASE WHEN ${result !== undefined} THEN ${JSON.stringify(result || {})} ELSE result END,
              error_message = COALESCE(${error ?? null}, error_message),
              claimed_at = CASE WHEN ${status === "claimed"} THEN NOW() ELSE claimed_at END,
              started_at = CASE WHEN ${status === "in_progress"} THEN NOW() ELSE started_at END,
              completed_at = CASE WHEN ${status === "completed" || status === "failed"} THEN NOW() ELSE completed_at END,
              updated_at = NOW()
            WHERE id = ${jobId}
            RETURNING id, title, status
          `

          return mcpResponse({
            updated: true,
            id: updated.id,
            title: updated.title,
            status: updated.status
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // DASHBOARD TOOLS
    // ==========================================

    // ==========================================
    // Tool: Get dashboard summary
    // ==========================================
    server.tool(
      "get_dashboard",
      "Get unified dashboard summary with projects, todos, ideas, and recent activity.",
      {
        brief: z.boolean().optional().describe("Return minimal fields"),
      },
      async ({ brief }) => {
        try {
          const userId = getMcpUserId()

          // Projects summary
          const [projectStats] = await sql`
            SELECT
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'in-progress') as active,
              COUNT(*) FILTER (WHERE status = 'completed') as completed
            FROM projects
            WHERE user_id = ${userId} AND deleted_at IS NULL
          `

          // Todos summary
          const [todoStats] = await sql`
            SELECT
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed,
              COUNT(*) FILTER (WHERE due_date = CURRENT_DATE AND status != 'completed') as due_today,
              COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed') as overdue
            FROM todos
            WHERE user_id = ${userId} AND deleted_at IS NULL
          `

          // Ideas summary
          const [ideaStats] = await sql`
            SELECT
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE lifecycle = 'seed') as seeds,
              COUNT(*) FILTER (WHERE lifecycle = 'exploring') as exploring,
              COUNT(*) FILTER (WHERE lifecycle = 'refined') as refined
            FROM ideas
            WHERE user_id = ${userId} AND deleted_at IS NULL AND lifecycle != 'archived'
          `

          // Recent activity
          const recentActivity = await sql`
            (SELECT 'project' as type, id, name as title, updated_at FROM projects WHERE user_id = ${userId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 3)
            UNION ALL
            (SELECT 'todo' as type, id, title, updated_at FROM todos WHERE user_id = ${userId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 3)
            UNION ALL
            (SELECT 'idea' as type, id, title, updated_at FROM ideas WHERE user_id = ${userId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 3)
            ORDER BY updated_at DESC
            LIMIT 10
          `

          return mcpResponse({
            projects: {
              total: parseInt(projectStats?.total || '0'),
              active: parseInt(projectStats?.active || '0'),
              completed: parseInt(projectStats?.completed || '0')
            },
            todos: {
              total: parseInt(todoStats?.total || '0'),
              completed: parseInt(todoStats?.completed || '0'),
              dueToday: parseInt(todoStats?.due_today || '0'),
              overdue: parseInt(todoStats?.overdue || '0')
            },
            ideas: {
              total: parseInt(ideaStats?.total || '0'),
              seeds: parseInt(ideaStats?.seeds || '0'),
              exploring: parseInt(ideaStats?.exploring || '0'),
              refined: parseInt(ideaStats?.refined || '0')
            },
            recentActivity: brief
              ? recentActivity.map((a: Record<string, unknown>) => ({ type: a.type, title: truncate(a.title as string, 40) }))
              : recentActivity.map((a: Record<string, unknown>) => ({ type: a.type, id: a.id, title: a.title, updatedAt: a.updated_at }))
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // GLOBAL SEARCH TOOL
    // ==========================================

    // ==========================================
    // Tool: Global search
    // ==========================================
    server.tool(
      "global_search",
      "Search across all modules: projects, ideas, todos, decisions, documents.",
      {
        query: z.string().describe("Search query"),
        types: z.array(z.enum(["project", "idea", "todo", "decision", "document"])).optional().describe("Types to search (default: all)"),
        limit: z.number().optional().describe("Max results per type"),
      },
      async ({ query, types, limit }) => {
        try {
          const userId = getMcpUserId()
          const actualLimit = Math.min(limit || 5, 20)
          const searchTypes = types || ["project", "idea", "todo", "decision", "document"]
          const results: Record<string, unknown[]> = {}

          if (searchTypes.includes("project")) {
            const projects = await sql`
              SELECT id, name as title, description, 'project' as type
              FROM projects
              WHERE user_id = ${userId} AND deleted_at IS NULL
                AND (name ILIKE ${'%' + query + '%'} OR description ILIKE ${'%' + query + '%'})
              LIMIT ${actualLimit}
            `
            results.projects = projects.map((p: Record<string, unknown>) => ({
              id: p.id, title: p.title, description: truncate(p.description as string, 80), type: p.type
            }))
          }

          if (searchTypes.includes("idea")) {
            const ideas = await sql`
              SELECT id, title, description, 'idea' as type
              FROM ideas
              WHERE user_id = ${userId} AND deleted_at IS NULL
                AND (title ILIKE ${'%' + query + '%'} OR description ILIKE ${'%' + query + '%'})
              LIMIT ${actualLimit}
            `
            results.ideas = ideas.map((i: Record<string, unknown>) => ({
              id: i.id, title: i.title, description: truncate(i.description as string, 80), type: i.type
            }))
          }

          if (searchTypes.includes("todo")) {
            const todos = await sql`
              SELECT id, title, description, 'todo' as type
              FROM todos
              WHERE user_id = ${userId} AND deleted_at IS NULL
                AND (title ILIKE ${'%' + query + '%'} OR description ILIKE ${'%' + query + '%'})
              LIMIT ${actualLimit}
            `
            results.todos = todos.map((t: Record<string, unknown>) => ({
              id: t.id, title: t.title, description: truncate(t.description as string, 80), type: t.type
            }))
          }

          if (searchTypes.includes("decision")) {
            const decisions = await sql`
              SELECT id, title, summary as description, 'decision' as type
              FROM mlp_why_decisions
              WHERE user_id = ${userId}
                AND (title ILIKE ${'%' + query + '%'} OR summary ILIKE ${'%' + query + '%'})
              LIMIT ${actualLimit}
            `
            results.decisions = decisions.map((d: Record<string, unknown>) => ({
              id: d.id, title: d.title, description: truncate(d.description as string, 80), type: d.type
            }))
          }

          if (searchTypes.includes("document")) {
            const documents = await sql`
              SELECT d.id, d.title, d.content as description, 'document' as type
              FROM documents d
              JOIN projects p ON d.project_id = p.id
              WHERE p.user_id = ${userId} AND d.deleted_at IS NULL
                AND (d.title ILIKE ${'%' + query + '%'} OR d.content ILIKE ${'%' + query + '%'})
              LIMIT ${actualLimit}
            `
            results.documents = documents.map((d: Record<string, unknown>) => ({
              id: d.id, title: d.title, description: truncate(d.description as string, 80), type: d.type
            }))
          }

          const totalMatches = Object.values(results).reduce((sum, arr) => sum + arr.length, 0)

          return mcpResponse({
            query,
            results,
            totalMatches
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ==========================================
    // BACKBONE FOUNDATION TOOLS
    // Workers registry, delegation unlock, sources federation
    // (migrations 033-036)
    // ==========================================

    // ---------- Workers ----------

    server.tool(
      "register_worker",
      "Register an execution site (worker) — local Claude Code, cloud SDK, GPT/Gemini endpoint, human, cron, webhook. Returns the worker id.",
      {
        kind: z.string().describe("Worker kind, e.g. claude_code_local, openai_gpt5, human_owner"),
        name: z.string().describe("Human-readable worker name"),
        capabilities: z.record(z.unknown()).optional().describe("Capability descriptor: { tools, models, max_context, supports_unlock, ... }"),
        status: z.enum(["active", "inactive", "busy", "error"]).optional().describe("Initial status (default: active)"),
        shared: z.boolean().optional().describe("If true, create as a shared/system worker (user_id = null). Default: false"),
        metadata: z.record(z.unknown()).optional().describe("Freeform metadata"),
      },
      async ({ kind, name, capabilities, status, shared, metadata }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()
          const worker = await createWorker({
            userId: shared ? null : userId,
            kind,
            name,
            capabilities: (capabilities as Record<string, unknown>) ?? {},
            status: status ?? "active",
            metadata: (metadata as Record<string, unknown>) ?? {},
          })
          return mcpResponse({
            registered: true,
            id: worker.id,
            kind: worker.kind,
            name: worker.name,
            status: worker.status,
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    server.tool(
      "heartbeat_worker",
      "Update a worker's liveness: sets last_seen_at = NOW() and updates status. Call on a schedule.",
      {
        workerId: z.string().describe("Worker id"),
        status: z.enum(["active", "inactive", "busy", "error"]).optional().describe("New status (default: active)"),
      },
      async ({ workerId, status }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()
          const existing = await getWorker(workerId)
          if (!existing) return mcpError("Worker not found")
          if (existing.user_id !== null && existing.user_id !== userId) {
            return mcpError("Access denied")
          }
          const updated = await updateWorkerStatus(workerId, status ?? "active")
          if (!updated) return mcpError("Worker not found")
          return mcpResponse({
            heartbeat: true,
            id: updated.id,
            status: updated.status,
            last_seen_at: updated.last_seen_at,
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    server.tool(
      "list_workers",
      "List registered workers. Returns the caller's workers plus shared system workers by default.",
      {
        kind: z.string().optional().describe("Filter by worker kind"),
        status: z.enum(["active", "inactive", "busy", "error"]).optional().describe("Filter by status"),
        includeShared: z.boolean().optional().describe("Include shared/system workers (default: true)"),
        limit: z.number().optional().describe("Max results (default: 50)"),
      },
      async ({ kind, status, includeShared, limit }) => {
        try {
          const userId = getMcpUserId()
          const workers = await listWorkers({
            userId,
            kind,
            status,
            includeShared: includeShared ?? true,
            limit,
          })
          return mcpResponse({
            workers: workers.map((w) => ({
              id: w.id,
              kind: w.kind,
              name: w.name,
              status: w.status,
              shared: w.user_id === null,
              last_seen_at: w.last_seen_at,
              capabilities: w.capabilities,
            })),
            count: workers.length,
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ---------- Job claim / unlock lifecycle ----------

    server.tool(
      "claim_job",
      "Worker claims an agent_job: sets worker_id and status='claimed'. Fails if another worker already holds it.",
      {
        jobId: z.string().describe("Agent job id"),
        workerId: z.string().describe("Worker id claiming the job"),
      },
      async ({ jobId, workerId }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()
          // Verify the job is owned by this user
          const [job] = await sql`
            SELECT id, created_by FROM agent_jobs WHERE id = ${jobId}
          `
          if (!job) return mcpError("Job not found")
          if (job.created_by !== userId) return mcpError("Access denied")
          // Verify the worker belongs to this user (or is shared)
          const worker = await getWorker(workerId)
          if (!worker) return mcpError("Worker not found")
          if (worker.user_id !== null && worker.user_id !== userId) {
            return mcpError("Access denied on worker")
          }
          const claimed = await claimJob(jobId, workerId)
          if (!claimed) return mcpError("Job could not be claimed (already held or wrong status)")
          return mcpResponse({
            claimed: true,
            id: claimed.id,
            status: claimed.status,
            worker_id: claimed.worker_id,
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    server.tool(
      "request_unlock",
      "Agent transitions a job to 'awaiting-unlock': pauses execution until the owner acts, approves, or decides.",
      {
        jobId: z.string().describe("Agent job id"),
        prompt: z.string().describe("What the owner needs to do/decide/approve"),
      },
      async ({ jobId, prompt }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()
          const [job] = await sql`
            SELECT id, created_by FROM agent_jobs WHERE id = ${jobId}
          `
          if (!job) return mcpError("Job not found")
          if (job.created_by !== userId) return mcpError("Access denied")
          const updated = await transitionJobToUnlock(jobId, prompt)
          if (!updated) return mcpError("Unable to transition job")
          return mcpResponse({
            unlock_requested: true,
            id: updated.id,
            status: updated.status,
            unlock_prompt: updated.unlock_prompt,
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    server.tool(
      "resolve_unlock",
      "Owner resolves a job awaiting unlock: moves it back to 'queued' so a worker can resume. Accepts an optional note (approval/rejection rationale).",
      {
        jobId: z.string().describe("Agent job id"),
        note: z.string().optional().describe("Owner note captured at resolution time"),
      },
      async ({ jobId, note }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()
          const [job] = await sql`
            SELECT id, created_by, status FROM agent_jobs WHERE id = ${jobId}
          `
          if (!job) return mcpError("Job not found")
          if (job.created_by !== userId) return mcpError("Access denied")
          if (job.status !== "awaiting-unlock") {
            return mcpError(`Job is not awaiting unlock (status=${job.status})`)
          }
          const resolved = await resolveUnlock(jobId, userId, note)
          if (!resolved) return mcpError("Unable to resolve unlock")
          return mcpResponse({
            resolved: true,
            id: resolved.id,
            status: resolved.status,
            unlock_resolved_at: resolved.unlock_resolved_at,
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    server.tool(
      "list_awaiting_unlocks",
      "Owner query: list all agent jobs currently in status 'awaiting-unlock'. This is 'what's waiting for me?'.",
      {
        limit: z.number().optional().describe("Max results (default: 50)"),
      },
      async ({ limit }) => {
        try {
          const userId = getMcpUserId()
          const jobs = await listAwaitingUnlocks({ userId, limit })
          return mcpResponse({
            jobs: jobs.map((j) => ({
              id: j.id,
              title: j.title,
              unlock_prompt: j.unlock_prompt,
              parent_step_id: j.parent_step_id,
              worker_id: j.worker_id,
              created_at: j.created_at,
            })),
            count: jobs.length,
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    // ---------- Sources (federation scaffolding) ----------

    server.tool(
      "create_source",
      "Link a planner entity (step, job, or todo) to an external source (GitHub issue, Vercel deployment, agent-com job, ...). Schema-only — no sync logic yet.",
      {
        kind: z.string().describe("Source kind, e.g. github_issue, vercel_deployment, agent_com_job"),
        stepId: z.string().optional().describe("Target project_step id"),
        jobId: z.string().optional().describe("Target agent_job id"),
        todoId: z.string().optional().describe("Target todo id"),
        externalId: z.string().optional().describe("Upstream record id"),
        externalUrl: z.string().optional().describe("Upstream deep link"),
        status: z.string().optional().describe("Upstream status snapshot"),
        metadata: z.record(z.unknown()).optional().describe("Freeform metadata"),
      },
      async ({ kind, stepId, jobId, todoId, externalId, externalUrl, status, metadata }) => {
        try {
          requireMcpScope("write")
          const userId = getMcpUserId()
          if (!stepId && !jobId && !todoId) {
            return mcpError("At least one of stepId, jobId, todoId must be set")
          }
          const source = await createSource({
            userId,
            kind,
            stepId,
            jobId,
            todoId,
            externalId,
            externalUrl,
            status,
            metadata: (metadata as Record<string, unknown>) ?? {},
          })
          return mcpResponse({
            created: true,
            id: source.id,
            kind: source.kind,
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    server.tool(
      "list_sources_for_step",
      "List external sources linked to a project step.",
      {
        stepId: z.string().describe("Project step id"),
      },
      async ({ stepId }) => {
        try {
          const sources = await listSourcesForStep(stepId)
          return mcpResponse({
            sources: sources.map((s) => ({
              id: s.id,
              kind: s.kind,
              external_id: s.external_id,
              external_url: s.external_url,
              status: s.status,
              last_synced_at: s.last_synced_at,
            })),
            count: sources.length,
          })
        } catch (error: unknown) {
          return mcpError(error instanceof Error ? error.message : "Unknown error")
        }
      }
    )

    server.tool(
      "list_sources_for_job",
      "List external sources linked to an agent job.",
      {
        jobId: z.string().describe("Agent job id"),
      },
      async ({ jobId }) => {
        try {
          const sources = await listSourcesForJob(jobId)
          return mcpResponse({
            sources: sources.map((s) => ({
              id: s.id,
              kind: s.kind,
              external_id: s.external_id,
              external_url: s.external_url,
              status: s.status,
              last_synced_at: s.last_synced_at,
            })),
            count: sources.length,
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
