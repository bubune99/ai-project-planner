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

// ============================================================================
// Ideas Module Types (JARVIS)
// ============================================================================

// Idea lifecycle states
export type IdeaLifecycle = 'seed' | 'exploring' | 'refined' | 'promoted' | 'archived'

// Facet types
export type FacetType =
  | 'pros_cons'
  | 'timeline'
  | 'market_research'
  | 'technical_specs'
  | 'financials'
  | 'dependencies'
  | 'risks'
  | 'alternatives'
  | 'custom'

// Validation types
export type ValidationAgentType = 'business' | 'technical' | 'product' | 'custom'
export type ValidationStatus = 'active' | 'completed' | 'paused' | 'cancelled'

// Refinement types
export type RefinementType = 'barrier_found' | 'new_approach' | 'pivot_needed' | 'enhancement' | 'feedback'
export type RefinementStatus = 'open' | 'accepted' | 'rejected' | 'merged'

// Core Idea interface
export interface Idea {
  id: string
  user_id: string
  title: string
  description: string | null
  category: string | null
  tags: string[]
  lifecycle: IdeaLifecycle
  promoted_to_project_id: string | null
  promoted_at: Date | null
  visibility: 'private' | 'shared' | 'public'
  canvas_settings: Record<string, any>
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

// Idea branch (git-like branching)
export interface IdeaBranch {
  id: string
  idea_id: string
  name: string
  parent_branch_id: string | null
  is_active: boolean
  is_main: boolean
  snapshot: Record<string, any>
  created_by: string | null
  created_at: Date
  updated_at: Date
  merged_at: Date | null
  merged_into_branch_id: string | null
}

// Perspective (different viewpoints)
export interface IdeaPerspective {
  id: string
  idea_id: string
  name: string
  description: string | null
  owner: string | null
  is_default: boolean
  settings: Record<string, any>
  created_at: Date
  updated_at: Date
}

// Scenario (constraint scenarios)
export interface IdeaScenario {
  id: string
  idea_id: string
  perspective_id: string | null
  name: string
  constraints: {
    budget?: number | null
    timeline?: string | null
    team?: number | null
    market?: string | null
    technical?: string[] | null
  }
  is_active: boolean
  created_at: Date
  updated_at: Date
}

// Facet (analysis module)
export interface IdeaFacet {
  id: string
  idea_id: string
  branch_id: string | null
  facet_type: FacetType
  name: string | null
  data: Record<string, any>
  position_x: number
  position_y: number
  order_index: number
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

// Canvas node (for ReactFlow)
export interface IdeaCanvasNode {
  id: string
  idea_id: string
  branch_id: string | null
  node_type: 'idea' | 'facet' | 'validation' | 'content'
  reference_id: string | null
  reference_type: string | null
  position_x: number
  position_y: number
  width: number | null
  height: number | null
  style: Record<string, any>
  content: Record<string, any>
  layer: string
  created_at: Date
  updated_at: Date
}

// Canvas edge
export interface IdeaCanvasEdge {
  id: string
  idea_id: string
  branch_id: string | null
  source_node_id: string
  target_node_id: string
  edge_type: 'dependency' | 'relation' | 'derivation'
  label: string | null
  style: Record<string, any>
  created_at: Date
}

// Validation session
export interface IdeaValidation {
  id: string
  idea_id: string
  agent_type: ValidationAgentType
  status: ValidationStatus
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>
  current_facet_id: string | null
  validated_facet_ids: string[]
  validation_score: number | null
  blockers: string[]
  recommendations: string[]
  agent_config: Record<string, any>
  created_at: Date
  updated_at: Date
  completed_at: Date | null
}

// Refinement (feedback from execution)
export interface IdeaRefinement {
  id: string
  idea_id: string
  source_project_id: string
  refinement_type: RefinementType
  status: RefinementStatus
  title: string
  description: string | null
  proposed_changes: Record<string, any>
  comments: Array<{ author: string; content: string; timestamp: string }>
  resolved_at: Date | null
  resolved_by: string | null
  created_at: Date
  updated_at: Date
}

// Generated document
export interface IdeaDocument {
  id: string
  idea_id: string
  document_type: 'business_plan' | 'prd' | 'pitch_deck' | 'tech_spec' | 'executive_summary'
  title: string
  content: string | null
  content_format: 'markdown' | 'html' | 'json'
  generated_from_facets: string[]
  generation_prompt: string | null
  version: number
  previous_version_id: string | null
  blob_key: string | null
  created_at: Date
  updated_at: Date
}

// Insert types for Ideas
export type IdeaInsert = Omit<Idea, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'promoted_at'>
export type IdeaBranchInsert = Omit<IdeaBranch, 'id' | 'created_at' | 'updated_at' | 'merged_at'>
export type IdeaPerspectiveInsert = Omit<IdeaPerspective, 'id' | 'created_at' | 'updated_at'>
export type IdeaScenarioInsert = Omit<IdeaScenario, 'id' | 'created_at' | 'updated_at'>
export type IdeaFacetInsert = Omit<IdeaFacet, 'id' | 'created_at' | 'updated_at'>
export type IdeaCanvasNodeInsert = Omit<IdeaCanvasNode, 'id' | 'created_at' | 'updated_at'>
export type IdeaCanvasEdgeInsert = Omit<IdeaCanvasEdge, 'id' | 'created_at'>
export type IdeaValidationInsert = Omit<IdeaValidation, 'id' | 'created_at' | 'updated_at' | 'completed_at'>
export type IdeaRefinementInsert = Omit<IdeaRefinement, 'id' | 'created_at' | 'updated_at' | 'resolved_at'>
export type IdeaDocumentInsert = Omit<IdeaDocument, 'id' | 'created_at' | 'updated_at'>

// Update types for Ideas
export type IdeaUpdate = Partial<Omit<Idea, 'id' | 'user_id' | 'created_at'>>
export type IdeaBranchUpdate = Partial<Omit<IdeaBranch, 'id' | 'idea_id' | 'created_at'>>
export type IdeaFacetUpdate = Partial<Omit<IdeaFacet, 'id' | 'idea_id' | 'created_at'>>
export type IdeaValidationUpdate = Partial<Omit<IdeaValidation, 'id' | 'idea_id' | 'created_at'>>

// Extended types with relations
export interface IdeaWithDetails extends Idea {
  branches?: IdeaBranch[]
  facets?: IdeaFacet[]
  validations?: IdeaValidation[]
  promoted_project?: { id: string; name: string } | null
}

// ============================================================================
// Memory 5W+H Types (JARVIS - Model Ledger Protocol)
// ============================================================================

// Decision status
export type DecisionStatus = 'active' | 'resolved' | 'revisit' | 'deprecated'

// Stability level
export type StabilityLevel = 'stable' | 'evolving' | 'experimental'

// WHERE Layer: Project Structure
export interface MLPWhereStructure {
  id: string
  user_id: string
  project_id: string | null
  folder_structure: Record<string, any>
  architecture_patterns: string[]
  key_endpoints: string[]
  style_conventions: Record<string, any>
  config_locations: Record<string, string>
  semantic_zones: Array<{ zone: string; paths: string[]; purpose: string }>
  dependency_graph: Record<string, string[]>
  entry_points: string[]
  abstraction_layers: string[]
  compression_level: number
  created_at: Date
  updated_at: Date
}

// WHAT Layer: Module Dependencies
export interface MLPWhatModule {
  id: string
  user_id: string
  project_id: string | null
  file_path: string
  module_name: string | null
  imports: string[]
  exports: string[]
  classes: string[]
  functions: string[]
  types: string[]
  dependencies: string[]
  interface_contracts: Record<string, any>
  module_responsibility: string | null
  public_api: string[]
  change_stability: StabilityLevel
  compression_level: number
  created_at: Date
  updated_at: Date
}

// HOW Layer: Implementation Details
export interface MLPHowImplementation {
  id: string
  user_id: string
  project_id: string | null
  file_path: string
  function_name: string | null
  parsed_structure: Record<string, any>
  complexity_metrics: {
    cyclomaticComplexity?: number
    linesOfCode?: number
    dependencies?: number
  }
  algorithm_patterns: string[]
  performance_characteristics: Record<string, any>
  edge_cases_handled: string[]
  test_coverage: number | null
  optimization_opportunities: string[]
  compression_level: number
  created_at: Date
  updated_at: Date
}

// WHY Layer: Decision Episode
export interface MLPWhyDecision {
  id: string
  user_id: string
  project_id: string | null
  idea_id: string | null
  title: string
  status: DecisionStatus
  summary: string | null
  tags: string[]
  domains: string[]
  stakeholders: string[]
  business_drivers: string[]
  technical_constraints: string[]
  future_considerations: string[]
  compression_level: number
  created_at: Date
  updated_at: Date
}

// WHY Layer: Decision Node
export interface MLPWhyNode {
  id: string
  episode_id: string
  parent_node_id: string | null
  reasoning: string
  alternatives: Array<{ name: string; pros: string[]; cons: string[] }>
  constraints: string[]
  confidence_level: number | null
  revisit_triggers: string[]
  impact_assessment: Record<string, any>
  order_index: number
  created_at: Date
  updated_at: Date
}

// WHY Layer: Attempted Solution
export interface MLPWhyAttempt {
  id: string
  episode_id: string
  problem: string
  approach_tried: string
  failure_mode: string
  root_cause: string | null
  lesson_learned: string
  prevention_strategy: string | null
  created_at: Date
}

// WHY Layer: Solution Comparison
export interface MLPWhyComparison {
  id: string
  episode_id: string
  solution_a: string
  solution_b: string
  criteria: Array<{
    criterion: string
    solution_a_score: number
    solution_b_score: number
    notes?: string
  }>
  winner: string | null
  winner_rationale: string | null
  created_at: Date
}

// WHO Layer: Collaborator
export interface MLPWhoCollaborator {
  id: string
  user_id: string
  name: string
  collaborator_type: 'human' | 'ai' | 'team' | 'service'
  linked_user_id: string | null
  expertise: string[]
  contact_info: Record<string, any>
  notes: string | null
  created_at: Date
  updated_at: Date
}

// WHO Layer: Contribution
export interface MLPWhoContribution {
  id: string
  collaborator_id: string
  project_id: string | null
  idea_id: string | null
  contribution_type: string
  description: string | null
  impact_level: 'low' | 'medium' | 'high' | 'critical' | null
  metadata: Record<string, any>
  created_at: Date
}

// WHEN Layer: Temporal Event
export interface MLPWhenEvent {
  id: string
  user_id: string
  project_id: string | null
  idea_id: string | null
  event_type: string
  description: string | null
  affected_components: string[]
  significance_score: number | null
  event_data: Record<string, any>
  timestamp: Date
}

// WHEN Layer: Code Evolution
export interface MLPWhenEvolution {
  id: string
  user_id: string
  project_id: string | null
  file_path: string
  version: string | null
  commit_hash: string | null
  change_type: 'created' | 'modified' | 'refactored' | 'deleted'
  semantic_diff: Record<string, any>
  evolution_patterns: string[]
  stability_metrics: Record<string, number>
  timestamp: Date
}

// WHEN Layer: Milestone
export interface MLPWhenMilestone {
  id: string
  user_id: string
  project_id: string | null
  idea_id: string | null
  title: string
  description: string | null
  milestone_type: string
  status: 'pending' | 'achieved' | 'missed' | 'cancelled'
  target_date: Date | null
  achieved_date: Date | null
  impact: string | null
  deliverables: Array<{ deliverable: string; completed: boolean; link?: string }>
  created_at: Date
  updated_at: Date
}

// Compression Settings
export interface MLPCompressionSettings {
  id: string
  user_id: string
  where_compression: number
  what_compression: number
  how_compression: number
  why_compression: number
  who_compression: number
  when_compression: number
  max_tokens_per_request: number
  auto_compress: boolean
  retention_decisions: number
  retention_lessons: number
  retention_activity: number
  retention_conversations: number
  created_at: Date
  updated_at: Date
}

// Insert types for Memory
export type MLPWhereStructureInsert = Omit<MLPWhereStructure, 'id' | 'created_at' | 'updated_at'>
export type MLPWhatModuleInsert = Omit<MLPWhatModule, 'id' | 'created_at' | 'updated_at'>
export type MLPHowImplementationInsert = Omit<MLPHowImplementation, 'id' | 'created_at' | 'updated_at'>
export type MLPWhyDecisionInsert = Omit<MLPWhyDecision, 'id' | 'created_at' | 'updated_at'>
export type MLPWhyNodeInsert = Omit<MLPWhyNode, 'id' | 'created_at' | 'updated_at'>
export type MLPWhyAttemptInsert = Omit<MLPWhyAttempt, 'id' | 'created_at'>
export type MLPWhyComparisonInsert = Omit<MLPWhyComparison, 'id' | 'created_at'>
export type MLPWhoCollaboratorInsert = Omit<MLPWhoCollaborator, 'id' | 'created_at' | 'updated_at'>
export type MLPWhoContributionInsert = Omit<MLPWhoContribution, 'id' | 'created_at'>
export type MLPWhenEventInsert = Omit<MLPWhenEvent, 'id'>
export type MLPWhenEvolutionInsert = Omit<MLPWhenEvolution, 'id'>
export type MLPWhenMilestoneInsert = Omit<MLPWhenMilestone, 'id' | 'created_at' | 'updated_at'>

// Update types for Memory
export type MLPWhyDecisionUpdate = Partial<Omit<MLPWhyDecision, 'id' | 'user_id' | 'created_at'>>
export type MLPWhyNodeUpdate = Partial<Omit<MLPWhyNode, 'id' | 'episode_id' | 'created_at'>>
export type MLPWhenMilestoneUpdate = Partial<Omit<MLPWhenMilestone, 'id' | 'user_id' | 'created_at'>>

// Extended types with relations
export interface MLPWhyDecisionWithDetails extends MLPWhyDecision {
  nodes?: MLPWhyNode[]
  attempts?: MLPWhyAttempt[]
  comparisons?: MLPWhyComparison[]
  project?: { id: string; name: string } | null
  idea?: { id: string; title: string } | null
}

// ============================================================================
// Table Names - Extended
// ============================================================================
export const JARVIS_TABLE_NAMES = {
  // Ideas module
  IDEAS: 'ideas',
  IDEA_BRANCHES: 'idea_branches',
  IDEA_PERSPECTIVES: 'idea_perspectives',
  IDEA_SCENARIOS: 'idea_scenarios',
  IDEA_FACETS: 'idea_facets',
  IDEA_CANVAS_NODES: 'idea_canvas_nodes',
  IDEA_CANVAS_EDGES: 'idea_canvas_edges',
  IDEA_VALIDATIONS: 'idea_validations',
  IDEA_REFINEMENTS: 'idea_refinements',
  IDEA_DOCUMENTS: 'idea_documents',
  // Memory 5W+H module
  MLP_WHERE_STRUCTURES: 'mlp_where_structures',
  MLP_WHAT_MODULES: 'mlp_what_modules',
  MLP_HOW_IMPLEMENTATIONS: 'mlp_how_implementations',
  MLP_WHY_DECISIONS: 'mlp_why_decisions',
  MLP_WHY_NODES: 'mlp_why_nodes',
  MLP_WHY_ATTEMPTS: 'mlp_why_attempts',
  MLP_WHY_COMPARISONS: 'mlp_why_comparisons',
  MLP_WHO_COLLABORATORS: 'mlp_who_collaborators',
  MLP_WHO_CONTRIBUTIONS: 'mlp_who_contributions',
  MLP_WHEN_EVENTS: 'mlp_when_events',
  MLP_WHEN_EVOLUTION: 'mlp_when_evolution',
  MLP_WHEN_MILESTONES: 'mlp_when_milestones',
  MLP_COMPRESSION_SETTINGS: 'mlp_compression_settings',
} as const
