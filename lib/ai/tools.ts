/**
 * AI Chat Tools for AI Project Planner
 *
 * Comprehensive tool set that enables the AI assistant to:
 * 1. Navigate views and control the UI
 * 2. Manage projects, tasks, phases, and documents
 * 3. Provide contextual feedback via highlights and focus
 * 4. Track user interactions via telemetry
 *
 * NOTE: Using inputSchema (not parameters) with explicit JSON schema due to
 * AI SDK v5 bug where prepareToolsAndToolChoice expects inputSchema but tool()
 * examples use parameters. Also using explicit JSON schema instead of Zod.
 */

import { tool, jsonSchema } from "ai";
import { sql } from "@/lib/db/client";

// Helper to create typed JSON schemas
type JSONSchema = Parameters<typeof jsonSchema>[0];

// =============================================================================
// UI NAVIGATION TOOLS
// These tools allow the AI to control what the user sees
// =============================================================================

export const navigateToView = tool({
  description: "Navigate the user to a specific view/tab in the project dashboard. Use this when the user asks to see a different view or when showing relevant information.",
  inputSchema: jsonSchema<{ view: string; reason?: string }>({
    type: "object",
    properties: {
      view: {
        type: "string",
        enum: ["dashboard", "tree", "gantt", "kanban", "flow", "docs"],
        description: "The view to navigate to"
      },
      reason: {
        type: "string",
        description: "Brief explanation of why navigating (shown to user)"
      }
    },
    required: ["view"]
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
  inputSchema: jsonSchema<{ filter?: string }>({
    type: "object",
    properties: {
      filter: {
        type: "string",
        description: "Optional filter/search term for documents",
        default: ""
      }
    }
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
  inputSchema: jsonSchema<{ confirm?: boolean }>({
    type: "object",
    properties: {
      confirm: {
        type: "boolean",
        description: "Confirmation flag",
        default: false
      }
    }
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
  inputSchema: jsonSchema<{ taskId: string; scrollTo?: boolean }>({
    type: "object",
    properties: {
      taskId: { type: "string", description: "The ID of the task to select" },
      scrollTo: { type: "boolean", description: "Whether to scroll the view to show the task", default: true }
    },
    required: ["taskId"]
  }),
  execute: async ({ taskId, scrollTo = true }) => {
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
  inputSchema: jsonSchema<{ documentId: string }>({
    type: "object",
    properties: {
      documentId: { type: "string", description: "The ID of the document to select" }
    },
    required: ["documentId"]
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
  inputSchema: jsonSchema<{ elementIds: string[]; highlightType?: string; duration?: number; color?: string }>({
    type: "object",
    properties: {
      elementIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of element IDs to highlight"
      },
      highlightType: {
        type: "string",
        enum: ["pulse", "glow", "border", "shake"],
        description: "Type of highlight animation",
        default: "glow"
      },
      duration: {
        type: "number",
        description: "Duration of highlight in milliseconds",
        default: 3000
      },
      color: {
        type: "string",
        enum: ["blue", "green", "yellow", "red", "purple"],
        description: "Color of the highlight",
        default: "blue"
      }
    },
    required: ["elementIds"]
  }),
  execute: async ({ elementIds, highlightType = "glow", duration = 3000, color = "blue" }) => {
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
  inputSchema: jsonSchema<{ elementId: string; position?: string }>({
    type: "object",
    properties: {
      elementId: { type: "string", description: "ID of the element to scroll to" },
      position: {
        type: "string",
        enum: ["start", "center", "end"],
        description: "Where to position the element after scrolling",
        default: "center"
      }
    },
    required: ["elementId"]
  }),
  execute: async ({ elementId, position = "center" }) => {
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
  inputSchema: jsonSchema<{ title: string; description?: string; type?: string; duration?: number }>({
    type: "object",
    properties: {
      title: { type: "string", description: "Toast title" },
      description: { type: "string", description: "Toast description" },
      type: {
        type: "string",
        enum: ["default", "success", "error", "warning", "info"],
        description: "Type of toast notification",
        default: "default"
      },
      duration: {
        type: "number",
        description: "Duration in milliseconds",
        default: 5000
      }
    },
    required: ["title"]
  }),
  execute: async ({ title, description, type = "default", duration = 5000 }) => {
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
  inputSchema: jsonSchema<{ includeHistory?: boolean }>({
    type: "object",
    properties: {
      includeHistory: {
        type: "boolean",
        description: "Include recent interaction history",
        default: false
      }
    }
  }),
  execute: async () => {
    return {
      action: "get_context",
      message: "Fetching current UI context",
    };
  },
});

export const trackUserFocus = tool({
  description: "Record where the user's attention is currently focused for context-aware responses",
  inputSchema: jsonSchema<{ focusArea: string; itemId?: string }>({
    type: "object",
    properties: {
      focusArea: {
        type: "string",
        enum: ["task", "document", "phase", "timeline", "board", "flow"],
        description: "The area where user is focused"
      },
      itemId: {
        type: "string",
        description: "ID of the specific item being focused on"
      }
    },
    required: ["focusArea"]
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
  inputSchema: jsonSchema<{ status?: string }>({
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["all", "planning", "in-progress", "completed", "on-hold"],
        description: "Filter by project status",
        default: "all"
      }
    }
  }),
  execute: async ({ status = "all" }) => {
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
  inputSchema: jsonSchema<{ projectId: string }>({
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project ID" }
    },
    required: ["projectId"]
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
  inputSchema: jsonSchema<{ name: string; description: string; vision?: string; targetMarket?: string }>({
    type: "object",
    properties: {
      name: { type: "string", description: "Project name" },
      description: { type: "string", description: "Project description" },
      vision: { type: "string", description: "Project vision" },
      targetMarket: { type: "string", description: "Target market" }
    },
    required: ["name", "description"]
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
  inputSchema: jsonSchema<{ projectId: string; status?: string; phase?: string }>({
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project ID" },
      status: {
        type: "string",
        enum: ["all", "pending", "in-progress", "completed", "blocked"],
        description: "Filter by task status",
        default: "all"
      },
      phase: { type: "string", description: "Filter by phase" }
    },
    required: ["projectId"]
  }),
  execute: async ({ projectId, status = "all", phase }) => {
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
  inputSchema: jsonSchema<{ projectId: string; title: string; description: string; phase: string; estimatedHours?: number; assignedAgent?: string }>({
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project ID" },
      title: { type: "string", description: "Task title" },
      description: { type: "string", description: "Task description" },
      phase: { type: "string", description: "Phase this task belongs to" },
      estimatedHours: { type: "number", description: "Estimated hours" },
      assignedAgent: {
        type: "string",
        enum: ["v0", "claude", "gemini", "gpt"],
        description: "Agent to assign"
      }
    },
    required: ["projectId", "title", "description", "phase"]
  }),
  execute: async ({ projectId, title, description, phase, estimatedHours, assignedAgent }) => {
    try {
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
  inputSchema: jsonSchema<{ taskId: string; status: string; progress?: number }>({
    type: "object",
    properties: {
      taskId: { type: "string", description: "The task ID" },
      status: {
        type: "string",
        enum: ["pending", "in-progress", "completed", "blocked", "paused", "failed"],
        description: "New status"
      },
      progress: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "Progress percentage (0-100)"
      }
    },
    required: ["taskId", "status"]
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
  inputSchema: jsonSchema<{ taskId: string; agentName: string }>({
    type: "object",
    properties: {
      taskId: { type: "string", description: "The task ID" },
      agentName: {
        type: "string",
        enum: ["v0", "claude", "gemini", "gpt"],
        description: "Agent to assign"
      }
    },
    required: ["taskId", "agentName"]
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
  inputSchema: jsonSchema<{ projectId: string }>({
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project ID" }
    },
    required: ["projectId"]
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
  inputSchema: jsonSchema<{ projectId: string; newPhase: string; reason: string }>({
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project ID" },
      newPhase: {
        type: "string",
        enum: ["ideation", "architecture", "construction", "testing", "deployment", "maintenance"],
        description: "The new phase"
      },
      reason: { type: "string", description: "Reason for the transition" }
    },
    required: ["projectId", "newPhase", "reason"]
  }),
  execute: async ({ projectId, newPhase, reason }) => {
    try {
      await sql`
        UPDATE project_phases
        SET status = 'completed', completed_at = NOW()
        WHERE project_id = ${projectId} AND status = 'active'
      `;

      const [phase] = await sql`
        INSERT INTO project_phases (project_id, phase_name, status, description)
        VALUES (${projectId}, ${newPhase}, 'active', ${reason})
        RETURNING *
      `;

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
  inputSchema: jsonSchema<{ projectId: string; category?: string }>({
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project ID" },
      category: { type: "string", description: "Filter by category" }
    },
    required: ["projectId"]
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
  inputSchema: jsonSchema<{ documentId: string }>({
    type: "object",
    properties: {
      documentId: { type: "string", description: "The document ID" }
    },
    required: ["documentId"]
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
  inputSchema: jsonSchema<{ projectId: string; title: string; content: string; category?: string; docType?: string }>({
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project ID" },
      title: { type: "string", description: "Document title" },
      content: { type: "string", description: "Document content (markdown)" },
      category: { type: "string", description: "Document category", default: "general" },
      docType: {
        type: "string",
        enum: ["architecture", "api", "ui_ux", "requirements", "testing", "deployment", "general"],
        description: "Type of document",
        default: "general"
      }
    },
    required: ["projectId", "title", "content"]
  }),
  execute: async ({ projectId, title, content, category = "general", docType = "general" }) => {
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
  inputSchema: jsonSchema<{ projectId: string; noteType: string; content: string; stepId?: string; title?: string }>({
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project ID" },
      stepId: { type: "string", description: "Associated step ID" },
      noteType: {
        type: "string",
        enum: ["progress", "blocker", "question", "decision", "completion"],
        description: "Type of note: progress update, blocker, question, decision, or completion summary"
      },
      title: { type: "string", description: "Note title" },
      content: { type: "string", description: "Note content" }
    },
    required: ["projectId", "noteType", "content"]
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
  inputSchema: jsonSchema<{ onlyActive?: boolean }>({
    type: "object",
    properties: {
      onlyActive: {
        type: "boolean",
        description: "Only show active agents",
        default: false
      }
    }
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
