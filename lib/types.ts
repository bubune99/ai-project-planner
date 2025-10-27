export interface Project {
  name: string
  status: "planning" | "in_progress" | "review" | "completed"
  phase: string
  progress: number
  techStack: string[]
}

export interface Agent {
  name: "v0" | "claude" | "gemini" | "gpt"
  status: "active" | "idle" | "working" | "error"
  currentTask?: string
}

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
  agent: "v0" | "claude" | "gemini" | "gpt"
  status: "completed" | "in_progress" | "pending" | "paused" | "failed"
  estimatedTime: string
  actualTime?: string
  dependencies: string[]
  attachedDocs?: string[]
}

export interface Phase {
  id: string
  name: string
  progress: number
  status: "completed" | "in_progress" | "pending"
  tasks: Task[]
  subtasks?: Phase[]
}

export interface GanttTask {
  id: string
  name: string
  agent: Agent
  startDate: Date
  endDate: Date
  progress: number
  dependencies: string[]
  phase: number
  status: "completed" | "in_progress" | "pending" | "paused" | "failed"
}

export interface KanbanTask {
  id: string
  title: string
  description: string
  agent: "v0" | "claude" | "gemini" | "gpt"
  priority: "high" | "medium" | "low"
  status: "backlog" | "in_progress" | "review" | "complete"
  phase: string
  estimate: string
  attachedDocs: number
  subtasks?: { id: string; title: string; done: boolean }[]
}

export interface FlowNodeData {
  label: string
  type: "phase" | "task"
  phase?: number
  progress?: number
  taskCount?: number
  agent?: Agent
  status?: "completed" | "in_progress" | "pending" | "paused" | "failed"
  task?: Task
}

export interface FlowEdgeData {
  type: "required" | "optional"
  isCriticalPath: boolean
}

export interface Document {
  id: string
  name: string
  type: "markdown" | "word" | "figma" | "pdf" | "image"
  tags: string[]
  linkedTasks: string[]
  lastModified: Date
  content?: string
  url?: string
}

export interface DocItem {
  id: string
  name: string
  icon: string
  content?: string
  type: "markdown" | "notebook" | "api"
}

export interface DocSection {
  id: string
  name: string
  icon: string
  items: DocItem[]
  expanded?: boolean
}
