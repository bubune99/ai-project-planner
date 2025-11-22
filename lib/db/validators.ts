/**
 * Zod validation schemas for database entities
 * Provides runtime validation for inserts and updates
 */

import { z } from 'zod'

// Enum schemas
export const projectStatusSchema = z.enum(['planning', 'in-progress', 'completed', 'on-hold'])
export const projectPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])
export const stepStatusSchema = z.enum(['pending', 'in-progress', 'completed', 'blocked'])
export const dependencyTypeSchema = z.enum(['hard', 'soft'])
export const eventTypeSchema = z.enum([
  'step_started',
  'step_completed',
  'blocker_identified',
  'status_changed',
  'ai_agent_action',
  'project_created',
  'project_updated',
])

// Project schemas
export const projectInsertSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1),
  status: projectStatusSchema,
  priority: projectPrioritySchema,
  progress: z.number().int().min(0).max(100).default(0),
  start_date: z.date().nullable().optional(),
  due_date: z.date().nullable().optional(),
  completed_date: z.date().nullable().optional(),
  github_repo_url: z.string().url().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
})

export const projectUpdateSchema = projectInsertSchema.partial()

// Project step schemas
export const projectStepInsertSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  status: stepStatusSchema,
  progress: z.number().int().min(0).max(100).default(0),
  phase: z.string().min(1),
  stage: z.string().min(1),
  estimated_hours: z.number().nonnegative().default(0),
  actual_hours: z.number().nonnegative().default(0),
  order_index: z.number().int().nonnegative(),
  tasks: z.array(z.string()).default([]),
  metadata: z.record(z.any()).nullable().optional(),
})

export const projectStepUpdateSchema = projectStepInsertSchema.partial().omit({ project_id: true })

// Step dependency schemas
export const stepDependencyInsertSchema = z.object({
  step_id: z.string().uuid(),
  depends_on_step_id: z.string().uuid(),
  dependency_type: dependencyTypeSchema,
}).refine(
  (data) => data.step_id !== data.depends_on_step_id,
  { message: 'A step cannot depend on itself' }
)

// Tech stack item schemas
const alternativeSchema = z.object({
  name: z.string().min(1),
  reason_not_chosen: z.string().min(1),
})

export const techStackItemInsertSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  version: z.string().nullable().optional(),
  rationale: z.string().min(1),
  documentation_url: z.string().url().nullable().optional(),
  alternatives_considered: z.array(alternativeSchema).nullable().optional(),
  order_index: z.number().int().nonnegative(),
})

export const techStackItemUpdateSchema = techStackItemInsertSchema.partial().omit({ project_id: true })

// Business context schemas
const successMetricSchema = z.object({
  metric: z.string().min(1),
  target: z.union([z.string(), z.number()]),
  current: z.union([z.string(), z.number()]),
})

const riskSchema = z.object({
  risk: z.string().min(1),
  impact: z.string().min(1),
  mitigation: z.string().min(1),
})

const stakeholderSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  priority: z.string().min(1),
})

const budgetInfoSchema = z.object({
  total: z.number().nonnegative(),
  allocated: z.number().nonnegative(),
  spent: z.number().nonnegative(),
}).refine(
  (data) => data.spent <= data.allocated && data.allocated <= data.total,
  { message: 'Budget spent cannot exceed allocated, and allocated cannot exceed total' }
)

export const businessContextInsertSchema = z.object({
  project_id: z.string().uuid(),
  vision: z.string().min(1),
  target_market: z.string().min(1),
  primary_use_case: z.string().min(1),
  revenue_model: z.string().min(1),
  competitive_advantage: z.string().min(1),
  success_metrics: z.array(successMetricSchema).nullable().optional(),
  market_analysis: z.record(z.any()).nullable().optional(),
  risk_assessment: z.array(riskSchema).nullable().optional(),
  stakeholders: z.array(stakeholderSchema).nullable().optional(),
  budget_info: budgetInfoSchema.nullable().optional(),
})

export const businessContextUpdateSchema = businessContextInsertSchema.partial().omit({ project_id: true })

// Execution history schemas
export const executionHistoryInsertSchema = z.object({
  project_id: z.string().uuid(),
  step_id: z.string().uuid().nullable().optional(),
  event_type: eventTypeSchema,
  agent_type: z.string().nullable().optional(),
  description: z.string().min(1),
  old_value: z.record(z.any()).nullable().optional(),
  new_value: z.record(z.any()).nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
})

// Document schemas
export const documentInsertSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  s3_key: z.string().min(1),
  file_type: z.string().min(1),
  file_size: z.number().int().positive(),
  category: z.string().min(1),
  uploaded_by: z.string().nullable().optional(),
})

// Query filter schemas
export const queryFilterSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  status: z.union([stepStatusSchema, projectStatusSchema]).optional(),
  deleted_at: z.date().nullable().optional(),
}).catchall(z.any()) // Allow additional filter fields

// Query options schema
export const queryOptionsSchema = z.object({
  filters: queryFilterSchema.optional(),
  orderBy: z.string().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  include_deleted: z.boolean().default(false),
})

// Batch operation schema
export const batchOperationSchema = z.object({
  type: z.enum(['insert', 'update', 'delete']),
  entity: z.enum([
    'projects',
    'project_steps',
    'step_dependencies',
    'tech_stack_items',
    'business_context',
    'execution_history',
    'documents',
  ]),
  data: z.any(), // Validated based on entity type
  filters: queryFilterSchema.optional(),
})

// Transaction operation schema
export const transactionOperationsSchema = z.array(batchOperationSchema).min(1).max(100)

// Export types inferred from schemas
export type ProjectInsert = z.infer<typeof projectInsertSchema>
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>
export type ProjectStepInsert = z.infer<typeof projectStepInsertSchema>
export type ProjectStepUpdate = z.infer<typeof projectStepUpdateSchema>
export type StepDependencyInsert = z.infer<typeof stepDependencyInsertSchema>
export type TechStackItemInsert = z.infer<typeof techStackItemInsertSchema>
export type TechStackItemUpdate = z.infer<typeof techStackItemUpdateSchema>
export type BusinessContextInsert = z.infer<typeof businessContextInsertSchema>
export type BusinessContextUpdate = z.infer<typeof businessContextUpdateSchema>
export type ExecutionHistoryInsert = z.infer<typeof executionHistoryInsertSchema>
export type DocumentInsert = z.infer<typeof documentInsertSchema>
export type QueryFilter = z.infer<typeof queryFilterSchema>
export type QueryOptions = z.infer<typeof queryOptionsSchema>
export type BatchOperation = z.infer<typeof batchOperationSchema>
export type TransactionOperations = z.infer<typeof transactionOperationsSchema>

// Entity-specific validators map
export const insertValidators = {
  projects: projectInsertSchema,
  project_steps: projectStepInsertSchema,
  step_dependencies: stepDependencyInsertSchema,
  tech_stack_items: techStackItemInsertSchema,
  business_context: businessContextInsertSchema,
  execution_history: executionHistoryInsertSchema,
  documents: documentInsertSchema,
} as const

export const updateValidators = {
  projects: projectUpdateSchema,
  project_steps: projectStepUpdateSchema,
  step_dependencies: stepDependencyInsertSchema.partial(),
  tech_stack_items: techStackItemUpdateSchema,
  business_context: businessContextUpdateSchema,
  execution_history: z.never(), // Immutable
  documents: documentInsertSchema.partial(),
} as const

/**
 * Validate data against a schema
 * @param schema - Zod schema
 * @param data - Data to validate
 * @returns Validated data or throws error
 */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data)
}

/**
 * Safely validate data against a schema
 * @param schema - Zod schema
 * @param data - Data to validate
 * @returns Success result with data or failure result with errors
 */
export function safeValidate<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, errors: result.error }
}
