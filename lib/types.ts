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
