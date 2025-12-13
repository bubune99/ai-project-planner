/**
 * AI Chat Tools for AI Project Planner
 *
 * Comprehensive tool set that enables the AI assistant to:
 * 1. Navigate views and control the UI
 * 2. Manage projects, tasks, phases, and documents
 * 3. Provide contextual feedback via highlights and focus
 * 4. Track user interactions via telemetry
 */

import { tool } from "ai";
import { z } from "zod";
import { sql } from "@/lib/db/client";

// =============================================================================
// UI NAVIGATION TOOLS
// These tools allow the AI to control what the user sees
// =============================================================================

export const navigateToView = tool({
  description: "Navigate the user to a specific view/tab in the project dashboard. Use this when the user asks to see a different view or when showing relevant information.",
  parameters: z.object({
    view: z.enum(["dashboard", "tree", "gantt", "kanban", "flow", "docs"])
      .describe("The view to navigate to"),
    reason: z.string().optional()
      .describe("Brief explanation of why navigating (shown to user)"),
  }),
  execute: async ({ view, reason }) => {
    return {
      action: "navigate_view",
      view,
      reason,
      message: `Navigating to ${view} view${reason ? `: ${reason}` : ""}`,
    };
  },
});

export const openDocumentBrowser = tool({
  description: "Open the document browser sidebar to show project documents",
  parameters: z.object({
    filter: z.string().optional()
      .describe("Optional filter/search term for documents"),
  }),
  execute: async ({ filter }) => {
    return {
      action: "open_document_browser",
      filter,
      message: filter ? `Opening document browser with filter: ${filter}` : "Opening document browser",
    };
  },
});

export const closeDocumentBrowser = tool({
  description: "Close the document browser sidebar",
  parameters: z.object({
    confirm: z.boolean().default(false).describe("Confirmation flag"),
  }),
  execute: async () => {
    return {
      action: "close_document_browser",
      message: "Closing document browser",
    };
  },
});

// =============================================================================
// SELECTION & FOCUS TOOLS
// These tools allow the AI to highlight and focus on specific items
// =============================================================================

export const selectTask = tool({
  description: "Select and highlight a specific task in the current view. The task will be highlighted and its details shown.",
  parameters: z.object({
    taskId: z.string().describe("The ID of the task to select"),
    scrollTo: z.boolean().default(true)
      .describe("Whether to scroll the view to show the task"),
  }),
  execute: async ({ taskId, scrollTo }) => {
    // Fetch task details from database
    try {
      const [task] = await sql`
        SELECT id, title, status, phase, assigned_agent
        FROM project_steps
        WHERE id = ${taskId}
      `;

      if (!task) {
        return { error: "Task not found", taskId };
      }

      return {
        action: "select_task",
        taskId,
        scrollTo,
        task,
        message: `Selected task: ${task.title}`,
      };
    } catch (error) {
      return {
        action: "select_task",
        taskId,
        scrollTo,
        message: `Selecting task ${taskId}`,
      };
    }
  },
});

export const selectDocument = tool({
  description: "Select and highlight a specific document. Opens the document viewer with this document.",
  parameters: z.object({
    documentId: z.string().describe("The ID of the document to select"),
  }),
  execute: async ({ documentId }) => {
    try {
      const [doc] = await sql`
        SELECT id, title, category, doc_type
        FROM documents
        WHERE id = ${documentId}
      `;

      return {
        action: "select_document",
        documentId,
        document: doc,
        message: doc ? `Selected document: ${doc.title}` : `Selecting document ${documentId}`,
      };
    } catch {
      return {
        action: "select_document",
        documentId,
        message: `Selecting document ${documentId}`,
      };
    }
  },
});

export const highlightElements = tool({
  description: "Highlight multiple elements in the UI to draw attention. Use for showing related items, dependencies, or search results.",
  parameters: z.object({
    elementIds: z.array(z.string())
      .describe("Array of element IDs to highlight"),
    highlightType: z.enum(["pulse", "glow", "border", "shake"])
      .default("glow")
      .describe("Type of highlight animation"),
    duration: z.number().default(3000)
      .describe("Duration of highlight in milliseconds"),
    color: z.enum(["blue", "green", "yellow", "red", "purple"])
      .default("blue")
      .describe("Color of the highlight"),
  }),
  execute: async ({ elementIds, highlightType, duration, color }) => {
    return {
      action: "highlight_elements",
      elementIds,
      highlightType,
      duration,
      color,
      message: `Highlighting ${elementIds.length} element(s)`,
    };
  },
});

export const scrollToElement = tool({
  description: "Scroll the view to bring a specific element into view",
  parameters: z.object({
    elementId: z.string().describe("ID of the element to scroll to"),
    position: z.enum(["start", "center", "end"]).default("center")
      .describe("Where to position the element after scrolling"),
  }),
  execute: async ({ elementId, position }) => {
    return {
      action: "scroll_to_element",
      elementId,
      position,
      message: `Scrolling to element ${elementId}`,
    };
  },
});

export const showToast = tool({
  description: "Show a toast notification to the user",
  parameters: z.object({
    title: z.string().describe("Toast title"),
    description: z.string().optional().describe("Toast description"),
    type: z.enum(["default", "success", "error", "warning", "info"])
      .default("default")
      .describe("Type of toast notification"),
    duration: z.number().default(5000)
      .describe("Duration in milliseconds"),
  }),
  execute: async ({ title, description, type, duration }) => {
    return {
      action: "show_toast",
      title,
      description,
      type,
      duration,
      message: title,
    };
  },
});

// =============================================================================
// CONTEXT & TELEMETRY TOOLS
// These tools help the AI understand what the user is doing
// =============================================================================

export const getCurrentContext = tool({
  description: "Get the current UI context including active view, selected items, and recent user interactions. Use this to understand what the user is looking at before responding.",
  parameters: z.object({
    includeHistory: z.boolean().default(false).describe("Include recent interaction history"),
  }),
  execute: async () => {
    // This returns a marker that the frontend will intercept and fill with actual context
    return {
      action: "get_context",
      message: "Fetching current UI context",
    };
  },
});

export const trackUserFocus = tool({
  description: "Record where the user's attention is currently focused for context-aware responses",
  parameters: z.object({
    focusArea: z.enum(["task", "document", "phase", "timeline", "board", "flow"])
      .describe("The area where user is focused"),
    itemId: z.string().optional()
      .describe("ID of the specific item being focused on"),
  }),
  execute: async ({ focusArea, itemId }) => {
    return {
      action: "track_focus",
      focusArea,
      itemId,
      timestamp: new Date().toISOString(),
      message: `User focused on ${focusArea}${itemId ? `: ${itemId}` : ""}`,
    };
  },
});

// =============================================================================
// PROJECT MANAGEMENT TOOLS (Mirrors MCP capabilities)
// =============================================================================

export const listProjects = tool({
  description: "List all projects in the system",
  parameters: z.object({
    status: z.enum(["all", "planning", "in-progress", "completed", "on-hold"])
      .default("all")
      .describe("Filter by project status"),
  }),
  execute: async ({ status }) => {
    try {
      const projects = status === "all"
        ? await sql`SELECT id, name, description, status, current_phase, progress FROM projects ORDER BY created_at DESC`
        : await sql`SELECT id, name, description, status, current_phase, progress FROM projects WHERE status = ${status} ORDER BY created_at DESC`;

      return {
        action: "list_projects",
        projects,
        count: projects.length,
        message: `Found ${projects.length} project(s)`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

export const getProjectContext = tool({
  description: "Get full context for a specific project including business context, current phase, and statistics",
  parameters: z.object({
    projectId: z.string().describe("The project ID"),
  }),
  execute: async ({ projectId }) => {
    try {
      const [project] = await sql`
        SELECT p.*, bc.vision, bc.target_market, bc.primary_use_case,
               (SELECT COUNT(*) FROM project_steps WHERE project_id = p.id) as total_steps,
               (SELECT COUNT(*) FROM project_steps WHERE project_id = p.id AND status = 'completed') as completed_steps
        FROM projects p
        LEFT JOIN business_context bc ON p.id = bc.project_id
        WHERE p.id = ${projectId}
      `;

      if (!project) {
        return { error: "Project not found" };
      }

      return {
        action: "get_project_context",
        project,
        message: `Retrieved context for project: ${project.name}`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

export const createProject = tool({
  description: "Create a new project",
  parameters: z.object({
    name: z.string().describe("Project name"),
    description: z.string().describe("Project description"),
    vision: z.string().optional().describe("Project vision"),
    targetMarket: z.string().optional().describe("Target market"),
  }),
  execute: async ({ name, description, vision, targetMarket }) => {
    try {
      const [project] = await sql`
        INSERT INTO projects (name, description, status, priority, current_phase)
        VALUES (${name}, ${description}, 'planning', 'medium', 'ideation')
        RETURNING *
      `;

      if (vision || targetMarket) {
        await sql`
          INSERT INTO business_context (project_id, vision, target_market, primary_use_case, revenue_model, competitive_advantage)
          VALUES (${project.id}, ${vision || 'TBD'}, ${targetMarket || 'TBD'}, 'TBD', 'TBD', 'TBD')
        `;
      }

      await sql`
        INSERT INTO project_phases (project_id, phase_name, status, description)
        VALUES (${project.id}, 'ideation', 'active', 'Initial phase')
      `;

      return {
        action: "create_project",
        project,
        message: `Created project: ${name}`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

// =============================================================================
// TASK MANAGEMENT TOOLS
// =============================================================================

export const getProjectTasks = tool({
  description: "Get all tasks for a project with status and assignment info",
  parameters: z.object({
    projectId: z.string().describe("The project ID"),
    status: z.enum(["all", "pending", "in-progress", "completed", "blocked"])
      .default("all")
      .describe("Filter by task status"),
    phase: z.string().optional()
      .describe("Filter by phase"),
  }),
  execute: async ({ projectId, status, phase }) => {
    try {
      let tasks;
      if (status === "all" && !phase) {
        tasks = await sql`
          SELECT * FROM project_steps
          WHERE project_id = ${projectId} AND deleted_at IS NULL
          ORDER BY order_index
        `;
      } else if (phase) {
        tasks = await sql`
          SELECT * FROM project_steps
          WHERE project_id = ${projectId}
            AND deleted_at IS NULL
            AND phase = ${phase}
            AND (${status} = 'all' OR status = ${status})
          ORDER BY order_index
        `;
      } else {
        tasks = await sql`
          SELECT * FROM project_steps
          WHERE project_id = ${projectId}
            AND deleted_at IS NULL
            AND status = ${status}
          ORDER BY order_index
        `;
      }

      return {
        action: "get_project_tasks",
        tasks,
        count: tasks.length,
        message: `Found ${tasks.length} task(s)`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

export const createTask = tool({
  description: "Create a new task/step in a project",
  parameters: z.object({
    projectId: z.string().describe("The project ID"),
    title: z.string().describe("Task title"),
    description: z.string().describe("Task description"),
    phase: z.string().describe("Phase this task belongs to"),
    estimatedHours: z.number().optional().describe("Estimated hours"),
    assignedAgent: z.enum(["v0", "claude", "gemini", "gpt"]).optional()
      .describe("Agent to assign"),
  }),
  execute: async ({ projectId, title, description, phase, estimatedHours, assignedAgent }) => {
    try {
      // Get max order_index for the phase
      const [maxOrder] = await sql`
        SELECT COALESCE(MAX(order_index), 0) as max_order
        FROM project_steps
        WHERE project_id = ${projectId} AND phase = ${phase}
      `;

      const [task] = await sql`
        INSERT INTO project_steps (
          project_id, title, description, phase, stage,
          status, estimated_hours, assigned_agent, order_index
        ) VALUES (
          ${projectId}, ${title}, ${description}, ${phase}, 'development',
          'pending', ${estimatedHours || 0}, ${assignedAgent || null}, ${maxOrder.max_order + 1}
        )
        RETURNING *
      `;

      return {
        action: "create_task",
        task,
        message: `Created task: ${title}`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

export const updateTaskStatus = tool({
  description: "Update the status of a task",
  parameters: z.object({
    taskId: z.string().describe("The task ID"),
    status: z.enum(["pending", "in-progress", "completed", "blocked", "paused", "failed"])
      .describe("New status"),
    progress: z.number().min(0).max(100).optional()
      .describe("Progress percentage (0-100)"),
  }),
  execute: async ({ taskId, status, progress }) => {
    try {
      const [task] = await sql`
        UPDATE project_steps
        SET status = ${status},
            progress = COALESCE(${progress}, progress),
            updated_at = NOW()
        WHERE id = ${taskId}
        RETURNING *
      `;

      if (!task) {
        return { error: "Task not found" };
      }

      return {
        action: "update_task_status",
        task,
        message: `Updated task status to: ${status}`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

export const assignTask = tool({
  description: "Assign a task to an AI agent",
  parameters: z.object({
    taskId: z.string().describe("The task ID"),
    agentName: z.enum(["v0", "claude", "gemini", "gpt"])
      .describe("Agent to assign"),
  }),
  execute: async ({ taskId, agentName }) => {
    try {
      const [task] = await sql`
        UPDATE project_steps
        SET assigned_agent = ${agentName},
            status = CASE WHEN status = 'pending' THEN 'in-progress' ELSE status END,
            updated_at = NOW()
        WHERE id = ${taskId}
        RETURNING *
      `;

      if (!task) {
        return { error: "Task not found" };
      }

      // Update agent status
      await sql`
        UPDATE agents
        SET status = 'working', current_task_id = ${taskId}, last_active_at = NOW()
        WHERE name = ${agentName}
      `;

      return {
        action: "assign_task",
        task,
        agentName,
        message: `Assigned task to ${agentName}`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

// =============================================================================
// PHASE MANAGEMENT TOOLS
// =============================================================================

export const listPhases = tool({
  description: "List all phases for a project",
  parameters: z.object({
    projectId: z.string().describe("The project ID"),
  }),
  execute: async ({ projectId }) => {
    try {
      const phases = await sql`
        SELECT * FROM project_phases
        WHERE project_id = ${projectId}
        ORDER BY started_at ASC
      `;

      return {
        action: "list_phases",
        phases,
        count: phases.length,
        message: `Found ${phases.length} phase(s)`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

export const transitionPhase = tool({
  description: "Transition a project to a new phase",
  parameters: z.object({
    projectId: z.string().describe("The project ID"),
    newPhase: z.enum(["ideation", "architecture", "construction", "testing", "deployment", "maintenance"])
      .describe("The new phase"),
    reason: z.string().describe("Reason for the transition"),
  }),
  execute: async ({ projectId, newPhase, reason }) => {
    try {
      // Complete current phase
      await sql`
        UPDATE project_phases
        SET status = 'completed', completed_at = NOW()
        WHERE project_id = ${projectId} AND status = 'active'
      `;

      // Create new phase
      const [phase] = await sql`
        INSERT INTO project_phases (project_id, phase_name, status, description)
        VALUES (${projectId}, ${newPhase}, 'active', ${reason})
        RETURNING *
      `;

      // Update project current phase
      await sql`
        UPDATE projects
        SET current_phase = ${newPhase}, updated_at = NOW()
        WHERE id = ${projectId}
      `;

      return {
        action: "transition_phase",
        phase,
        message: `Transitioned to ${newPhase} phase`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

// =============================================================================
// DOCUMENT MANAGEMENT TOOLS
// =============================================================================

export const listDocuments = tool({
  description: "List documents for a project",
  parameters: z.object({
    projectId: z.string().describe("The project ID"),
    category: z.string().optional().describe("Filter by category"),
  }),
  execute: async ({ projectId, category }) => {
    try {
      const documents = category
        ? await sql`
            SELECT id, title, category, doc_type, created_at
            FROM documents
            WHERE project_id = ${projectId} AND deleted_at IS NULL AND category = ${category}
            ORDER BY created_at DESC
          `
        : await sql`
            SELECT id, title, category, doc_type, created_at
            FROM documents
            WHERE project_id = ${projectId} AND deleted_at IS NULL
            ORDER BY created_at DESC
          `;

      return {
        action: "list_documents",
        documents,
        count: documents.length,
        message: `Found ${documents.length} document(s)`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

export const readDocument = tool({
  description: "Read the content of a document",
  parameters: z.object({
    documentId: z.string().describe("The document ID"),
  }),
  execute: async ({ documentId }) => {
    try {
      const [doc] = await sql`
        SELECT * FROM documents WHERE id = ${documentId}
      `;

      if (!doc) {
        return { error: "Document not found" };
      }

      return {
        action: "read_document",
        document: {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          category: doc.category,
          docType: doc.doc_type,
        },
        message: `Retrieved document: ${doc.title}`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

export const createDocument = tool({
  description: "Create a new knowledge base document",
  parameters: z.object({
    projectId: z.string().describe("The project ID"),
    title: z.string().describe("Document title"),
    content: z.string().describe("Document content (markdown)"),
    category: z.string().default("general").describe("Document category"),
    docType: z.enum(["architecture", "api", "ui_ux", "requirements", "testing", "deployment", "general"])
      .default("general")
      .describe("Type of document"),
  }),
  execute: async ({ projectId, title, content, category, docType }) => {
    try {
      const [doc] = await sql`
        INSERT INTO documents (project_id, title, content, category, doc_type, file_type, file_size)
        VALUES (${projectId}, ${title}, ${content}, ${category}, ${docType}, 'text/markdown', ${content.length})
        RETURNING *
      `;

      return {
        action: "create_document",
        document: doc,
        message: `Created document: ${title}`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

// =============================================================================
// PROGRESS & NOTES TOOLS
// =============================================================================

export const addProgressNote = tool({
  description: "Add a progress note to track development progress",
  parameters: z.object({
    projectId: z.string().describe("The project ID"),
    stepId: z.string().optional().describe("Associated step ID"),
    noteType: z.enum(["progress", "blocker", "question", "decision", "completion"])
      .describe("Type of note: progress update, blocker, question, decision, or completion summary"),
    title: z.string().optional().describe("Note title"),
    content: z.string().describe("Note content"),
  }),
  execute: async ({ projectId, stepId, noteType, title, content }) => {
    try {
      const [note] = await sql`
        INSERT INTO progress_notes (
          project_id, step_id, author_type, author_name,
          note_type, title, content
        ) VALUES (
          ${projectId}, ${stepId || null}, 'agent', 'ai-assistant',
          ${noteType}, ${title || null}, ${content}
        )
        RETURNING *
      `;

      return {
        action: "add_progress_note",
        note,
        message: `Added ${noteType} note`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

// =============================================================================
// AGENT STATUS TOOLS
// =============================================================================

export const listAgents = tool({
  description: "List all AI agents and their current status",
  parameters: z.object({
    onlyActive: z.boolean().default(false).describe("Only show active agents"),
  }),
  execute: async () => {
    try {
      const agents = await sql`
        SELECT a.*, ps.title as current_task_title
        FROM agents a
        LEFT JOIN project_steps ps ON a.current_task_id = ps.id
        ORDER BY a.name
      `;

      return {
        action: "list_agents",
        agents,
        count: agents.length,
        message: `Found ${agents.length} agent(s)`,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
});

// =============================================================================
// EXPORT ALL TOOLS
// =============================================================================

export const allTools = {
  // UI Navigation
  navigateToView,
  openDocumentBrowser,
  closeDocumentBrowser,

  // Selection & Focus
  selectTask,
  selectDocument,
  highlightElements,
  scrollToElement,
  showToast,

  // Context & Telemetry
  getCurrentContext,
  trackUserFocus,

  // Project Management
  listProjects,
  getProjectContext,
  createProject,

  // Task Management
  getProjectTasks,
  createTask,
  updateTaskStatus,
  assignTask,

  // Phase Management
  listPhases,
  transitionPhase,

  // Document Management
  listDocuments,
  readDocument,
  createDocument,

  // Progress & Notes
  addProgressNote,

  // Agent Status
  listAgents,
};

export type ToolName = keyof typeof allTools;
