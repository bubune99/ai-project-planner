export interface Project {
  id: string
  name: string
  description: string
  status: "planning" | "in-progress" | "completed" | "on-hold"
  priority: "low" | "medium" | "high" | "critical"
  progress: number
  current_phase?: string
  phase?: string
  techStack?: string[]
  completed_tasks?: number
  total_tasks?: number
  start_date?: string
  due_date?: string
  completed_date?: string
  github_repo_url?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

/**
 * ProjectSummary - Used by dashboard UI components for project cards
 * Uses camelCase field names for frontend consistency
 */
export interface ProjectSummary {
  id: string
  name: string
  description?: string
  status: "planning" | "in_progress" | "review" | "completed" | "on_hold"
  phase?: string
  progress: number
  techStack?: string[]
  startDate?: Date
  lastActivity?: Date
  totalTasks: number
  completedTasks: number
  activeAgents: number
  health: "excellent" | "good" | "attention" | "critical"
}

export interface ProjectStep {
  id: string
  project_id: string
  title: string
  description: string
  status: "pending" | "in-progress" | "completed" | "blocked"
  progress: number
  phase: string
  stage: string
  estimated_hours: number
  actual_hours: number
  order_index: number
  assigned_agent?: string
  tasks?: any[]
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface ProjectPhase {
  id: string
  project_id: string
  phase_name: string
  status: "active" | "completed" | "skipped"
  description?: string
  started_at: string
  completed_at?: string
  completed_by?: string
  exit_criteria?: any[]
  deliverables?: any[]
}

export interface ArchitectureDecision {
  id: string
  project_id: string
  title: string
  status: "proposed" | "accepted" | "rejected" | "superseded" | "deprecated"
  context: string
  decision: string
  consequences?: string
  alternatives?: any[]
  tags?: string[]
  decided_by?: string
  decided_at?: string
  supersedes_adr_id?: string
  superseded_by_adr_id?: string
  created_at: string
  updated_at: string
}

export interface Agent {
  id: string
  name: "v0" | "claude" | "gemini" | "gpt"
  status: "active" | "idle" | "working" | "error"
  current_task_id?: string
  last_active_at: string
  capabilities?: Record<string, any>
  metadata?: Record<string, any>
}

export interface Document {
  id: string
  project_id?: string
  title: string
  description?: string
  category: string
  file_type: string
  file_size: number
  s3_key: string
  metadata?: Record<string, any>
  created_at: string
  updated_at?: string
  deleted_at?: string
}

// Legacy types to keep for now if used by UI components
export interface Activity {
  icon: string
  message: string
  timestamp: string
}

export interface QuickAction {
  icon: string
  label: string
  route: string
  variant?: "default" | "primary"
}

export interface Task {
  id: string
  name: string
  description: string
  agent: string
  status: "pending" | "in-progress" | "completed" | "blocked" | "review"
  estimatedTime: string
  actualTime: string
  dependencies: string[]
}

export interface GanttTask {
  id: string
  name: string
  agent: any
  startDate: Date
  endDate: Date
  progress: number
  dependencies: string[]
  phase: number | string
  status: "pending" | "in_progress" | "completed" | "blocked"
}

export interface KanbanTask {
  id: string
  title: string
  description: string
  status: "backlog" | "in_progress" | "review" | "complete"
  priority: "low" | "medium" | "high"
  agent: string
  phase: string
  assignee?: {
    name: string
    avatar: string
  }
  dueDate?: string
  tags?: string[]
}

// Raw project_steps row as served by GET /api/projects/[id]/steps.
// Statuses/priorities mirror the DB CHECK constraints — no UI-side remapping.
export type StepStatus = "pending" | "in-progress" | "completed" | "blocked" | "paused" | "failed"
export type StepPriority = "low" | "medium" | "high"
export type AgentName = "v0" | "claude" | "gemini" | "gpt"

export interface BoardStep {
  id: string
  project_id: string
  title: string
  description: string | null
  status: StepStatus
  progress: number
  phase: string | null
  stage: string | null
  estimated_hours: number | string | null
  actual_hours: number | string | null
  order_index: number
  priority: StepPriority | null
  assigned_agent: AgentName | null
  start_date: string | null
  end_date: string | null
  parent_task_id: string | null
  is_subtask: boolean
  tasks: Array<string | { title: string; done?: boolean }>
  acceptance_criteria: Array<{ description: string; testCommand?: string; done?: boolean }>
  dependencies: Array<{ depends_on_step_id: string; dependency_type: "hard" | "soft" }>
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Phase {
  id: string
  name: string
  progress: number
  status: "pending" | "in-progress" | "completed"
  tasks: Task[]
  subtasks: any[]
}

export interface DocItem {
  id: string
  name: string
  icon: string
  type: "markdown" | "pdf" | "image"
  content: string
  lastUpdated?: string
  updatedBy?: string
}

export interface DocSection {
  id: string
  name: string
  icon: string
  expanded: boolean
  items: DocItem[]
}

/**
 * FlowNodeData - Data structure for React Flow nodes
 * Used by TaskNode and PhaseNode components
 */
export interface FlowNodeData {
  label: string
  description?: string
  status?: "completed" | "in_progress" | "pending" | "paused" | "failed"
  priority?: "low" | "medium" | "high"
  agent?: {
    name: string
    color?: string
  }
  estimatedTime?: string
  type?: "task" | "phase"
  // Phase-specific fields
  phase?: number
  progress?: number
  taskCount?: number
  completedCount?: number
}

/**
 * FlowEdgeData - Data structure for React Flow edges
 */
export interface FlowEdgeData {
  type?: "required" | "optional"
  isCriticalPath?: boolean
}

// ============================================================================
// Todo Types (Frontend)
// ============================================================================

export type TodoStatus = "pending" | "in_progress" | "completed"
export type TodoPriority = "low" | "medium" | "high" | "urgent"

export interface Todo {
  id: string
  userId: string
  projectId: string | null
  ideaId: string | null
  transactionId: string | null
  title: string
  description: string | null
  status: TodoStatus
  priority: TodoPriority
  dueDate: string | null
  completedAt: string | null
  orderIndex: number
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
  project?: {
    id: string
    name: string
  } | null
  idea?: {
    id: string
    title: string
  } | null
  transaction?: {
    id: string
    description: string
    amount: number
  } | null
}

export interface TodoFilters {
  view: "today" | "upcoming" | "overdue" | "all" | "completed"
  priority?: TodoPriority
  status?: TodoStatus
  projectId?: string
  ideaId?: string
  transactionId?: string
  unlinked?: boolean
  search?: string
}

// ============================================================================
// Finance Types (Frontend) - Added by JARVIS-Finance
// ============================================================================

export type AccountType = "checking" | "savings" | "credit_card" | "investment" | "cash" | "loan" | "other"
export type TransactionType = "income" | "expense" | "transfer"
export type BudgetPeriod = "weekly" | "monthly" | "quarterly" | "yearly"
export type IncomeSourceType = "salary" | "freelance" | "investment" | "rental" | "business" | "gift" | "other"
export type RecurringFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly"

export interface FinanceAccount {
  id: string
  userId: string
  name: string
  accountType: AccountType
  institution: string | null
  accountNumberLast4: string | null
  currency: string
  currentBalance: number
  availableBalance: number | null
  creditLimit: number | null
  interestRate: number | null
  loanPrincipal: number | null
  loanTermMonths: number | null
  isActive: boolean
  isPrimary: boolean
  color: string | null
  icon: string | null
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface FinanceCategory {
  id: string
  userId: string | null
  name: string
  parentId: string | null
  isIncome: boolean
  icon: string | null
  color: string | null
  isSystem: boolean
  orderIndex: number
  createdAt: string
  updatedAt: string
  subcategories?: FinanceCategory[]
}

export interface FinanceTransaction {
  id: string
  userId: string
  accountId: string
  accountName?: string
  transactionType: TransactionType
  amount: number
  currency: string
  categoryId: string | null
  categoryName?: string
  categoryIcon?: string
  categoryColor?: string
  description: string | null
  merchant: string | null
  notes: string | null
  transactionDate: string
  postedDate: string | null
  transferToAccountId: string | null
  transferPairId: string | null
  isRecurring: boolean
  recurringId: string | null
  tags: string[]
  externalId: string | null
  locationName: string | null
  locationLat: number | null
  locationLng: number | null
  receiptBlobKey: string | null
  isPending: boolean
  isReconciled: boolean
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface FinanceBudget {
  id: string
  userId: string
  name: string
  categoryId: string | null
  categoryName?: string
  categoryIcon?: string
  categoryColor?: string
  amount: number
  currency: string
  period: BudgetPeriod
  startDate: string | null
  endDate: string | null
  alertThreshold: number
  alertEnabled: boolean
  rolloverEnabled: boolean
  rolloverAmount: number
  isActive: boolean
  color: string | null
  icon: string | null
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
  // Computed
  spent?: number
  remaining?: number
  percentUsed?: number
}

export interface FinanceIncomeStream {
  id: string
  userId: string
  name: string
  sourceType: IncomeSourceType
  amount: number
  currency: string
  frequency: RecurringFrequency
  nextPaymentDate: string | null
  accountId: string | null
  sourceName: string | null
  isTaxable: boolean
  taxCategory: string | null
  isActive: boolean
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface FinanceGoal {
  id: string
  userId: string
  name: string
  description: string | null
  goalType: string
  targetAmount: number
  currency: string
  currentAmount: number
  targetDate: string | null
  startedAt: string
  accountId: string | null
  autoContribute: boolean
  contributeAmount: number | null
  contributeFrequency: RecurringFrequency | null
  priority: number
  isActive: boolean
  isCompleted: boolean
  completedAt: string | null
  color: string | null
  icon: string | null
  imageBlobKey: string | null
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface FinanceSummary {
  period: string
  netWorth: {
    total: number
    change: number
    changePercent: number
    assets: number
    liabilities: number
    accountCount: number
  }
  income: {
    total: number
  }
  expenses: {
    total: number
  }
  cashFlow: {
    income: number
    expenses: number
    net: number
    transactionCount: number
  }
  categorySpending: Array<{
    category: string
    icon: string | null
    color: string | null
    amount: number
    count: number
  }>
  budgets: {
    total: number
    overBudget: number
    nearLimit: number
    totalBudgeted: number
    totalSpent: number
  }
  upcomingBills: Array<{
    id: string
    description: string
    amount: number
    dueDate: string
    category: string | null
    icon: string | null
  }>
  monthlyIncome: number
  incomeStreamCount: number
  goals: {
    total: number
    completed: number
    totalTarget: number
    totalSaved: number
    avgProgress: number
  }
}

// ============================================================================
// Ideas Canvas Types (Frontend) - Added by JARVIS-UI
// ============================================================================

export type IdeaLifecycle = "seed" | "exploring" | "refined" | "promoted" | "archived"
export type IdeaVisibility = "private" | "shared" | "public"
export type FacetType =
  | "pros_cons"
  | "timeline"
  | "market_research"
  | "technical_specs"
  | "financials"
  | "dependencies"
  | "risks"
  | "alternatives"
  | "custom"

export type ValidationAgentType = "business" | "technical" | "product" | "custom"
export type ValidationStatus = "active" | "completed" | "paused" | "cancelled"

export interface Idea {
  id: string
  userId: string
  title: string
  description: string | null
  category: string | null
  tags: string[]
  lifecycle: IdeaLifecycle
  promotedToProjectId: string | null
  promotedAt: string | null
  visibility: IdeaVisibility
  canvasSettings: Record<string, any>
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  // Additional joined data
  projectName?: string | null
  facetCount?: number
  branchCount?: number
  validationCount?: number
}

export interface IdeaBranch {
  id: string
  ideaId: string
  name: string
  parentBranchId: string | null
  isActive: boolean
  isMain: boolean
  snapshot: Record<string, any>
  createdBy: string | null
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  mergedIntoBranchId: string | null
}

export interface IdeaFacet {
  id: string
  ideaId: string
  branchId: string | null
  facetType: FacetType
  name: string | null
  data: Record<string, any>
  positionX: number
  positionY: number
  orderIndex: number
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface IdeaValidation {
  id: string
  ideaId: string
  agentType: ValidationAgentType
  status: ValidationStatus
  messages: Array<{ role: "user" | "assistant"; content: string; timestamp: string }>
  currentFacetId: string | null
  validatedFacetIds: string[]
  validationScore: number | null
  blockers: string[]
  recommendations: string[]
  agentConfig: Record<string, any>
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface IdeaWithDetails extends Idea {
  branches?: IdeaBranch[]
  facets?: IdeaFacet[]
  validations?: IdeaValidation[]
  promotedProject?: { id: string; name: string } | null
}

export interface IdeaFilters {
  lifecycle?: IdeaLifecycle
  category?: string
  search?: string
  visibility?: IdeaVisibility
  includeArchived?: boolean
}

export interface IdeaLifecycleCounts {
  seed: number
  exploring: number
  refined: number
  promoted: number
  archived: number
}

// ============================================================================
// Memory (MLP - Model Ledger Protocol) Types (Frontend) - Added by JARVIS-UI
// ============================================================================

export type DecisionStatus = "active" | "resolved" | "revisit" | "deprecated"
export type StabilityLevel = "stable" | "evolving" | "experimental"
export type CollaboratorType = "human" | "ai" | "team" | "service"
export type MilestoneStatus = "pending" | "achieved" | "missed" | "cancelled"

export interface MemoryOverview {
  where: {
    structures: number
    description: string
  }
  what: {
    modules: number
    description: string
  }
  how: {
    implementations: number
    description: string
  }
  why: {
    decisions: {
      total: number
      active: number
      resolved: number
      revisit: number
    }
    description: string
  }
  who: {
    collaborators: number
    description: string
  }
  when: {
    events: number
    milestones: {
      total: number
      pending: number
      achieved: number
    }
    description: string
  }
  settings: MemoryCompressionSettings | null
}

export interface MemoryCompressionSettings {
  id: string
  userId: string
  whereCompression: number
  whatCompression: number
  howCompression: number
  whyCompression: number
  whoCompression: number
  whenCompression: number
  maxTokensPerRequest: number
  autoCompress: boolean
  retentionDecisions: number
  retentionLessons: number
  retentionActivity: number
  retentionConversations: number
  createdAt: string
  updatedAt: string
}

export interface WhyDecision {
  id: string
  userId: string
  projectId: string | null
  ideaId: string | null
  title: string
  status: DecisionStatus
  summary: string | null
  tags: string[]
  domains: string[]
  stakeholders: string[]
  businessDrivers: string[]
  technicalConstraints: string[]
  futureConsiderations: string[]
  compressionLevel: number
  createdAt: string
  updatedAt: string
  // Joined data
  projectName?: string | null
  ideaTitle?: string | null
  nodeCount?: number
  attemptCount?: number
}

export interface WhoCollaborator {
  id: string
  userId: string
  name: string
  collaboratorType: CollaboratorType
  linkedUserId: string | null
  expertise: string[]
  contactInfo: Record<string, any>
  notes: string | null
  createdAt: string
  updatedAt: string
  contributionCount?: number
}

export interface WhenMilestone {
  id: string
  userId: string
  projectId: string | null
  ideaId: string | null
  title: string
  description: string | null
  milestoneType: string
  status: MilestoneStatus
  targetDate: string | null
  achievedDate: string | null
  impact: string | null
  deliverables: Array<{ deliverable: string; completed: boolean; link?: string }>
  createdAt: string
  updatedAt: string
  projectName?: string | null
  ideaTitle?: string | null
}

// ============================================================================
// Calendar Types (Frontend) - Added by JARVIS-Finance
// ============================================================================

export type EventSource = "manual" | "todo" | "project" | "travel" | "external" | "finance" | "idea"
export type RecurrenceFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom"
export type EventStatus = "confirmed" | "tentative" | "cancelled"
export type AttendeeStatus = "accepted" | "declined" | "tentative" | "pending"
export type ReminderType = "email" | "notification" | "sms"

export interface CalendarAttendee {
  email: string
  name?: string
  status: AttendeeStatus
  isOrganizer?: boolean
}

export interface CalendarReminder {
  type: ReminderType
  minutes: number
}

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval?: number
  until?: string
  count?: number
  byDay?: string[]  // ["MO", "TU", "WE", etc.]
  byMonth?: number[]
  byMonthDay?: number[]
}

export interface CalendarEvent {
  id: string
  userId: string
  title: string
  description: string | null
  startTime: string
  endTime: string | null
  isAllDay: boolean
  timezone: string
  source: EventSource
  sourceId: string | null
  sourceMetadata: Record<string, any>
  isRecurring: boolean
  recurrenceRule: RecurrenceRule | null
  recurrenceParentId: string | null
  recurrenceIndex: number | null
  locationName: string | null
  locationAddress: string | null
  locationLat: number | null
  locationLng: number | null
  locationUrl: string | null
  attendees: CalendarAttendee[]
  reminders: CalendarReminder[]
  color: string | null
  icon: string | null
  status: EventStatus
  isPrivate: boolean
  externalId: string | null
  externalCalendar: string | null
  categoryId: string | null
  categoryName?: string | null
  tags: string[]
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface CalendarCategory {
  id: string
  userId: string
  name: string
  color: string | null
  icon: string | null
  isVisible: boolean
  isDefault: boolean
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export interface CalendarAgendaItem {
  id: string
  type: "event" | "todo" | "milestone" | "bill"
  title: string
  description: string | null
  startTime: string
  endTime: string | null
  isAllDay: boolean
  source: EventSource
  sourceId: string | null
  color: string | null
  icon: string | null
  status: string
  metadata: Record<string, any>
}

export interface CalendarFilters {
  startDate?: string
  endDate?: string
  source?: EventSource
  categoryId?: string
  includeRecurring?: boolean
  search?: string
}

// ============================================================================
// Ideas Canvas Extended Types (for idea-incubator integration)
// ============================================================================

export type IdeaState = "seed" | "exploring" | "refined" | "promoted" | "archived"
export type TransformationType = "evolved-into" | "branched-as" | "merged-with" | "spawned"
export type RefinementType = "barrier-found" | "new-approach" | "pivot-needed" | "enhancement" | "feedback"
export type RefinementStatus = "open" | "accepted" | "rejected" | "merged"
export type CanvasNodeType = "ideaNode" | "facetNode" | "validationNode" | "contentNode"
export type ContentType = "text" | "image" | "video" | "audio" | "link" | "diagram" | "document" | "table"
export type SessionStatus = "active" | "completed" | "paused" | "cancelled"

export interface IdeaWithStats extends Idea {
  idea_state?: IdeaState
  core_content?: string | null
  origin_idea_id?: string | null
  transformed_from?: string | null
  current_type?: string | null
  archived_reason?: string | null
  branches?: IdeaBranch[]
  facets?: IdeaFacet[]
  nodes?: number
  branches_count?: number
  perspectives?: number
  scenarios?: number
  linked_ideas?: number
  categories?: string[]
  created_at?: string
  updated_at?: string
}

export interface IdeaTransformation {
  id: string
  fromIdeaId: string | null
  toIdeaId: string
  transformationType: TransformationType
  notes: string | null
  createdAt: string
}

export interface IdeaRelationship {
  id: string
  fromIdeaId: string
  toIdeaId: string
  relationshipType: string
  metadata: Record<string, any> | null
  createdAt: string
}

export interface IdeaNote {
  id: string
  ideaId: string
  branchId: string | null
  facetId: string | null
  perspectiveId: string | null
  title: string | null
  content: string
  noteType: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface IdeaCanvasNode {
  id: string
  ideaId: string
  branchId: string | null
  nodeType: CanvasNodeType
  positionX: number
  positionY: number
  width: number | null
  height: number | null
  zIndex: number
  data: Record<string, any>
  layerId: string | null
  perspectiveId: string | null
  scenarioId: string | null
  createdAt: string
  updatedAt: string
}

export interface IdeaCanvasEdge {
  id: string
  ideaId: string
  branchId: string | null
  sourceNodeId: string
  targetNodeId: string
  edgeType: string
  label: string | null
  data: Record<string, any>
  createdAt: string
}

export interface IdeaCanvasLayer {
  id: string
  ideaId: string
  name: string
  description: string | null
  orderIndex: number
  isVisible: boolean
  opacity: number
  color: string | null
  createdAt: string
}

export interface IdeaPerspective {
  id: string
  ideaId: string
  name: string
  description: string | null
  owner: string | null
  ownerType: string
  createdAt: string
  updatedAt: string
}

export interface IdeaScenario {
  id: string
  perspectiveId: string
  name: string
  description: string | null
  assumptions: Record<string, any>
  isBaseline: boolean
  createdAt: string
  updatedAt: string
}

export interface IdeaRefinement {
  id: string
  ideaId: string
  facetId: string | null
  validationId: string | null
  refinementType: RefinementType
  status: RefinementStatus
  title: string
  content: string
  suggestedChanges: Record<string, any>
  createdBy: string | null
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
}

export interface IdeaDocument {
  id: string
  ideaId: string
  branchId: string | null
  title: string
  documentType: string
  content: string
  templateUsed: string | null
  generatedBy: string | null
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface IdeaCanvasSnapshot {
  id: string
  ideaId: string
  branchId: string | null
  name: string
  description: string | null
  snapshotData: Record<string, any>
  createdBy: string | null
  createdAt: string
}

export interface CanvasStats {
  totalNodes: number
  nodesByType: {
    ideas: number
    facets: number
    validations: number
    content: number
  }
  totalConnections: number
  linkedIdeas: number
  activeLayers: number
  totalBranches: number
  totalPerspectives: number
  totalScenarios: number
  perspectiveDetails: Array<{
    name: string
    owner?: string
    scenarioCount: number
  }>
}

export interface ViewSettings {
  showBranches: boolean
  showPerspectives: boolean
  showScenarios: boolean
  showLayers: boolean
  showMinimap: boolean
  showControls: boolean
  showContextNotes: boolean
}
