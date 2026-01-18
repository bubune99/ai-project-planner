/**
 * Database Schema Types
 * These types match the PostgreSQL schema and provide type safety
 */

// Enum types
export type ProjectStatus = 'planning' | 'in-progress' | 'completed' | 'on-hold'
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical'
export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'blocked'
export type DependencyType = 'hard' | 'soft'
export type EventType =
  | 'step_started'
  | 'step_completed'
  | 'blocker_identified'
  | 'status_changed'
  | 'ai_agent_action'
  | 'project_created'
  | 'project_updated'

// Core table types
export interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  priority: ProjectPriority
  progress: number
  start_date: Date | null
  due_date: Date | null
  completed_date: Date | null
  github_repo_url: string | null
  metadata: Record<string, any> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface ProjectStep {
  id: string
  project_id: string
  title: string
  description: string
  status: StepStatus
  progress: number
  phase: string
  stage: string
  estimated_hours: number
  actual_hours: number
  can_work: boolean
  should_work: boolean
  is_in_progress: boolean
  is_blocked: boolean
  order_index: number
  tasks: string[]
  metadata: Record<string, any> | null
  created_at: Date
  updated_at: Date
  completed_at: Date | null
  deleted_at: Date | null
}

export interface StepDependency {
  id: string
  step_id: string
  depends_on_step_id: string
  dependency_type: DependencyType
  created_at: Date
  deleted_at: Date | null
}

export interface TechStackItem {
  id: string
  project_id: string
  name: string
  category: string
  version: string | null
  rationale: string
  documentation_url: string | null
  alternatives_considered: Array<{
    name: string
    reason_not_chosen: string
  }> | null
  order_index: number
  created_at: Date
  updated_at: Date | null
  deleted_at: Date | null
}

export interface BusinessContext {
  id: string
  project_id: string
  vision: string
  target_market: string
  primary_use_case: string
  revenue_model: string
  competitive_advantage: string
  success_metrics: Array<{
    metric: string
    target: string | number
    current: string | number
  }> | null
  market_analysis: Record<string, any> | null
  risk_assessment: Array<{
    risk: string
    impact: string
    mitigation: string
  }> | null
  stakeholders: Array<{
    name: string
    role: string
    priority: string
  }> | null
  budget_info: {
    total: number
    allocated: number
    spent: number
  } | null
  created_at: Date
  updated_at: Date
}

export interface ExecutionHistory {
  id: string
  project_id: string
  step_id: string | null
  event_type: EventType
  agent_type: string | null
  description: string
  old_value: Record<string, any> | null
  new_value: Record<string, any> | null
  metadata: Record<string, any> | null
  created_at: Date
}

export interface Document {
  id: string
  project_id: string
  title: string
  description: string | null
  s3_key: string
  file_type: string
  file_size: number
  category: string
  uploaded_by: string | null
  created_at: Date
  deleted_at: Date | null
}

export interface ProgressNote {
  id: string
  project_id: string
  step_id: string | null
  author_type: 'human' | 'agent'
  author_name: string
  note_type: 'progress' | 'blocker' | 'question' | 'decision' | 'completion'
  title: string | null
  content: string
  metadata: Record<string, any>
  created_at: Date
}

export interface ProjectVersion {
  id: string
  project_id: string
  version_name: string
  version_number: string | null
  status: 'planning' | 'in-progress' | 'completed' | 'released'
  description: string | null
  goals: Array<{
    goal: string
    completed: boolean
  }> | null
  release_notes: string | null
  started_at: Date | null
  completed_at: Date | null
  released_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface FeatureRequest {
  id: string
  project_id: string
  title: string
  description: string
  request_type: 'enhancement' | 'bug' | 'feature' | 'tech_debt' | 'refactor'
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'proposed' | 'approved' | 'in-progress' | 'completed' | 'rejected' | 'deferred'
  requested_by: string
  requested_by_type: 'human' | 'agent'
  approved_by: string | null
  assigned_to_version_id: string | null
  created_step_id: string | null
  impact: string | null
  effort_estimate: string | null
  acceptance_criteria: Array<{
    description: string
    testCommand?: string
  }> | null
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
  approved_at: Date | null
  completed_at: Date | null
}

export interface ProjectPhase {
  id: string
  project_id: string
  phase_name: 'ideation' | 'architecture' | 'construction' | 'testing' | 'deployment' | 'maintenance'
  status: 'active' | 'completed' | 'skipped'
  description: string | null
  started_at: Date
  completed_at: Date | null
  completed_by: string | null
  exit_criteria: Array<{
    criterion: string
    met: boolean
  }> | null
  deliverables: Array<{
    deliverable: string
    completed: boolean
    link?: string
  }> | null
  created_at: Date
  updated_at: Date
}

export interface ArchitectureDecision {
  id: string
  project_id: string
  title: string
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'deprecated'
  context: string
  decision: string
  consequences: string | null
  alternatives: Array<{
    option: string
    pros: string[]
    cons: string[]
    reason_not_chosen?: string
  }> | null
  supersedes_adr_id: string | null
  superseded_by_adr_id: string | null
  tags: string[]
  decided_by: string | null
  decided_at: Date | null
  created_at: Date
  updated_at: Date
}

// View types (for UI-optimized queries)
export interface ProjectOverview {
  id: string
  name: string
  description: string
  status: ProjectStatus
  progress: number
  priority: ProjectPriority
  due_date: Date | null
  start_date: Date | null
  github_repo_url: string | null
  total_tasks: number
  completed_tasks: number
  current_phase: string | null
  tech_stack: string[] | null
  last_activity: Date | null
}

export interface ProjectExecution {
  id: string
  project_id: string
  title: string
  description: string
  status: StepStatus
  progress: number
  phase: string
  stage: string
  estimated_hours: number
  actual_hours: number
  can_work: boolean
  should_work: boolean
  is_in_progress: boolean
  is_blocked: boolean
  tasks: string[]
  order_index: number
  dependencies: string[] | null
}

export interface TechStackDocumentation {
  id: string
  project_id: string
  name: string
  category: string
  version: string | null
  rationale: string
  documentation_url: string | null
  alternatives_considered: Array<{
    name: string
    reason_not_chosen: string
  }> | null
  order_index: number
}

// Insert types (without generated/auto fields)
export type ProjectInsert = Omit<
  Project,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'progress'
> & {
  progress?: number
}

export type ProjectStepInsert = Omit<
  ProjectStep,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'completed_at' | 'can_work' | 'should_work' | 'is_in_progress' | 'is_blocked'
>

export type StepDependencyInsert = Omit<
  StepDependency,
  'id' | 'created_at' | 'deleted_at'
>

export type TechStackItemInsert = Omit<
  TechStackItem,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
>

export type BusinessContextInsert = Omit<
  BusinessContext,
  'id' | 'created_at' | 'updated_at'
>

export type ExecutionHistoryInsert = Omit<
  ExecutionHistory,
  'id' | 'created_at'
>

export type DocumentInsert = Omit<
  Document,
  'id' | 'created_at' | 'deleted_at'
>

// Update types (all fields optional except id)
export type ProjectUpdate = Partial<Omit<Project, 'id' | 'created_at'>>
export type ProjectStepUpdate = Partial<Omit<ProjectStep, 'id' | 'created_at' | 'can_work' | 'is_blocked'>>
export type TechStackItemUpdate = Partial<Omit<TechStackItem, 'id' | 'created_at'>>
export type BusinessContextUpdate = Partial<Omit<BusinessContext, 'id' | 'created_at'>>

// Table names as const for type safety
export const TABLE_NAMES = {
  PROJECTS: 'projects',
  PROJECT_STEPS: 'project_steps',
  STEP_DEPENDENCIES: 'step_dependencies',
  TECH_STACK_ITEMS: 'tech_stack_items',
  BUSINESS_CONTEXT: 'business_context',
  EXECUTION_HISTORY: 'execution_history',
  DOCUMENTS: 'documents',
  PROGRESS_NOTES: 'progress_notes',
  PROJECT_VERSIONS: 'project_versions',
  FEATURE_REQUESTS: 'feature_requests',
  PROJECT_PHASES: 'project_phases',
  ARCHITECTURE_DECISIONS: 'architecture_decisions',
} as const

export type TableName = typeof TABLE_NAMES[keyof typeof TABLE_NAMES]

// Entity map for generic operations
export type EntityMap = {
  projects: Project
  project_steps: ProjectStep
  step_dependencies: StepDependency
  tech_stack_items: TechStackItem
  business_context: BusinessContext
  execution_history: ExecutionHistory
  documents: Document
  progress_notes: ProgressNote
  project_versions: ProjectVersion
  feature_requests: FeatureRequest
  project_phases: ProjectPhase
  architecture_decisions: ArchitectureDecision
}

export type InsertMap = {
  projects: ProjectInsert
  project_steps: ProjectStepInsert
  step_dependencies: StepDependencyInsert
  tech_stack_items: TechStackItemInsert
  business_context: BusinessContextInsert
  execution_history: ExecutionHistoryInsert
  documents: DocumentInsert
  progress_notes: Omit<ProgressNote, 'id' | 'created_at'>
  project_versions: Omit<ProjectVersion, 'id' | 'created_at' | 'updated_at'>
  feature_requests: Omit<FeatureRequest, 'id' | 'created_at' | 'updated_at'>
  project_phases: Omit<ProjectPhase, 'id' | 'created_at' | 'updated_at'>
  architecture_decisions: Omit<ArchitectureDecision, 'id' | 'created_at' | 'updated_at'>
}

export type UpdateMap = {
  projects: ProjectUpdate
  project_steps: ProjectStepUpdate
  step_dependencies: Partial<StepDependency>
  tech_stack_items: TechStackItemUpdate
  business_context: BusinessContextUpdate
  execution_history: never // History is immutable
  documents: Partial<Document>
  progress_notes: never // Progress notes are immutable (append-only)
  project_versions: Partial<Omit<ProjectVersion, 'id' | 'created_at'>>
  feature_requests: Partial<Omit<FeatureRequest, 'id' | 'created_at'>>
  project_phases: Partial<Omit<ProjectPhase, 'id' | 'created_at'>>
  architecture_decisions: Partial<Omit<ArchitectureDecision, 'id' | 'created_at'>>
}

// ============================================================================
// Collaboration Types
// ============================================================================

// Collaboration role enum
export type CollaboratorRole = 'viewer' | 'editor' | 'admin'

// Invitation types
export type InvitationType = 'email' | 'link'
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

// Activity action types
export type CollaborationActionType =
  // Collaboration management actions
  | 'collaborator_invited'
  | 'collaborator_joined'
  | 'collaborator_removed'
  | 'collaborator_left'
  | 'role_changed'
  | 'invitation_created'
  | 'invitation_revoked'
  | 'invitation_expired'
  | 'link_generated'
  // Project actions by collaborators
  | 'project_viewed'
  | 'project_updated'
  | 'step_created'
  | 'step_updated'
  | 'step_deleted'
  | 'step_status_changed'
  | 'document_created'
  | 'document_updated'
  | 'document_deleted'
  | 'note_created'
  | 'note_updated'
  | 'comment_added'
  | 'adr_created'
  | 'adr_updated'

// Core collaboration interfaces
export interface ProjectCollaborator {
  id: string
  project_id: string
  user_id: string
  role: CollaboratorRole
  invited_by: string | null
  invited_at: Date
  accepted_at: Date | null
  removed_at: Date | null
  removed_by: string | null
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface ProjectInvitation {
  id: string
  project_id: string
  invitation_type: InvitationType
  invitee_email: string | null
  token: string
  token_hash: string
  role: CollaboratorRole
  max_uses: number
  current_uses: number
  expires_at: Date
  invited_by: string
  status: InvitationStatus
  message: string | null
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface CollaborationActivityLog {
  id: string
  project_id: string
  actor_id: string
  actor_role: string
  action_type: CollaborationActionType
  target_type: 'user' | 'invitation' | 'step' | 'document' | 'project' | 'note' | 'adr' | null
  target_id: string | null
  description: string
  old_value: Record<string, any> | null
  new_value: Record<string, any> | null
  metadata: Record<string, any>
  ip_address: string | null
  user_agent: string | null
  created_at: Date
}

// Extended types with joined data (for API responses)
export interface CollaboratorWithUser extends ProjectCollaborator {
  user: {
    id: string
    name: string | null
    email: string
    avatar_url: string | null
  }
}

export interface InvitationWithDetails extends ProjectInvitation {
  inviter: {
    id: string
    name: string | null
    email: string
  }
  project: {
    id: string
    name: string
  }
}

export interface ActivityLogWithActor extends CollaborationActivityLog {
  actor: {
    id: string
    name: string | null
    email: string
    avatar_url: string | null
  }
}

// Insert types for collaboration
export type ProjectCollaboratorInsert = Omit<
  ProjectCollaborator,
  'id' | 'created_at' | 'updated_at' | 'accepted_at' | 'removed_at' | 'removed_by'
>

export type ProjectInvitationInsert = Omit<
  ProjectInvitation,
  'id' | 'created_at' | 'updated_at' | 'current_uses' | 'status'
> & {
  current_uses?: number
  status?: InvitationStatus
}

export type CollaborationActivityLogInsert = Omit<
  CollaborationActivityLog,
  'id' | 'created_at'
>

// Update types for collaboration
export type ProjectCollaboratorUpdate = Partial<
  Pick<ProjectCollaborator, 'role' | 'metadata' | 'accepted_at' | 'removed_at' | 'removed_by'>
>

export type ProjectInvitationUpdate = Partial<
  Pick<ProjectInvitation, 'status' | 'current_uses' | 'metadata'>
>

// ============================================================================
// Todo Types
// ============================================================================

// Todo status and priority enums
export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent'

// Core Todo interface matching database schema
export interface Todo {
  id: string
  user_id: string
  project_id: string | null
  title: string
  description: string | null
  status: TodoStatus
  priority: TodoPriority
  due_date: Date | null
  completed_at: Date | null
  order_index: number
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

// Extended type with project info (for API responses)
export interface TodoWithProject extends Todo {
  project?: {
    id: string
    name: string
  } | null
}

// Insert type (without generated/auto fields)
export type TodoInsert = Omit<
  Todo,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'completed_at' | 'order_index'
> & {
  order_index?: number
}

// Update type (all fields optional except id)
export type TodoUpdate = Partial<Omit<Todo, 'id' | 'user_id' | 'created_at'>>
