export type ProjectStatus = "active" | "on-hold" | "completed" | "planning"
export type IdeaStatus = "raw" | "refined" | "promoted"

export interface Business {
  id: string
  name: string
  tagline: string
  arr: number
  health: number
  projects: number
}

export interface Project {
  id: string
  name: string
  business: string
  status: ProjectStatus
  progress: number
  dueDate: string
  budget: number
  spent: number
  phase: string
  momentum: number[]
}

export interface TodoItem {
  id: string
  title: string
  done: boolean
  priority: "high" | "medium" | "low"
  project?: string
}

export interface Activity {
  id: string
  type: "commit" | "deploy" | "task" | "note" | "idea"
  message: string
  project: string
  time: string
}

export interface AgentJob {
  id: string
  name: string
  status: "running" | "completed" | "failed" | "queued"
  project: string
  started: string
  duration: string
}

export const BUSINESSES: Business[] = [
  { id: "b1", name: "StackDive LMS", tagline: "AI-first learning platform", arr: 42000, health: 82, projects: 3 },
  { id: "b2", name: "OpEx Studio", tagline: "Operational excellence SaaS", arr: 18500, health: 71, projects: 2 },
  { id: "b3", name: "Sassy Dame", tagline: "Shopify theme & brand", arr: 9200, health: 60, projects: 2 },
]

export const PROJECTS: Project[] = [
  { id: "p1", name: "AI Course Builder", business: "StackDive LMS", status: "active", progress: 68, dueDate: "2026-06-15", budget: 12000, spent: 7800, phase: "Development", momentum: [4,6,5,8,7,9,8] },
  { id: "p2", name: "Mobile App v2", business: "StackDive LMS", status: "active", progress: 35, dueDate: "2026-08-01", budget: 18000, spent: 5200, phase: "Design", momentum: [3,4,3,5,4,6,5] },
  { id: "p3", name: "Instructor Portal", business: "StackDive LMS", status: "planning", progress: 8, dueDate: "2026-09-30", budget: 8000, spent: 600, phase: "Planning", momentum: [1,2,1,2,3,2,3] },
  { id: "p4", name: "Process Analyzer", business: "OpEx Studio", status: "active", progress: 55, dueDate: "2026-07-01", budget: 9000, spent: 4800, phase: "Development", momentum: [5,7,6,8,7,9,8] },
  { id: "p5", name: "Dashboard Revamp", business: "OpEx Studio", status: "on-hold", progress: 20, dueDate: "2026-10-01", budget: 5000, spent: 1000, phase: "On Hold", momentum: [2,2,1,2,1,2,2] },
  { id: "p6", name: "Theme v3", business: "Sassy Dame", status: "active", progress: 80, dueDate: "2026-05-30", budget: 3500, spent: 2800, phase: "Testing", momentum: [7,8,9,8,9,10,9] },
  { id: "p7", name: "Email Templates", business: "Sassy Dame", status: "completed", progress: 100, dueDate: "2026-04-15", budget: 1200, spent: 1100, phase: "Done", momentum: [8,9,10,10,10,10,10] },
]

export const TODAY_TODOS: TodoItem[] = [
  { id: "t1", title: "Review AI course builder PR #47", done: false, priority: "high", project: "AI Course Builder" },
  { id: "t2", title: "Update Stripe webhook handlers", done: false, priority: "high", project: "StackDive LMS" },
  { id: "t3", title: "Design mobile onboarding flow", done: true, priority: "medium", project: "Mobile App v2" },
  { id: "t4", title: "Write SOP for content review process", done: false, priority: "medium" },
  { id: "t5", title: "Deploy Theme v3 to staging", done: false, priority: "high", project: "Theme v3" },
  { id: "t6", title: "Update instructor earnings calculation", done: true, priority: "low", project: "Instructor Portal" },
]

export const ACTIVITY: Activity[] = [
  { id: "a1", type: "commit", message: "feat: add AI quiz generation endpoint", project: "AI Course Builder", time: "12m ago" },
  { id: "a2", type: "deploy", message: "Deploy to production (v2.4.1)", project: "StackDive LMS", time: "1h ago" },
  { id: "a3", type: "task", message: "Completed mobile wireframes review", project: "Mobile App v2", time: "2h ago" },
  { id: "a4", type: "idea", message: "Bulk export to CSV for instructors", project: "StackDive LMS", time: "3h ago" },
  { id: "a5", type: "note", message: "Theme v3 needs RTL support before launch", project: "Theme v3", time: "5h ago" },
  { id: "a6", type: "commit", message: "fix: process analyzer memory leak on reload", project: "Process Analyzer", time: "7h ago" },
]

export const AGENTS: AgentJob[] = [
  { id: "ag1", name: "Code Review Agent", status: "running", project: "AI Course Builder", started: "10m ago", duration: "~5m" },
  { id: "ag2", name: "Test Suite Runner", status: "completed", project: "Theme v3", started: "1h ago", duration: "8m" },
  { id: "ag3", name: "SEO Analyzer", status: "queued", project: "StackDive LMS", started: "—", duration: "~3m" },
]

export const GRAPH = {
  nodes: [
    { id: "b1", label: "StackDive", type: "biz", x: 20, y: 30 },
    { id: "b2", label: "OpEx", type: "biz", x: 20, y: 60 },
    { id: "b3", label: "Sassy Dame", type: "biz", x: 20, y: 85 },
    { id: "p1", label: "AI Builder", type: "proj", x: 42, y: 20 },
    { id: "p2", label: "Mobile v2", type: "proj", x: 42, y: 38 },
    { id: "p3", label: "Instructor", type: "proj", x: 42, y: 52 },
    { id: "p4", label: "Analyzer", type: "proj", x: 42, y: 65 },
    { id: "p6", label: "Theme v3", type: "proj", x: 42, y: 80 },
    { id: "i1", label: "Bulk Export", type: "idea", x: 68, y: 25 },
    { id: "i2", label: "RTL Support", type: "idea", x: 68, y: 50 },
    { id: "i3", label: "Quiz Gen", type: "idea", x: 68, y: 70 },
    { id: "f1", label: "$42K ARR", type: "finance", x: 85, y: 35 },
    { id: "f2", label: "$18.5K ARR", type: "finance", x: 85, y: 60 },
  ],
  edges: [
    { from: "b1", to: "p1" }, { from: "b1", to: "p2" }, { from: "b1", to: "p3" },
    { from: "b2", to: "p4" }, { from: "b3", to: "p6" },
    { from: "p1", to: "i1" }, { from: "p1", to: "i3" }, { from: "p6", to: "i2" },
    { from: "b1", to: "f1" }, { from: "b2", to: "f2" },
  ],
}
