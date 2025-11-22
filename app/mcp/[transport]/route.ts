/**
 * MCP Server Route for AI Project Planner
 * Exposes project context, execution plans, and progress tracking to AI agents
 *
 * Following the battle-tested pattern from vercel-labs/mcp-for-next.js
 */

import { createMCPHandler } from 'mcp-handler'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { sql } from '@/lib/db/client'
import { put, del } from '@vercel/blob'
import crypto from 'crypto'
import type {
  Project,
  ProjectStep,
  BusinessContext,
  TechStackItem,
  ExecutionHistory,
  StepDependency,
  ProjectExecution,
  ProgressNote,
  ProjectVersion,
  FeatureRequest,
  Document,
} from '@/lib/db/schema'

// Initialize MCP Server with capabilities
const server = new Server(
  {
    name: 'ai-project-planner',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
)

// =============================================================================
// RESOURCES - Read-only project data that AI agents can query
// =============================================================================

/**
 * Resource: Full Project Context
 * URI: project://{projectId}/context
 * Returns: Business context, description, metadata, tech stack
 */
server.setRequestHandler('resources/list', async () => {
  return {
    resources: [
      {
        uri: 'project://list',
        name: 'List All Projects',
        description: 'Get a list of all projects with basic info',
        mimeType: 'application/json',
      },
      {
        uri: 'project://{projectId}/context',
        name: 'Project Business Context',
        description: 'Full business context including vision, target market, success metrics',
        mimeType: 'application/json',
      },
      {
        uri: 'project://{projectId}/execution',
        name: 'Project Execution Plan',
        description: 'All steps, dependencies, phases, and order of execution',
        mimeType: 'application/json',
      },
      {
        uri: 'project://{projectId}/progress',
        name: 'Project Progress Status',
        description: 'Current state: completed, in-progress, blocked, and next available steps',
        mimeType: 'application/json',
      },
      {
        uri: 'project://{projectId}/techstack',
        name: 'Technology Stack',
        description: 'Tech stack with rationale and alternatives considered',
        mimeType: 'application/json',
      },
    ],
  }
})

/**
 * Resource Reader - Handles all project:// URI requests
 */
server.setRequestHandler('resources/read', async (request) => {
  const uri = request.params.uri as string

  // Parse the URI to extract project ID and resource type
  const projectListMatch = uri.match(/^project:\/\/list$/)
  const projectMatch = uri.match(/^project:\/\/([^/]+)\/(.+)$/)

  // List all projects
  if (projectListMatch) {
    const projects = await sql<Project[]>`
      SELECT id, name, description, status, priority, progress,
             start_date, due_date, github_repo_url, created_at, updated_at
      FROM projects
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(projects, null, 2),
        },
      ],
    }
  }

  if (!projectMatch) {
    throw new Error(`Invalid project URI format: ${uri}`)
  }

  const [, projectId, resourceType] = projectMatch

  // Fetch different resources based on type
  switch (resourceType) {
    case 'context': {
      // Get project with business context
      const [project] = await sql<Project[]>`
        SELECT * FROM projects WHERE id = ${projectId} AND deleted_at IS NULL
      `

      if (!project) {
        throw new Error(`Project not found: ${projectId}`)
      }

      const [businessContext] = await sql<BusinessContext[]>`
        SELECT * FROM business_context WHERE project_id = ${projectId}
      `

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                project,
                businessContext,
              },
              null,
              2
            ),
          },
        ],
      }
    }

    case 'execution': {
      // Get all project steps with dependency information
      const steps = await sql<ProjectExecution[]>`
        SELECT
          ps.*,
          COALESCE(
            ARRAY_AGG(sd.depends_on_step_id) FILTER (WHERE sd.depends_on_step_id IS NOT NULL),
            ARRAY[]::uuid[]
          ) as dependencies
        FROM project_steps ps
        LEFT JOIN step_dependencies sd ON sd.step_id = ps.id AND sd.deleted_at IS NULL
        WHERE ps.project_id = ${projectId} AND ps.deleted_at IS NULL
        GROUP BY ps.id
        ORDER BY ps.order_index
      `

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                projectId,
                totalSteps: steps.length,
                steps,
              },
              null,
              2
            ),
          },
        ],
      }
    }

    case 'progress': {
      // Get current progress and next available steps
      const steps = await sql<ProjectStep[]>`
        SELECT * FROM project_steps
        WHERE project_id = ${projectId} AND deleted_at IS NULL
        ORDER BY order_index
      `

      const completed = steps.filter((s) => s.status === 'completed')
      const inProgress = steps.filter((s) => s.status === 'in-progress')
      const blocked = steps.filter((s) => s.is_blocked)
      const canWork = steps.filter((s) => s.can_work && s.status === 'pending')
      const shouldWork = steps.filter((s) => s.should_work && s.status === 'pending')

      // Calculate overall progress
      const totalProgress = steps.reduce((sum, step) => sum + step.progress, 0)
      const avgProgress = steps.length > 0 ? Math.round(totalProgress / steps.length) : 0

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                projectId,
                overallProgress: avgProgress,
                summary: {
                  total: steps.length,
                  completed: completed.length,
                  inProgress: inProgress.length,
                  blocked: blocked.length,
                  available: canWork.length,
                },
                completedSteps: completed.map((s) => ({ id: s.id, title: s.title })),
                inProgressSteps: inProgress.map((s) => ({ id: s.id, title: s.title })),
                blockedSteps: blocked.map((s) => ({ id: s.id, title: s.title })),
                nextAvailableSteps: canWork,
                recommendedNext: shouldWork.length > 0 ? shouldWork[0] : null,
              },
              null,
              2
            ),
          },
        ],
      }
    }

    case 'techstack': {
      // Get technology stack with rationale
      const techStack = await sql<TechStackItem[]>`
        SELECT * FROM tech_stack_items
        WHERE project_id = ${projectId} AND deleted_at IS NULL
        ORDER BY order_index
      `

      // Group by category
      const grouped = techStack.reduce(
        (acc, item) => {
          if (!acc[item.category]) {
            acc[item.category] = []
          }
          acc[item.category].push(item)
          return acc
        },
        {} as Record<string, TechStackItem[]>
      )

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                projectId,
                byCategory: grouped,
                all: techStack,
              },
              null,
              2
            ),
          },
        ],
      }
    }

    default:
      throw new Error(`Unknown resource type: ${resourceType}`)
  }
})

// =============================================================================
// TOOLS - Actions that AI agents can perform
// =============================================================================

server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      // ========== EXISTING WORKFLOW TOOLS ==========
      {
        name: 'get_next_step',
        description: 'Get the next recommended step to work on for a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The UUID of the project',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'mark_step_complete',
        description: 'Mark a project step as completed',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The UUID of the project',
            },
            stepId: {
              type: 'string',
              description: 'The UUID of the step to mark complete',
            },
            actualHours: {
              type: 'number',
              description: 'Actual hours spent on this step',
            },
            notes: {
              type: 'string',
              description: 'Notes about the completion',
            },
          },
          required: ['projectId', 'stepId'],
        },
      },
      {
        name: 'mark_step_in_progress',
        description: 'Mark a project step as in progress',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The UUID of the project',
            },
            stepId: {
              type: 'string',
              description: 'The UUID of the step to mark in progress',
            },
          },
          required: ['projectId', 'stepId'],
        },
      },
      {
        name: 'report_blocker',
        description: 'Report a blocker on a project step',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The UUID of the project',
            },
            stepId: {
              type: 'string',
              description: 'The UUID of the step that is blocked',
            },
            blocker: {
              type: 'string',
              description: 'Description of what is blocking the step',
            },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Severity of the blocker',
            },
          },
          required: ['projectId', 'stepId', 'blocker', 'severity'],
        },
      },
      {
        name: 'update_step_progress',
        description: 'Update the progress percentage of a step',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The UUID of the project',
            },
            stepId: {
              type: 'string',
              description: 'The UUID of the step',
            },
            progress: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Progress percentage (0-100)',
            },
          },
          required: ['projectId', 'stepId', 'progress'],
        },
      },

      // ========== PROJECT MANAGEMENT ==========
      {
        name: 'create_project',
        description: 'Create a new project',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Project name' },
            description: { type: 'string', description: 'Project description' },
            status: {
              type: 'string',
              enum: ['planning', 'in-progress', 'review', 'completed', 'on-hold'],
              description: 'Initial project status (default: planning)',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Project priority (default: medium)',
            },
            githubRepoUrl: { type: 'string', description: 'GitHub repository URL (optional)' },
            dueDate: { type: 'string', description: 'Due date in ISO format (optional)' },
          },
          required: ['name', 'description'],
        },
      },
      {
        name: 'update_project',
        description: 'Update an existing project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            name: { type: 'string', description: 'Project name (optional)' },
            description: { type: 'string', description: 'Project description (optional)' },
            status: {
              type: 'string',
              enum: ['planning', 'in-progress', 'review', 'completed', 'on-hold'],
              description: 'Project status (optional)',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Project priority (optional)',
            },
            currentPhase: { type: 'string', description: 'Current phase name (optional)' },
            health: {
              type: 'string',
              enum: ['excellent', 'good', 'attention', 'critical'],
              description: 'Project health status (optional)',
            },
            githubRepoUrl: { type: 'string', description: 'GitHub repository URL (optional)' },
            dueDate: { type: 'string', description: 'Due date in ISO format (optional)' },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'delete_project',
        description: 'Soft delete a project (sets deleted_at timestamp)',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project to delete' },
          },
          required: ['projectId'],
        },
      },

      // ========== STEP MANAGEMENT ==========
      {
        name: 'create_step',
        description: 'Create a new project step/task',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            title: { type: 'string', description: 'Step title' },
            description: { type: 'string', description: 'Step description' },
            phase: { type: 'string', description: 'Phase name (e.g., Foundation, Development)' },
            stage: { type: 'string', description: 'Stage name (e.g., Backend, Frontend)' },
            estimatedHours: { type: 'number', description: 'Estimated hours (optional)' },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Step priority (optional)',
            },
            assignedAgent: {
              type: 'string',
              enum: ['v0', 'claude', 'gemini', 'gpt'],
              description: 'Assigned AI agent (optional)',
            },
            tasks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of task descriptions (optional)',
            },
            acceptanceCriteria: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  testCommand: { type: 'string' },
                },
              },
              description: 'Array of acceptance criteria (optional)',
            },
            startDate: { type: 'string', description: 'Start date in ISO format (optional)' },
            endDate: { type: 'string', description: 'End date in ISO format (optional)' },
            parentTaskId: { type: 'string', description: 'Parent task UUID for subtasks (optional)' },
          },
          required: ['projectId', 'title', 'description', 'phase', 'stage'],
        },
      },
      {
        name: 'update_step',
        description: 'Update an existing project step',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            stepId: { type: 'string', description: 'The UUID of the step to update' },
            title: { type: 'string', description: 'Step title (optional)' },
            description: { type: 'string', description: 'Step description (optional)' },
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'completed', 'blocked', 'paused', 'failed'],
              description: 'Step status (optional)',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Step priority (optional)',
            },
            assignedAgent: {
              type: 'string',
              enum: ['v0', 'claude', 'gemini', 'gpt'],
              description: 'Assigned AI agent (optional)',
            },
            estimatedHours: { type: 'number', description: 'Estimated hours (optional)' },
            tasks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of task descriptions (optional)',
            },
            acceptanceCriteria: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  testCommand: { type: 'string' },
                },
              },
              description: 'Array of acceptance criteria (optional)',
            },
            startDate: { type: 'string', description: 'Start date in ISO format (optional)' },
            endDate: { type: 'string', description: 'End date in ISO format (optional)' },
          },
          required: ['projectId', 'stepId'],
        },
      },
      {
        name: 'delete_step',
        description: 'Soft delete a project step',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            stepId: { type: 'string', description: 'The UUID of the step to delete' },
          },
          required: ['projectId', 'stepId'],
        },
      },
      {
        name: 'reorder_steps',
        description: 'Reorder project steps by updating their order_index',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            stepOrder: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  stepId: { type: 'string' },
                  orderIndex: { type: 'number' },
                },
              },
              description: 'Array of {stepId, orderIndex} to reorder steps',
            },
          },
          required: ['projectId', 'stepOrder'],
        },
      },

      // ========== BUSINESS CONTEXT ==========
      {
        name: 'create_business_context',
        description: 'Create business context for a project (vision, target market, revenue model, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            vision: { type: 'string', description: 'Project vision statement' },
            targetMarket: { type: 'string', description: 'Target market description' },
            primaryUseCase: { type: 'string', description: 'Primary use case' },
            revenueModel: { type: 'string', description: 'Revenue model description' },
            competitiveAdvantage: { type: 'string', description: 'Competitive advantage (optional)' },
            successMetrics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  metric: { type: 'string' },
                  target: { type: 'string' },
                  current: { type: 'string' },
                },
              },
              description: 'Success metrics array (optional)',
            },
            riskAssessment: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  risk: { type: 'string' },
                  impact: { type: 'string', enum: ['high', 'medium', 'low'] },
                  mitigation: { type: 'string' },
                },
              },
              description: 'Risk assessment array (optional)',
            },
            stakeholders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  priority: { type: 'string', enum: ['primary', 'secondary'] },
                },
              },
              description: 'Stakeholders array (optional)',
            },
            budgetInfo: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                allocated: { type: 'number' },
                spent: { type: 'number' },
              },
              description: 'Budget information (optional)',
            },
          },
          required: ['projectId', 'vision', 'targetMarket', 'primaryUseCase', 'revenueModel'],
        },
      },
      {
        name: 'update_business_context',
        description: 'Update business context for a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            vision: { type: 'string', description: 'Project vision statement (optional)' },
            targetMarket: { type: 'string', description: 'Target market description (optional)' },
            primaryUseCase: { type: 'string', description: 'Primary use case (optional)' },
            revenueModel: { type: 'string', description: 'Revenue model description (optional)' },
            competitiveAdvantage: { type: 'string', description: 'Competitive advantage (optional)' },
            successMetrics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  metric: { type: 'string' },
                  target: { type: 'string' },
                  current: { type: 'string' },
                },
              },
              description: 'Success metrics array (optional)',
            },
            riskAssessment: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  risk: { type: 'string' },
                  impact: { type: 'string', enum: ['high', 'medium', 'low'] },
                  mitigation: { type: 'string' },
                },
              },
              description: 'Risk assessment array (optional)',
            },
            stakeholders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  priority: { type: 'string', enum: ['primary', 'secondary'] },
                },
              },
              description: 'Stakeholders array (optional)',
            },
            budgetInfo: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                allocated: { type: 'number' },
                spent: { type: 'number' },
              },
              description: 'Budget information (optional)',
            },
          },
          required: ['projectId'],
        },
      },

      // ========== TECH STACK MANAGEMENT ==========
      {
        name: 'add_tech_stack_item',
        description: 'Add a technology to the project tech stack',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            name: { type: 'string', description: 'Technology name (e.g., Next.js, PostgreSQL)' },
            category: { type: 'string', description: 'Category (e.g., frontend, backend, database)' },
            rationale: { type: 'string', description: 'Why this technology was chosen' },
            version: { type: 'string', description: 'Version number (optional)' },
            documentationUrl: { type: 'string', description: 'Link to docs (optional)' },
            alternativesConsidered: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  reasonNotChosen: { type: 'string' },
                },
              },
              description: 'Alternatives that were considered (optional)',
            },
          },
          required: ['projectId', 'name', 'category', 'rationale'],
        },
      },
      {
        name: 'update_tech_stack_item',
        description: 'Update a tech stack item',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            techStackId: { type: 'string', description: 'The UUID of the tech stack item' },
            name: { type: 'string', description: 'Technology name (optional)' },
            category: { type: 'string', description: 'Category (optional)' },
            rationale: { type: 'string', description: 'Why chosen (optional)' },
            version: { type: 'string', description: 'Version number (optional)' },
            documentationUrl: { type: 'string', description: 'Link to docs (optional)' },
            alternativesConsidered: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  reasonNotChosen: { type: 'string' },
                },
              },
              description: 'Alternatives considered (optional)',
            },
          },
          required: ['projectId', 'techStackId'],
        },
      },
      {
        name: 'remove_tech_stack_item',
        description: 'Remove a technology from the tech stack',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            techStackId: { type: 'string', description: 'The UUID of the tech stack item to remove' },
          },
          required: ['projectId', 'techStackId'],
        },
      },

      // ========== DEPENDENCIES ==========
      {
        name: 'create_dependency',
        description: 'Create a dependency between two steps (stepId depends on dependsOnStepId)',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            stepId: { type: 'string', description: 'The UUID of the step that has the dependency' },
            dependsOnStepId: {
              type: 'string',
              description: 'The UUID of the step that must be completed first',
            },
            dependencyType: {
              type: 'string',
              enum: ['hard', 'soft'],
              description: 'hard = must complete first, soft = recommended to complete first',
            },
          },
          required: ['projectId', 'stepId', 'dependsOnStepId', 'dependencyType'],
        },
      },
      {
        name: 'remove_dependency',
        description: 'Remove a dependency between two steps',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            stepId: { type: 'string', description: 'The UUID of the step' },
            dependsOnStepId: { type: 'string', description: 'The UUID of the dependency to remove' },
          },
          required: ['projectId', 'stepId', 'dependsOnStepId'],
        },
      },

      // ========== DOCUMENTS ==========
      {
        name: 'create_document',
        description: 'Create a new document (architecture, API docs, requirements, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            title: { type: 'string', description: 'Document title' },
            description: { type: 'string', description: 'Document description' },
            content: { type: 'string', description: 'Markdown content (optional)' },
            docType: {
              type: 'string',
              enum: ['architecture', 'api', 'ui_ux', 'requirements', 'testing', 'deployment', 'general'],
              description: 'Document type (optional)',
            },
            category: { type: 'string', description: 'Category name (optional)' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization (optional)',
            },
            s3Key: { type: 'string', description: 'S3 key if file uploaded (optional)' },
            fileType: { type: 'string', description: 'File type/extension (optional)' },
          },
          required: ['projectId', 'title', 'description'],
        },
      },
      {
        name: 'update_document',
        description: 'Update an existing document',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            documentId: { type: 'string', description: 'The UUID of the document to update' },
            title: { type: 'string', description: 'Document title (optional)' },
            description: { type: 'string', description: 'Document description (optional)' },
            content: { type: 'string', description: 'Markdown content (optional)' },
            docType: {
              type: 'string',
              enum: ['architecture', 'api', 'ui_ux', 'requirements', 'testing', 'deployment', 'general'],
              description: 'Document type (optional)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization (optional)',
            },
          },
          required: ['projectId', 'documentId'],
        },
      },
      {
        name: 'delete_document',
        description: 'Soft delete a document',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            documentId: { type: 'string', description: 'The UUID of the document to delete' },
          },
          required: ['projectId', 'documentId'],
        },
      },
      {
        name: 'link_document_to_task',
        description: 'Link a document to a specific task/step',
        inputSchema: {
          type: 'object',
          properties: {
            documentId: { type: 'string', description: 'The UUID of the document' },
            taskId: { type: 'string', description: 'The UUID of the task/step' },
            relationshipType: {
              type: 'string',
              enum: ['reference', 'implementation', 'specification', 'testing'],
              description: 'How the document relates to the task',
            },
          },
          required: ['documentId', 'taskId', 'relationshipType'],
        },
      },
      {
        name: 'unlink_document_from_task',
        description: 'Unlink a document from a task',
        inputSchema: {
          type: 'object',
          properties: {
            documentId: { type: 'string', description: 'The UUID of the document' },
            taskId: { type: 'string', description: 'The UUID of the task' },
          },
          required: ['documentId', 'taskId'],
        },
      },

      // ========== AGENT ASSIGNMENT ==========
      {
        name: 'assign_agent_to_task',
        description: 'Assign an AI agent to a task and update agent status',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            stepId: { type: 'string', description: 'The UUID of the step/task' },
            agentName: {
              type: 'string',
              enum: ['v0', 'claude', 'gemini', 'gpt'],
              description: 'The name of the agent to assign',
            },
          },
          required: ['projectId', 'stepId', 'agentName'],
        },
      },
      {
        name: 'unassign_agent_from_task',
        description: 'Unassign an agent from a task',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            stepId: { type: 'string', description: 'The UUID of the step/task' },
          },
          required: ['projectId', 'stepId'],
        },
      },

      // ========== PROGRESS NOTES ==========
      {
        name: 'add_progress_note',
        description: 'Add a detailed progress note (AI agents can document their work, blockers, decisions)',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            stepId: { type: 'string', description: 'The UUID of the step (optional - can be project-level)' },
            authorName: { type: 'string', description: 'Name of the author (agent name or human name)' },
            authorType: {
              type: 'string',
              enum: ['human', 'agent'],
              description: 'Whether this note is from a human or AI agent',
            },
            noteType: {
              type: 'string',
              enum: ['progress', 'blocker', 'question', 'decision', 'completion'],
              description: 'Type of note',
            },
            title: { type: 'string', description: 'Note title/summary (optional)' },
            content: { type: 'string', description: 'Markdown-formatted note content' },
            metadata: {
              type: 'object',
              description: 'Additional context: code snippets, file paths, links, etc. (optional)',
            },
          },
          required: ['projectId', 'authorName', 'authorType', 'noteType', 'content'],
        },
      },
      {
        name: 'get_progress_notes',
        description: 'Get progress notes for a project or specific step',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project (optional)' },
            stepId: { type: 'string', description: 'The UUID of the step (optional)' },
            limit: { type: 'number', description: 'Number of notes to return (default: 50)' },
          },
        },
      },

      // ========== PROJECT VERSIONS ==========
      {
        name: 'create_version',
        description: 'Create a new project version/iteration (e.g., MVP, v1.0, v1.1)',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            versionName: { type: 'string', description: 'Version name (e.g., "MVP", "v1.0", "Sprint 1")' },
            versionNumber: { type: 'string', description: 'Semver version (e.g., "1.0.0") (optional)' },
            description: { type: 'string', description: 'Version description (optional)' },
            goals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  goal: { type: 'string' },
                  completed: { type: 'boolean' },
                },
              },
              description: 'Version goals/objectives (optional)',
            },
          },
          required: ['projectId', 'versionName'],
        },
      },
      {
        name: 'update_version',
        description: 'Update a project version',
        inputSchema: {
          type: 'object',
          properties: {
            versionId: { type: 'string', description: 'The UUID of the version' },
            status: {
              type: 'string',
              enum: ['planning', 'in-progress', 'completed', 'released'],
              description: 'Version status (optional)',
            },
            releaseNotes: { type: 'string', description: 'Markdown release notes (optional)' },
            goals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  goal: { type: 'string' },
                  completed: { type: 'boolean' },
                },
              },
              description: 'Updated goals (optional)',
            },
          },
          required: ['versionId'],
        },
      },
      {
        name: 'get_versions',
        description: 'Get all versions for a project with progress stats',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
          },
          required: ['projectId'],
        },
      },

      // ========== FEATURE REQUESTS ==========
      {
        name: 'create_feature_request',
        description: 'Create a feature request, bug report, or improvement proposal',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            title: { type: 'string', description: 'Feature request title' },
            description: { type: 'string', description: 'Detailed description' },
            requestType: {
              type: 'string',
              enum: ['enhancement', 'bug', 'feature', 'tech_debt', 'refactor'],
              description: 'Type of request',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Priority level (default: medium)',
            },
            requestedBy: { type: 'string', description: 'Who requested this (name)' },
            requestedByType: {
              type: 'string',
              enum: ['human', 'agent'],
              description: 'Whether requested by human or agent',
            },
            impact: { type: 'string', description: 'Business impact description (optional)' },
            effortEstimate: { type: 'string', description: 'Effort estimate (optional)' },
            metadata: {
              type: 'object',
              description: 'Additional context: screenshots, logs, analytics (optional)',
            },
          },
          required: ['projectId', 'title', 'description', 'requestType', 'requestedBy', 'requestedByType'],
        },
      },
      {
        name: 'approve_feature_request',
        description: 'Approve a feature request and automatically create a project step for it',
        inputSchema: {
          type: 'object',
          properties: {
            featureRequestId: { type: 'string', description: 'The UUID of the feature request' },
            approvedBy: { type: 'string', description: 'Who approved this' },
            versionId: { type: 'string', description: 'Assign to version (optional)' },
            assignedAgent: {
              type: 'string',
              enum: ['v0', 'claude', 'gemini', 'gpt'],
              description: 'Assign to specific agent (optional)',
            },
          },
          required: ['featureRequestId', 'approvedBy'],
        },
      },
      {
        name: 'get_feature_backlog',
        description: 'Get prioritized feature request backlog',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            status: {
              type: 'string',
              enum: ['proposed', 'approved', 'in-progress', 'completed', 'rejected', 'deferred'],
              description: 'Filter by status (optional)',
            },
            requestType: {
              type: 'string',
              enum: ['enhancement', 'bug', 'feature', 'tech_debt', 'refactor'],
              description: 'Filter by type (optional)',
            },
          },
          required: ['projectId'],
        },
      },

      // ========== PROJECT PHASES ==========
      {
        name: 'get_current_phase',
        description: 'Get the current active phase for a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'transition_to_phase',
        description: 'Complete current phase and transition to next phase',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            newPhase: {
              type: 'string',
              enum: ['ideation', 'architecture', 'construction', 'testing', 'deployment', 'maintenance'],
              description: 'The new phase to transition to',
            },
            completedBy: { type: 'string', description: 'Who is marking the phase complete (human or agent name)' },
            description: { type: 'string', description: 'Description for the new phase (optional)' },
          },
          required: ['projectId', 'newPhase', 'completedBy'],
        },
      },

      // ========== ARCHITECTURE DECISIONS (ADRs) ==========
      {
        name: 'create_adr',
        description: 'Create an Architecture Decision Record',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            title: { type: 'string', description: 'Title of the decision' },
            context: { type: 'string', description: 'Why we are making this decision' },
            decision: { type: 'string', description: 'What we decided' },
            consequences: { type: 'string', description: 'Implications of this decision (optional)' },
            alternatives: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  option: { type: 'string' },
                  pros: { type: 'array', items: { type: 'string' } },
                  cons: { type: 'array', items: { type: 'string' } },
                  reasonNotChosen: { type: 'string' },
                },
              },
              description: 'Alternative options considered (optional)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags like ["database", "backend", "security"]',
            },
            decidedBy: { type: 'string', description: 'Who made the decision (optional)' },
          },
          required: ['projectId', 'title', 'context', 'decision'],
        },
      },
      {
        name: 'update_adr',
        description: 'Update an Architecture Decision Record status',
        inputSchema: {
          type: 'object',
          properties: {
            adrId: { type: 'string', description: 'The UUID of the ADR' },
            status: {
              type: 'string',
              enum: ['proposed', 'accepted', 'rejected', 'superseded', 'deprecated'],
              description: 'New status',
            },
            decidedBy: { type: 'string', description: 'Who decided (optional)' },
          },
          required: ['adrId', 'status'],
        },
      },
      {
        name: 'get_project_adrs',
        description: 'Get all Architecture Decision Records for a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            status: {
              type: 'string',
              enum: ['proposed', 'accepted', 'rejected', 'superseded', 'deprecated'],
              description: 'Filter by status (optional)',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'supersede_adr',
        description: 'Mark an ADR as superseded by a new one (for architecture pivots)',
        inputSchema: {
          type: 'object',
          properties: {
            oldAdrId: { type: 'string', description: 'The UUID of the ADR being replaced' },
            newAdrId: { type: 'string', description: 'The UUID of the new ADR' },
          },
          required: ['oldAdrId', 'newAdrId'],
        },
      },

      // ========== BLOB STORAGE / DOCUMENTS ==========
      {
        name: 'upload_document',
        description: 'Upload a file to blob storage and create document record',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            title: { type: 'string', description: 'Document title' },
            description: { type: 'string', description: 'Document description (optional)' },
            category: {
              type: 'string',
              enum: ['prd', 'design', 'spec', 'diagram', 'export', 'other'],
              description: 'Document category',
            },
            fileData: { type: 'string', description: 'Base64 encoded file data' },
            fileName: { type: 'string', description: 'Original file name' },
            fileType: { type: 'string', description: 'MIME type (e.g., image/png, application/pdf)' },
          },
          required: ['projectId', 'title', 'fileData', 'fileName', 'fileType'],
        },
      },
      {
        name: 'get_project_documents',
        description: 'Get all documents for a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'The UUID of the project' },
            category: {
              type: 'string',
              enum: ['prd', 'design', 'spec', 'diagram', 'export', 'other'],
              description: 'Filter by category (optional)',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'get_document',
        description: 'Get document details with version history',
        inputSchema: {
          type: 'object',
          properties: {
            documentId: { type: 'string', description: 'The UUID of the document' },
          },
          required: ['documentId'],
        },
      },
      {
        name: 'delete_document',
        description: 'Delete a document from blob storage and database',
        inputSchema: {
          type: 'object',
          properties: {
            documentId: { type: 'string', description: 'The UUID of the document' },
          },
          required: ['documentId'],
        },
      },
    ],
  }
})

/**
 * Tool Call Handler - Executes tool actions
 */
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params as {
    name: string
    arguments: Record<string, any>
  }

  switch (name) {
    case 'get_next_step': {
      const { projectId } = args

      // Get the next recommended step (should_work = true and can_work = true)
      const [nextStep] = await sql<ProjectStep[]>`
        SELECT * FROM project_steps
        WHERE project_id = ${projectId}
          AND status = 'pending'
          AND can_work = true
          AND should_work = true
          AND deleted_at IS NULL
        ORDER BY order_index
        LIMIT 1
      `

      if (!nextStep) {
        // No recommended step, get any available step
        const [anyStep] = await sql<ProjectStep[]>`
          SELECT * FROM project_steps
          WHERE project_id = ${projectId}
            AND status = 'pending'
            AND can_work = true
            AND deleted_at IS NULL
          ORDER BY order_index
          LIMIT 1
        `

        if (!anyStep) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  nextStep: null,
                  message: 'No available steps to work on. All steps are either completed, in progress, or blocked.',
                }),
              },
            ],
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                nextStep: anyStep,
                message: 'This is an available step (not the recommended next step)',
              }),
            },
          ],
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              nextStep,
              message: 'This is the recommended next step',
            }),
          },
        ],
      }
    }

    case 'mark_step_complete': {
      const { projectId, stepId, actualHours, notes } = args

      // Update step status
      await sql`
        UPDATE project_steps
        SET
          status = 'completed',
          progress = 100,
          completed_at = NOW(),
          actual_hours = COALESCE(${actualHours}, actual_hours),
          updated_at = NOW()
        WHERE id = ${stepId} AND project_id = ${projectId}
      `

      // Log to execution history
      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          ${stepId},
          'step_completed',
          ${notes || 'Step marked as completed'},
          ${JSON.stringify({ actualHours, completedAt: new Date().toISOString() })}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Step ${stepId} marked as completed`,
            }),
          },
        ],
      }
    }

    case 'mark_step_in_progress': {
      const { projectId, stepId } = args

      await sql`
        UPDATE project_steps
        SET
          status = 'in-progress',
          updated_at = NOW()
        WHERE id = ${stepId} AND project_id = ${projectId}
      `

      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description
        ) VALUES (
          ${projectId},
          ${stepId},
          'step_started',
          'Step marked as in progress'
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Step ${stepId} marked as in progress`,
            }),
          },
        ],
      }
    }

    case 'report_blocker': {
      const { projectId, stepId, blocker, severity } = args

      await sql`
        UPDATE project_steps
        SET
          status = 'blocked',
          updated_at = NOW()
        WHERE id = ${stepId} AND project_id = ${projectId}
      `

      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description, metadata
        ) VALUES (
          ${projectId},
          ${stepId},
          'blocker_identified',
          ${blocker},
          ${JSON.stringify({ severity })}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Blocker reported for step ${stepId}`,
              blocker,
              severity,
            }),
          },
        ],
      }
    }

    case 'update_step_progress': {
      const { projectId, stepId, progress } = args

      await sql`
        UPDATE project_steps
        SET
          progress = ${progress},
          status = CASE
            WHEN ${progress} = 100 THEN 'completed'
            WHEN ${progress} > 0 THEN 'in-progress'
            ELSE status
          END,
          updated_at = NOW()
        WHERE id = ${stepId} AND project_id = ${projectId}
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Step ${stepId} progress updated to ${progress}%`,
            }),
          },
        ],
      }
    }

    // ========== PROJECT MANAGEMENT TOOLS ==========

    case 'create_project': {
      const { name, description, status, priority, githubRepoUrl, dueDate } = args

      const [project] = await sql<Project[]>`
        INSERT INTO projects (
          name,
          description,
          status,
          priority,
          github_repo_url,
          due_date
        ) VALUES (
          ${name},
          ${description},
          ${status || 'planning'},
          ${priority || 'medium'},
          ${githubRepoUrl || null},
          ${dueDate || null}
        )
        RETURNING *
      `

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description
        ) VALUES (
          ${project.id},
          'project_created',
          ${`Project "${name}" created`}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Project created successfully',
              project,
            }),
          },
        ],
      }
    }

    case 'update_project': {
      const {
        projectId,
        name,
        description,
        status,
        priority,
        currentPhase,
        health,
        githubRepoUrl,
        dueDate,
      } = args

      // Build dynamic update fields
      const updates: any = { updated_at: new Date() }
      if (name !== undefined) updates.name = name
      if (description !== undefined) updates.description = description
      if (status !== undefined) updates.status = status
      if (priority !== undefined) updates.priority = priority
      if (currentPhase !== undefined) updates.current_phase = currentPhase
      if (health !== undefined) updates.health = health
      if (githubRepoUrl !== undefined) updates.github_repo_url = githubRepoUrl
      if (dueDate !== undefined) updates.due_date = dueDate

      const [project] = await sql<Project[]>`
        UPDATE projects
        SET ${sql(updates)}
        WHERE id = ${projectId} AND deleted_at IS NULL
        RETURNING *
      `

      if (!project) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Project ${projectId} not found`,
              }),
            },
          ],
        }
      }

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          'project_updated',
          'Project details updated',
          ${JSON.stringify(updates)}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Project updated successfully',
              project,
            }),
          },
        ],
      }
    }

    case 'delete_project': {
      const { projectId } = args

      await sql`
        UPDATE projects
        SET deleted_at = NOW()
        WHERE id = ${projectId}
      `

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description
        ) VALUES (
          ${projectId},
          'project_deleted',
          'Project soft deleted'
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Project ${projectId} deleted successfully`,
            }),
          },
        ],
      }
    }

    // ========== STEP MANAGEMENT TOOLS ==========

    case 'create_step': {
      const {
        projectId,
        title,
        description,
        phase,
        stage,
        estimatedHours,
        priority,
        assignedAgent,
        tasks,
        acceptanceCriteria,
        startDate,
        endDate,
        parentTaskId,
      } = args

      // Get next order_index
      const [{ maxOrder }] = await sql<[{ maxOrder: number }]>`
        SELECT COALESCE(MAX(order_index), -1) as max_order
        FROM project_steps
        WHERE project_id = ${projectId} AND deleted_at IS NULL
      `

      const [step] = await sql<ProjectStep[]>`
        INSERT INTO project_steps (
          project_id,
          title,
          description,
          phase,
          stage,
          order_index,
          estimated_hours,
          priority,
          assigned_agent,
          tasks,
          acceptance_criteria,
          start_date,
          end_date,
          parent_task_id
        ) VALUES (
          ${projectId},
          ${title},
          ${description},
          ${phase},
          ${stage},
          ${maxOrder + 1},
          ${estimatedHours || 0},
          ${priority || null},
          ${assignedAgent || null},
          ${tasks ? JSON.stringify(tasks) : '[]'},
          ${acceptanceCriteria ? JSON.stringify(acceptanceCriteria) : '[]'},
          ${startDate || null},
          ${endDate || null},
          ${parentTaskId || null}
        )
        RETURNING *
      `

      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description
        ) VALUES (
          ${projectId},
          ${step.id},
          'step_created',
          ${`Step "${title}" created in ${phase} / ${stage}`}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Step created successfully',
              step,
            }),
          },
        ],
      }
    }

    case 'update_step': {
      const {
        projectId,
        stepId,
        title,
        description,
        status,
        priority,
        assignedAgent,
        estimatedHours,
        tasks,
        acceptanceCriteria,
        startDate,
        endDate,
      } = args

      // Build dynamic update fields
      const updates: any = { updated_at: new Date() }
      if (title !== undefined) updates.title = title
      if (description !== undefined) updates.description = description
      if (status !== undefined) updates.status = status
      if (priority !== undefined) updates.priority = priority
      if (assignedAgent !== undefined) updates.assigned_agent = assignedAgent
      if (estimatedHours !== undefined) updates.estimated_hours = estimatedHours
      if (tasks !== undefined) updates.tasks = JSON.stringify(tasks)
      if (acceptanceCriteria !== undefined) updates.acceptance_criteria = JSON.stringify(acceptanceCriteria)
      if (startDate !== undefined) updates.start_date = startDate
      if (endDate !== undefined) updates.end_date = endDate

      const [step] = await sql<ProjectStep[]>`
        UPDATE project_steps
        SET ${sql(updates)}
        WHERE id = ${stepId} AND project_id = ${projectId} AND deleted_at IS NULL
        RETURNING *
      `

      if (!step) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Step ${stepId} not found`,
              }),
            },
          ],
        }
      }

      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          ${stepId},
          'step_updated',
          'Step details updated',
          ${JSON.stringify(updates)}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Step updated successfully',
              step,
            }),
          },
        ],
      }
    }

    case 'delete_step': {
      const { projectId, stepId } = args

      await sql`
        UPDATE project_steps
        SET deleted_at = NOW()
        WHERE id = ${stepId} AND project_id = ${projectId}
      `

      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description
        ) VALUES (
          ${projectId},
          ${stepId},
          'step_deleted',
          'Step soft deleted'
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Step ${stepId} deleted successfully`,
            }),
          },
        ],
      }
    }

    case 'reorder_steps': {
      const { projectId, stepOrder } = args

      // Update each step's order_index
      for (const { stepId, orderIndex } of stepOrder) {
        await sql`
          UPDATE project_steps
          SET order_index = ${orderIndex}, updated_at = NOW()
          WHERE id = ${stepId} AND project_id = ${projectId}
        `
      }

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          'steps_reordered',
          'Project steps reordered',
          ${JSON.stringify(stepOrder)}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Reordered ${stepOrder.length} steps`,
            }),
          },
        ],
      }
    }

    // ========== BUSINESS CONTEXT TOOLS ==========

    case 'create_business_context': {
      const {
        projectId,
        vision,
        targetMarket,
        primaryUseCase,
        revenueModel,
        competitiveAdvantage,
        successMetrics,
        riskAssessment,
        stakeholders,
        budgetInfo,
      } = args

      const [context] = await sql<BusinessContext[]>`
        INSERT INTO business_context (
          project_id,
          vision,
          target_market,
          primary_use_case,
          revenue_model,
          competitive_advantage,
          success_metrics,
          risk_assessment,
          stakeholders,
          budget_info
        ) VALUES (
          ${projectId},
          ${vision},
          ${targetMarket},
          ${primaryUseCase},
          ${revenueModel},
          ${competitiveAdvantage || null},
          ${successMetrics ? JSON.stringify(successMetrics) : '[]'},
          ${riskAssessment ? JSON.stringify(riskAssessment) : '[]'},
          ${stakeholders ? JSON.stringify(stakeholders) : '[]'},
          ${budgetInfo ? JSON.stringify(budgetInfo) : null}
        )
        RETURNING *
      `

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description
        ) VALUES (
          ${projectId},
          'business_context_created',
          'Business context added to project'
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Business context created successfully',
              context,
            }),
          },
        ],
      }
    }

    case 'update_business_context': {
      const {
        projectId,
        vision,
        targetMarket,
        primaryUseCase,
        revenueModel,
        competitiveAdvantage,
        successMetrics,
        riskAssessment,
        stakeholders,
        budgetInfo,
      } = args

      // Build dynamic update fields
      const updates: any = {}
      if (vision !== undefined) updates.vision = vision
      if (targetMarket !== undefined) updates.target_market = targetMarket
      if (primaryUseCase !== undefined) updates.primary_use_case = primaryUseCase
      if (revenueModel !== undefined) updates.revenue_model = revenueModel
      if (competitiveAdvantage !== undefined) updates.competitive_advantage = competitiveAdvantage
      if (successMetrics !== undefined) updates.success_metrics = JSON.stringify(successMetrics)
      if (riskAssessment !== undefined) updates.risk_assessment = JSON.stringify(riskAssessment)
      if (stakeholders !== undefined) updates.stakeholders = JSON.stringify(stakeholders)
      if (budgetInfo !== undefined) updates.budget_info = JSON.stringify(budgetInfo)

      const [context] = await sql<BusinessContext[]>`
        UPDATE business_context
        SET ${sql(updates)}
        WHERE project_id = ${projectId}
        RETURNING *
      `

      if (!context) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Business context for project ${projectId} not found`,
              }),
            },
          ],
        }
      }

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          'business_context_updated',
          'Business context updated',
          ${JSON.stringify(updates)}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Business context updated successfully',
              context,
            }),
          },
        ],
      }
    }

    // ========== TECH STACK TOOLS ==========

    case 'add_tech_stack_item': {
      const { projectId, name, category, rationale, version, documentationUrl, alternativesConsidered } =
        args

      // Get next order_index
      const [{ maxOrder }] = await sql<[{ maxOrder: number }]>`
        SELECT COALESCE(MAX(order_index), -1) as max_order
        FROM tech_stack_items
        WHERE project_id = ${projectId} AND deleted_at IS NULL
      `

      const [item] = await sql<TechStackItem[]>`
        INSERT INTO tech_stack_items (
          project_id,
          name,
          category,
          rationale,
          version,
          documentation_url,
          alternatives_considered,
          order_index
        ) VALUES (
          ${projectId},
          ${name},
          ${category},
          ${rationale},
          ${version || null},
          ${documentationUrl || null},
          ${alternativesConsidered ? JSON.stringify(alternativesConsidered) : '[]'},
          ${maxOrder + 1}
        )
        RETURNING *
      `

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          'tech_stack_added',
          ${`Added ${name} to tech stack`},
          ${JSON.stringify({ name, category, rationale })}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Tech stack item added successfully',
              item,
            }),
          },
        ],
      }
    }

    case 'update_tech_stack_item': {
      const { projectId, techStackId, name, category, rationale, version, documentationUrl, alternativesConsidered } =
        args

      // Build dynamic update fields
      const updates: any = { updated_at: new Date() }
      if (name !== undefined) updates.name = name
      if (category !== undefined) updates.category = category
      if (rationale !== undefined) updates.rationale = rationale
      if (version !== undefined) updates.version = version
      if (documentationUrl !== undefined) updates.documentation_url = documentationUrl
      if (alternativesConsidered !== undefined)
        updates.alternatives_considered = JSON.stringify(alternativesConsidered)

      const [item] = await sql<TechStackItem[]>`
        UPDATE tech_stack_items
        SET ${sql(updates)}
        WHERE id = ${techStackId} AND project_id = ${projectId} AND deleted_at IS NULL
        RETURNING *
      `

      if (!item) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Tech stack item ${techStackId} not found`,
              }),
            },
          ],
        }
      }

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          'tech_stack_updated',
          'Tech stack item updated',
          ${JSON.stringify(updates)}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Tech stack item updated successfully',
              item,
            }),
          },
        ],
      }
    }

    case 'remove_tech_stack_item': {
      const { projectId, techStackId } = args

      await sql`
        UPDATE tech_stack_items
        SET deleted_at = NOW()
        WHERE id = ${techStackId} AND project_id = ${projectId}
      `

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description
        ) VALUES (
          ${projectId},
          'tech_stack_removed',
          ${`Tech stack item ${techStackId} removed`}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Tech stack item removed successfully',
            }),
          },
        ],
      }
    }

    // ========== DEPENDENCY TOOLS ==========

    case 'create_dependency': {
      const { projectId, stepId, dependsOnStepId, dependencyType } = args

      const [dependency] = await sql<StepDependency[]>`
        INSERT INTO step_dependencies (
          step_id,
          depends_on_step_id,
          dependency_type
        ) VALUES (
          ${stepId},
          ${dependsOnStepId},
          ${dependencyType}
        )
        RETURNING *
      `

      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          ${stepId},
          'dependency_created',
          ${`Added ${dependencyType} dependency on step ${dependsOnStepId}`},
          ${JSON.stringify({ dependsOnStepId, dependencyType })}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Dependency created successfully',
              dependency,
            }),
          },
        ],
      }
    }

    case 'remove_dependency': {
      const { projectId, stepId, dependsOnStepId } = args

      await sql`
        UPDATE step_dependencies
        SET deleted_at = NOW()
        WHERE step_id = ${stepId} AND depends_on_step_id = ${dependsOnStepId}
      `

      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description
        ) VALUES (
          ${projectId},
          ${stepId},
          'dependency_removed',
          ${`Removed dependency on step ${dependsOnStepId}`}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Dependency removed successfully',
            }),
          },
        ],
      }
    }

    // ========== DOCUMENT TOOLS ==========

    case 'create_document': {
      const { projectId, title, description, content, docType, category, tags, s3Key, fileType } = args

      const [document] = await sql`
        INSERT INTO documents (
          project_id,
          title,
          description,
          content,
          doc_type,
          category,
          tags,
          s3_key,
          file_type
        ) VALUES (
          ${projectId},
          ${title},
          ${description},
          ${content || null},
          ${docType || null},
          ${category || 'general'},
          ${tags ? tags : []},
          ${s3Key || null},
          ${fileType || null}
        )
        RETURNING *
      `

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          'document_created',
          ${`Document "${title}" created`},
          ${JSON.stringify({ title, docType })}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Document created successfully',
              document,
            }),
          },
        ],
      }
    }

    case 'update_document': {
      const { projectId, documentId, title, description, content, docType, tags } = args

      // Build dynamic update fields
      const updates: any = { updated_at: new Date() }
      if (title !== undefined) updates.title = title
      if (description !== undefined) updates.description = description
      if (content !== undefined) updates.content = content
      if (docType !== undefined) updates.doc_type = docType
      if (tags !== undefined) updates.tags = tags

      const [document] = await sql`
        UPDATE documents
        SET ${sql(updates)}
        WHERE id = ${documentId} AND project_id = ${projectId} AND deleted_at IS NULL
        RETURNING *
      `

      if (!document) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Document ${documentId} not found`,
              }),
            },
          ],
        }
      }

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          'document_updated',
          ${`Document "${document.title}" updated`},
          ${JSON.stringify(updates)}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Document updated successfully',
              document,
            }),
          },
        ],
      }
    }

    case 'delete_document': {
      const { projectId, documentId } = args

      await sql`
        UPDATE documents
        SET deleted_at = NOW()
        WHERE id = ${documentId} AND project_id = ${projectId}
      `

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description
        ) VALUES (
          ${projectId},
          'document_deleted',
          ${`Document ${documentId} deleted`}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Document deleted successfully',
            }),
          },
        ],
      }
    }

    case 'link_document_to_task': {
      const { documentId, taskId, relationshipType } = args

      await sql`
        INSERT INTO document_tasks (document_id, task_id, relationship_type)
        VALUES (${documentId}, ${taskId}, ${relationshipType})
        ON CONFLICT (document_id, task_id)
        DO UPDATE SET relationship_type = ${relationshipType}
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Document linked to task with relationship: ${relationshipType}`,
            }),
          },
        ],
      }
    }

    case 'unlink_document_from_task': {
      const { documentId, taskId } = args

      await sql`
        DELETE FROM document_tasks
        WHERE document_id = ${documentId} AND task_id = ${taskId}
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Document unlinked from task',
            }),
          },
        ],
      }
    }

    // ========== AGENT ASSIGNMENT TOOLS ==========

    case 'assign_agent_to_task': {
      const { projectId, stepId, agentName } = args

      // Use the database function to assign agent
      await sql`
        SELECT assign_task_to_agent(${stepId}, ${agentName})
      `

      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          ${stepId},
          'agent_assigned',
          ${`Agent ${agentName} assigned to task`},
          ${JSON.stringify({ agentName })}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Agent ${agentName} assigned to task successfully`,
            }),
          },
        ],
      }
    }

    case 'unassign_agent_from_task': {
      const { projectId, stepId } = args

      // Update step to remove agent assignment
      await sql`
        UPDATE project_steps
        SET assigned_agent = NULL, updated_at = NOW()
        WHERE id = ${stepId} AND project_id = ${projectId}
      `

      // Set agent back to idle
      await sql`
        UPDATE agents
        SET current_task_id = NULL, status = 'idle', last_active_at = NOW()
        WHERE current_task_id = ${stepId}
      `

      await sql`
        INSERT INTO execution_history (
          project_id, step_id, event_type, description
        ) VALUES (
          ${projectId},
          ${stepId},
          'agent_unassigned',
          'Agent unassigned from task'
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Agent unassigned from task successfully',
            }),
          },
        ],
      }
    }

    // ========== PROGRESS NOTES TOOLS ==========

    case 'add_progress_note': {
      const { projectId, stepId, authorName, authorType, noteType, title, content, metadata } = args

      const [note] = await sql<ProgressNote[]>`
        INSERT INTO progress_notes (
          project_id,
          step_id,
          author_type,
          author_name,
          note_type,
          title,
          content,
          metadata
        ) VALUES (
          ${projectId},
          ${stepId || null},
          ${authorType},
          ${authorName},
          ${noteType},
          ${title || null},
          ${content},
          ${metadata ? JSON.stringify(metadata) : '{}'}
        )
        RETURNING *
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Progress note added successfully',
              note,
            }),
          },
        ],
      }
    }

    case 'get_progress_notes': {
      const { projectId, stepId, limit } = args

      let notes: ProgressNote[]

      if (stepId) {
        // Get notes for specific step
        notes = await sql<ProgressNote[]>`
          SELECT * FROM get_step_progress_timeline(${stepId})
        `
      } else if (projectId) {
        // Get notes for project
        notes = await sql<ProgressNote[]>`
          SELECT * FROM get_recent_progress(${projectId}, ${limit || 50})
        `
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Must provide either projectId or stepId',
              }),
            },
          ],
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              count: notes.length,
              notes,
            }),
          },
        ],
      }
    }

    // ========== PROJECT VERSIONS TOOLS ==========

    case 'create_version': {
      const { projectId, versionName, versionNumber, description, goals } = args

      const [version] = await sql<ProjectVersion[]>`
        INSERT INTO project_versions (
          project_id,
          version_name,
          version_number,
          description,
          goals
        ) VALUES (
          ${projectId},
          ${versionName},
          ${versionNumber || null},
          ${description || null},
          ${goals ? JSON.stringify(goals) : '[]'}
        )
        RETURNING *
      `

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          'version_created',
          ${`Version "${versionName}" created`},
          ${JSON.stringify({ versionId: version.id, versionName })}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Version created successfully',
              version,
            }),
          },
        ],
      }
    }

    case 'update_version': {
      const { versionId, status, releaseNotes, goals } = args

      const updates: any = { updated_at: new Date() }
      if (status !== undefined) updates.status = status
      if (releaseNotes !== undefined) updates.release_notes = releaseNotes
      if (goals !== undefined) updates.goals = JSON.stringify(goals)

      // Handle status changes with timestamps
      if (status === 'in-progress' && !updates.started_at) {
        updates.started_at = new Date()
      } else if (status === 'completed' && !updates.completed_at) {
        updates.completed_at = new Date()
      } else if (status === 'released' && !updates.released_at) {
        updates.released_at = new Date()
      }

      const [version] = await sql<ProjectVersion[]>`
        UPDATE project_versions
        SET ${sql(updates)}
        WHERE id = ${versionId}
        RETURNING *
      `

      if (!version) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Version ${versionId} not found`,
              }),
            },
          ],
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Version updated successfully',
              version,
            }),
          },
        ],
      }
    }

    case 'get_versions': {
      const { projectId } = args

      const versions = await sql`
        SELECT * FROM get_project_versions(${projectId})
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              count: versions.length,
              versions,
            }),
          },
        ],
      }
    }

    // ========== FEATURE REQUESTS TOOLS ==========

    case 'create_feature_request': {
      const {
        projectId,
        title,
        description,
        requestType,
        priority,
        requestedBy,
        requestedByType,
        impact,
        effortEstimate,
        metadata,
      } = args

      const [request] = await sql<FeatureRequest[]>`
        INSERT INTO feature_requests (
          project_id,
          title,
          description,
          request_type,
          priority,
          requested_by,
          requested_by_type,
          impact,
          effort_estimate,
          metadata
        ) VALUES (
          ${projectId},
          ${title},
          ${description},
          ${requestType},
          ${priority || 'medium'},
          ${requestedBy},
          ${requestedByType},
          ${impact || null},
          ${effortEstimate || null},
          ${metadata ? JSON.stringify(metadata) : '{}'}
        )
        RETURNING *
      `

      await sql`
        INSERT INTO execution_history (
          project_id, event_type, description, new_value
        ) VALUES (
          ${projectId},
          'feature_request_created',
          ${`Feature request "${title}" created by ${requestedBy}`},
          ${JSON.stringify({ requestId: request.id, requestType })}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Feature request created successfully',
              request,
            }),
          },
        ],
      }
    }

    case 'approve_feature_request': {
      const { featureRequestId, approvedBy, versionId, assignedAgent } = args

      // Use database function to approve and create step
      const result = await sql`
        SELECT * FROM approve_and_create_step(
          ${featureRequestId}::UUID,
          ${approvedBy},
          ${versionId || null}::UUID,
          ${assignedAgent || null}
        )
      `

      const [approval] = result

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: approval.success,
              message: approval.message,
              featureRequestId: approval.feature_request_id,
              stepId: approval.step_id,
            }),
          },
        ],
      }
    }

    case 'get_feature_backlog': {
      const { projectId, status, requestType } = args

      const backlog = await sql`
        SELECT * FROM get_feature_backlog(
          ${projectId}::UUID,
          ${status || null},
          ${requestType || null}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              count: backlog.length,
              backlog,
            }),
          },
        ],
      }
    }

    // ========== PROJECT PHASES TOOLS ==========

    case 'get_current_phase': {
      const { projectId } = args

      const phase = await sql`
        SELECT * FROM get_current_phase(${projectId}::UUID)
      `

      const [currentPhase] = phase

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              phase: currentPhase || null,
              message: currentPhase ? 'Current phase found' : 'No active phase',
            }),
          },
        ],
      }
    }

    case 'transition_to_phase': {
      const { projectId, newPhase, completedBy, description } = args

      const result = await sql`
        SELECT * FROM transition_to_phase(
          ${projectId}::UUID,
          ${newPhase},
          ${completedBy},
          ${description || null}
        )
      `

      const [transition] = result

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: transition.success,
              message: transition.message,
              newPhaseId: transition.new_phase_id,
            }),
          },
        ],
      }
    }

    // ========== ARCHITECTURE DECISIONS (ADR) TOOLS ==========

    case 'create_adr': {
      const { projectId, title, context, decision, consequences, alternatives, tags, decidedBy } = args

      const [adr] = await sql`
        INSERT INTO architecture_decisions (
          project_id,
          title,
          context,
          decision,
          consequences,
          alternatives,
          tags,
          decided_by,
          decided_at,
          status
        ) VALUES (
          ${projectId},
          ${title},
          ${context},
          ${decision},
          ${consequences || null},
          ${alternatives ? JSON.stringify(alternatives) : '[]'}::jsonb,
          ${tags || []}::TEXT[],
          ${decidedBy || null},
          ${decidedBy ? sql`NOW()` : null},
          ${decidedBy ? 'accepted' : 'proposed'}
        )
        RETURNING *
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Architecture Decision Record created',
              adr,
            }),
          },
        ],
      }
    }

    case 'update_adr': {
      const { adrId, status, decidedBy } = args

      const [adr] = await sql`
        UPDATE architecture_decisions
        SET
          status = ${status},
          decided_by = COALESCE(${decidedBy || null}, decided_by),
          decided_at = CASE
            WHEN ${status} IN ('accepted', 'rejected') AND decided_at IS NULL
            THEN NOW()
            ELSE decided_at
          END,
          updated_at = NOW()
        WHERE id = ${adrId}
        RETURNING *
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'ADR updated',
              adr,
            }),
          },
        ],
      }
    }

    case 'get_project_adrs': {
      const { projectId, status } = args

      const adrs = await sql`
        SELECT * FROM get_project_adrs(
          ${projectId}::UUID,
          ${status || null}
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              count: adrs.length,
              adrs,
            }),
          },
        ],
      }
    }

    case 'supersede_adr': {
      const { oldAdrId, newAdrId } = args

      const success = await sql`
        SELECT supersede_adr(
          ${oldAdrId}::UUID,
          ${newAdrId}::UUID
        )
      `

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'ADR superseded successfully',
            }),
          },
        ],
      }
    }

    // ========== BLOB STORAGE / DOCUMENTS TOOLS ==========

    case 'upload_document': {
      const { projectId, title, description, category, fileData, fileName, fileType } = args

      try {
        // Decode base64 file data
        const buffer = Buffer.from(fileData, 'base64')

        // Calculate content hash for deduplication
        const hash = crypto.createHash('sha256').update(buffer).digest('hex')

        // Check for existing file with same hash
        const existingDocs = await sql`
          SELECT id, blob_url, title FROM documents
          WHERE project_id = ${projectId}
            AND content_hash = ${hash}
            AND deleted_at IS NULL
        `

        if (existingDocs.rows.length > 0) {
          const existing = existingDocs.rows[0]
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: 'File already exists (duplicate)',
                  documentId: existing.id,
                  blobUrl: existing.blob_url,
                  duplicate: true,
                }),
              },
            ],
          }
        }

        // Upload to Vercel Blob
        const pathname = `projects/${projectId}/${Date.now()}-${fileName}`
        const blob = await put(pathname, buffer, {
          access: 'public',
          contentType: fileType,
        })

        // Generate thumbnail for images (placeholder)
        let thumbnailUrl = null
        const metadata: any = {
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
        }

        if (fileType.startsWith('image/')) {
          thumbnailUrl = blob.url
          metadata.isImage = true
        }

        // Create document record
        const documentResult = await sql`
          INSERT INTO documents (
            project_id,
            title,
            description,
            blob_key,
            blob_url,
            thumbnail_url,
            file_type,
            file_size,
            category,
            content_hash,
            uploaded_by,
            metadata
          ) VALUES (
            ${projectId},
            ${title},
            ${description || null},
            ${blob.pathname},
            ${blob.url},
            ${thumbnailUrl},
            ${fileType},
            ${buffer.length},
            ${category || 'other'},
            ${hash},
            'agent',
            ${JSON.stringify(metadata)}
          )
          RETURNING *
        `

        const document = documentResult.rows[0]

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Document uploaded successfully',
                document,
                blobUrl: blob.url,
              }),
            },
          ],
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Upload failed',
                details: error.message,
              }),
            },
          ],
        }
      }
    }

    case 'get_project_documents': {
      const { projectId, category } = args

      const result = await sql`
        SELECT * FROM get_project_documents(
          ${projectId}::UUID,
          ${category || null}
        )
      `

      const documents = result.rows

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              count: documents.length,
              documents,
            }),
          },
        ],
      }
    }

    case 'get_document': {
      const { documentId } = args

      const result = await sql`
        SELECT * FROM get_document_with_versions(${documentId}::UUID)
      `

      if (result.rows.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Document not found',
              }),
            },
          ],
        }
      }

      const document = result.rows[0]

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              document,
            }),
          },
        ],
      }
    }

    case 'delete_document': {
      const { documentId } = args

      try {
        // Get document details
        const docResult = await sql`
          SELECT blob_url, project_id, title FROM documents
          WHERE id = ${documentId}
            AND deleted_at IS NULL
        `

        if (docResult.rows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'Document not found',
                }),
              },
            ],
          }
        }

        const document = docResult.rows[0]

        // Delete from Vercel Blob
        await del(document.blob_url)

        // Soft delete in database
        await sql`
          UPDATE documents
          SET deleted_at = NOW()
          WHERE id = ${documentId}
        `

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Document deleted successfully',
              }),
            },
          ],
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Delete failed',
                details: error.message,
              }),
            },
          ],
        }
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

// Export Next.js route handlers
export const { GET, POST } = createMCPHandler(server)
