import type { Project, Agent, Activity, QuickAction, Phase, GanttTask, KanbanTask, Document, DocSection, ProjectSummary } from "./types"
import type { Node, Edge } from "@xyflow/react"
import type { FlowNodeData, FlowEdgeData } from "./types"

export const mockProject: Project = {
  name: "E-commerce Platform",
  status: "in_progress",
  phase: "Phase 2 of 4: Core Features",
  progress: 65,
  techStack: ["Next.js", "PostgreSQL", "Stripe", "Tailwind"],
}

export const mockAgents: Agent[] = [
  {
    name: "v0",
    status: "active",
    currentTask: "Building Product UI",
  },
  {
    name: "claude",
    status: "idle",
  },
  {
    name: "gemini",
    status: "idle",
  },
  {
    name: "gpt",
    status: "active",
    currentTask: "Orchestrating",
  },
]

export const mockActivities: Activity[] = [
  {
    icon: "✅",
    message: "Setup complete",
    timestamp: "2 min ago",
  },
  {
    icon: "🔄",
    message: "Database migrations running...",
    timestamp: "5 min ago",
  },
  {
    icon: "📝",
    message: "Architecture document updated",
    timestamp: "15 min ago",
  },
]

export const quickActions: QuickAction[] = [
  { icon: "📅", label: "View Timeline", route: "/gantt" },
  { icon: "🌳", label: "Task Tree", route: "/tree" },
  { icon: "📋", label: "Kanban Board", route: "/kanban" },
  { icon: "🔀", label: "Dependencies", route: "/flow" },
  { icon: "📄", label: "Documents", route: "/docs" },
  { icon: "▶", label: "Begin All", route: "/start", variant: "primary" },
]

export const mockTreeData: Phase[] = [
  {
    id: "phase-1",
    name: "Phase 1: Foundation",
    progress: 100,
    status: "completed",
    tasks: [],
    subtasks: [
      {
        id: "phase-1-1",
        name: "1.1 Project Setup",
        progress: 100,
        status: "completed",
        tasks: [
          {
            id: "task-1-1-1",
            name: "Initialize Next.js",
            description: "Set up Next.js 14 with App Router",
            agent: "gpt",
            status: "completed",
            estimatedTime: "10 min",
            actualTime: "8 min",
            dependencies: [],
          },
          {
            id: "task-1-1-2",
            name: "Configure TypeScript",
            description: "Setup TypeScript with strict mode",
            agent: "gpt",
            status: "completed",
            estimatedTime: "5 min",
            actualTime: "5 min",
            dependencies: ["task-1-1-1"],
          },
          {
            id: "task-1-1-3",
            name: "Setup Tailwind + shadcn/ui",
            description: "Install and configure UI framework",
            agent: "v0",
            status: "completed",
            estimatedTime: "15 min",
            actualTime: "12 min",
            dependencies: ["task-1-1-2"],
          },
        ],
      },
      {
        id: "phase-1-2",
        name: "1.2 Database Design",
        progress: 100,
        status: "completed",
        tasks: [
          {
            id: "task-1-2-1",
            name: "Create schema diagrams",
            description: "Design database schema and relationships",
            agent: "claude",
            status: "completed",
            estimatedTime: "30 min",
            actualTime: "35 min",
            dependencies: [],
          },
          {
            id: "task-1-2-2",
            name: "Write migrations",
            description: "Create SQL migration files",
            agent: "claude",
            status: "completed",
            estimatedTime: "45 min",
            actualTime: "40 min",
            dependencies: ["task-1-2-1"],
          },
          {
            id: "task-1-2-3",
            name: "Seed test data",
            description: "Generate sample data for testing",
            agent: "gpt",
            status: "completed",
            estimatedTime: "20 min",
            actualTime: "18 min",
            dependencies: ["task-1-2-2"],
          },
        ],
      },
      {
        id: "phase-1-3",
        name: "1.3 Authentication",
        progress: 100,
        status: "completed",
        tasks: [
          {
            id: "task-1-3-1",
            name: "Setup Supabase Auth",
            description: "Configure authentication provider",
            agent: "claude",
            status: "completed",
            estimatedTime: "30 min",
            actualTime: "28 min",
            dependencies: [],
          },
          {
            id: "task-1-3-2",
            name: "Create login UI",
            description: "Build login and signup forms",
            agent: "v0",
            status: "completed",
            estimatedTime: "25 min",
            actualTime: "22 min",
            dependencies: ["task-1-3-1"],
          },
          {
            id: "task-1-3-3",
            name: "Implement sessions",
            description: "Handle user sessions and tokens",
            agent: "gpt",
            status: "completed",
            estimatedTime: "20 min",
            actualTime: "25 min",
            dependencies: ["task-1-3-2"],
          },
        ],
      },
    ],
  },
  {
    id: "phase-2",
    name: "Phase 2: Core Features",
    progress: 65,
    status: "in_progress",
    tasks: [],
    subtasks: [
      {
        id: "phase-2-1",
        name: "2.1 Product Management",
        progress: 66,
        status: "in_progress",
        tasks: [
          {
            id: "task-2-1-1",
            name: "Product API",
            description: "Create REST API for products",
            agent: "claude",
            status: "completed",
            estimatedTime: "45 min",
            actualTime: "50 min",
            dependencies: [],
          },
          {
            id: "task-2-1-2",
            name: "Product UI",
            description: "Build product listing and detail pages",
            agent: "v0",
            status: "in_progress",
            estimatedTime: "60 min",
            dependencies: ["task-2-1-1"],
            attachedDocs: ["Product wireframes", "Design system"],
          },
          {
            id: "task-2-1-3",
            name: "Product tests",
            description: "Write unit and integration tests",
            agent: "gpt",
            status: "pending",
            estimatedTime: "30 min",
            dependencies: ["task-2-1-2"],
          },
        ],
      },
      {
        id: "phase-2-2",
        name: "2.2 Shopping Cart",
        progress: 0,
        status: "pending",
        tasks: [
          {
            id: "task-2-2-1",
            name: "Cart state management",
            description: "Implement cart logic with Zustand",
            agent: "gpt",
            status: "pending",
            estimatedTime: "40 min",
            dependencies: ["task-2-1-2"],
          },
          {
            id: "task-2-2-2",
            name: "Cart UI components",
            description: "Build cart drawer and item list",
            agent: "v0",
            status: "pending",
            estimatedTime: "50 min",
            dependencies: ["task-2-2-1"],
          },
        ],
      },
      {
        id: "phase-2-3",
        name: "2.3 Checkout Flow",
        progress: 0,
        status: "pending",
        tasks: [
          {
            id: "task-2-3-1",
            name: "Stripe integration",
            description: "Setup payment processing",
            agent: "claude",
            status: "pending",
            estimatedTime: "60 min",
            dependencies: ["task-2-2-2"],
          },
          {
            id: "task-2-3-2",
            name: "Checkout UI",
            description: "Build checkout form and confirmation",
            agent: "v0",
            status: "pending",
            estimatedTime: "45 min",
            dependencies: ["task-2-3-1"],
          },
        ],
      },
    ],
  },
  {
    id: "phase-3",
    name: "Phase 3: Advanced Features",
    progress: 0,
    status: "pending",
    tasks: [],
    subtasks: [
      {
        id: "phase-3-1",
        name: "3.1 Search & Filters",
        progress: 0,
        status: "pending",
        tasks: [
          {
            id: "task-3-1-1",
            name: "Search implementation",
            description: "Add full-text search",
            agent: "claude",
            status: "pending",
            estimatedTime: "50 min",
            dependencies: ["task-2-1-3"],
          },
        ],
      },
    ],
  },
  {
    id: "phase-4",
    name: "Phase 4: Testing & Deployment",
    progress: 0,
    status: "pending",
    tasks: [],
    subtasks: [
      {
        id: "phase-4-1",
        name: "4.1 Testing",
        progress: 0,
        status: "pending",
        tasks: [
          {
            id: "task-4-1-1",
            name: "E2E tests",
            description: "Write Playwright tests",
            agent: "gpt",
            status: "pending",
            estimatedTime: "90 min",
            dependencies: [],
          },
        ],
      },
    ],
  },
]

export const mockGanttTasks: GanttTask[] = [
  // Phase 1 tasks
  {
    id: "task-1-1-1",
    name: "Initialize Next.js",
    agent: mockAgents[3], // gpt
    startDate: new Date("2025-01-02"),
    endDate: new Date("2025-01-02"),
    progress: 100,
    dependencies: [],
    phase: 1,
    status: "completed",
  },
  {
    id: "task-1-1-2",
    name: "Configure TypeScript",
    agent: mockAgents[3],
    startDate: new Date("2025-01-03"),
    endDate: new Date("2025-01-03"),
    progress: 100,
    dependencies: ["task-1-1-1"],
    phase: 1,
    status: "completed",
  },
  {
    id: "task-1-1-3",
    name: "Setup Tailwind + shadcn/ui",
    agent: mockAgents[0], // v0
    startDate: new Date("2025-01-04"),
    endDate: new Date("2025-01-05"),
    progress: 100,
    dependencies: ["task-1-1-2"],
    phase: 1,
    status: "completed",
  },
  {
    id: "task-1-2-1",
    name: "Create schema diagrams",
    agent: mockAgents[1], // claude
    startDate: new Date("2025-01-06"),
    endDate: new Date("2025-01-08"),
    progress: 100,
    dependencies: [],
    phase: 1,
    status: "completed",
  },
  {
    id: "task-1-2-2",
    name: "Write migrations",
    agent: mockAgents[1],
    startDate: new Date("2025-01-09"),
    endDate: new Date("2025-01-11"),
    progress: 100,
    dependencies: ["task-1-2-1"],
    phase: 1,
    status: "completed",
  },
  {
    id: "task-1-2-3",
    name: "Seed test data",
    agent: mockAgents[3],
    startDate: new Date("2025-01-12"),
    endDate: new Date("2025-01-13"),
    progress: 100,
    dependencies: ["task-1-2-2"],
    phase: 1,
    status: "completed",
  },
  {
    id: "task-1-3-1",
    name: "Setup Supabase Auth",
    agent: mockAgents[1],
    startDate: new Date("2025-01-14"),
    endDate: new Date("2025-01-16"),
    progress: 100,
    dependencies: [],
    phase: 1,
    status: "completed",
  },
  {
    id: "task-1-3-2",
    name: "Create login UI",
    agent: mockAgents[0],
    startDate: new Date("2025-01-17"),
    endDate: new Date("2025-01-18"),
    progress: 100,
    dependencies: ["task-1-3-1"],
    phase: 1,
    status: "completed",
  },
  {
    id: "task-1-3-3",
    name: "Implement sessions",
    agent: mockAgents[3],
    startDate: new Date("2025-01-19"),
    endDate: new Date("2025-01-20"),
    progress: 100,
    dependencies: ["task-1-3-2"],
    phase: 1,
    status: "completed",
  },
  // Phase 2 tasks
  {
    id: "task-2-1-1",
    name: "Product API",
    agent: mockAgents[1],
    startDate: new Date("2025-01-21"),
    endDate: new Date("2025-01-24"),
    progress: 100,
    dependencies: [],
    phase: 2,
    status: "completed",
  },
  {
    id: "task-2-1-2",
    name: "Product UI",
    agent: mockAgents[0],
    startDate: new Date("2025-01-25"),
    endDate: new Date("2025-01-29"),
    progress: 70,
    dependencies: ["task-2-1-1"],
    phase: 2,
    status: "in_progress",
  },
  {
    id: "task-2-1-3",
    name: "Product tests",
    agent: mockAgents[3],
    startDate: new Date("2025-01-30"),
    endDate: new Date("2025-02-01"),
    progress: 0,
    dependencies: ["task-2-1-2"],
    phase: 2,
    status: "pending",
  },
  {
    id: "task-2-2-1",
    name: "Cart state management",
    agent: mockAgents[3],
    startDate: new Date("2025-02-02"),
    endDate: new Date("2025-02-05"),
    progress: 0,
    dependencies: ["task-2-1-2"],
    phase: 2,
    status: "pending",
  },
  {
    id: "task-2-2-2",
    name: "Cart UI components",
    agent: mockAgents[0],
    startDate: new Date("2025-02-06"),
    endDate: new Date("2025-02-09"),
    progress: 0,
    dependencies: ["task-2-2-1"],
    phase: 2,
    status: "pending",
  },
  {
    id: "task-2-3-1",
    name: "Stripe integration",
    agent: mockAgents[1],
    startDate: new Date("2025-02-10"),
    endDate: new Date("2025-02-14"),
    progress: 0,
    dependencies: ["task-2-2-2"],
    phase: 2,
    status: "pending",
  },
  {
    id: "task-2-3-2",
    name: "Checkout UI",
    agent: mockAgents[0],
    startDate: new Date("2025-02-15"),
    endDate: new Date("2025-02-18"),
    progress: 0,
    dependencies: ["task-2-3-1"],
    phase: 2,
    status: "pending",
  },
  // Phase 3 tasks
  {
    id: "task-3-1-1",
    name: "Search implementation",
    agent: mockAgents[1],
    startDate: new Date("2025-02-19"),
    endDate: new Date("2025-02-23"),
    progress: 0,
    dependencies: ["task-2-1-3"],
    phase: 3,
    status: "pending",
  },
  {
    id: "milestone-1",
    name: "MVP Launch",
    agent: mockAgents[3],
    startDate: new Date("2025-02-24"),
    endDate: new Date("2025-02-24"),
    progress: 0,
    dependencies: ["task-2-3-2"],
    phase: 3,
    status: "pending",
  },
  // Phase 4 tasks
  {
    id: "task-4-1-1",
    name: "E2E tests",
    agent: mockAgents[3],
    startDate: new Date("2025-02-25"),
    endDate: new Date("2025-03-03"),
    progress: 0,
    dependencies: [],
    phase: 4,
    status: "pending",
  },
]

export const mockKanbanTasks: KanbanTask[] = [
  // Backlog
  {
    id: "kanban-1",
    title: "Product tests",
    description: "Write unit and integration tests for product features",
    agent: "gpt",
    priority: "high",
    status: "backlog",
    phase: "Phase 2.1",
    estimate: "30 min",
    attachedDocs: 1,
    subtasks: [
      { id: "sub-1-1", title: "Unit tests", done: false },
      { id: "sub-1-2", title: "Integration tests", done: false },
      { id: "sub-1-3", title: "E2E tests", done: false },
    ],
  },
  {
    id: "kanban-2",
    title: "Cart state management",
    description: "Implement cart logic with Zustand",
    agent: "gpt",
    priority: "high",
    status: "backlog",
    phase: "Phase 2.2",
    estimate: "40 min",
    attachedDocs: 2,
  },
  {
    id: "kanban-3",
    title: "Cart UI components",
    description: "Build cart drawer and item list",
    agent: "v0",
    priority: "medium",
    status: "backlog",
    phase: "Phase 2.2",
    estimate: "50 min",
    attachedDocs: 3,
  },
  {
    id: "kanban-4",
    title: "Stripe integration",
    description: "Setup payment processing",
    agent: "claude",
    priority: "high",
    status: "backlog",
    phase: "Phase 2.3",
    estimate: "60 min",
    attachedDocs: 2,
  },
  {
    id: "kanban-5",
    title: "Checkout UI",
    description: "Build checkout form and confirmation",
    agent: "v0",
    priority: "medium",
    status: "backlog",
    phase: "Phase 2.3",
    estimate: "45 min",
    attachedDocs: 4,
  },
  {
    id: "kanban-6",
    title: "Search implementation",
    description: "Add full-text search functionality",
    agent: "claude",
    priority: "low",
    status: "backlog",
    phase: "Phase 3.1",
    estimate: "50 min",
    attachedDocs: 1,
  },
  // In Progress
  {
    id: "kanban-7",
    title: "Product UI",
    description: "Build product listing and detail pages",
    agent: "v0",
    priority: "high",
    status: "in_progress",
    phase: "Phase 2.1",
    estimate: "60 min",
    attachedDocs: 2,
    subtasks: [
      { id: "sub-7-1", title: "Product list page", done: true },
      { id: "sub-7-2", title: "Product detail page", done: true },
      { id: "sub-7-3", title: "Product filters", done: false },
    ],
  },
  {
    id: "kanban-8",
    title: "Database optimization",
    description: "Optimize queries and add indexes",
    agent: "claude",
    priority: "medium",
    status: "in_progress",
    phase: "Phase 2.1",
    estimate: "35 min",
    attachedDocs: 1,
  },
  // Review
  {
    id: "kanban-9",
    title: "Product API",
    description: "Create REST API for products",
    agent: "claude",
    priority: "high",
    status: "review",
    phase: "Phase 2.1",
    estimate: "45 min",
    attachedDocs: 3,
  },
  {
    id: "kanban-10",
    title: "Authentication flow",
    description: "Review and test auth implementation",
    agent: "gpt",
    priority: "high",
    status: "review",
    phase: "Phase 1.3",
    estimate: "25 min",
    attachedDocs: 2,
  },
  // Complete
  {
    id: "kanban-11",
    title: "Initialize Next.js",
    description: "Set up Next.js 14 with App Router",
    agent: "gpt",
    priority: "high",
    status: "complete",
    phase: "Phase 1.1",
    estimate: "10 min",
    attachedDocs: 1,
  },
  {
    id: "kanban-12",
    title: "Setup Tailwind + shadcn/ui",
    description: "Install and configure UI framework",
    agent: "v0",
    priority: "medium",
    status: "complete",
    phase: "Phase 1.1",
    estimate: "15 min",
    attachedDocs: 2,
  },
  {
    id: "kanban-13",
    title: "Create schema diagrams",
    description: "Design database schema and relationships",
    agent: "claude",
    priority: "high",
    status: "complete",
    phase: "Phase 1.2",
    estimate: "30 min",
    attachedDocs: 4,
  },
  {
    id: "kanban-14",
    title: "Setup Supabase Auth",
    description: "Configure authentication provider",
    agent: "claude",
    priority: "high",
    status: "complete",
    phase: "Phase 1.3",
    estimate: "30 min",
    attachedDocs: 3,
  },
]

export const mockFlowNodes: Node<FlowNodeData>[] = [
  // Phase 1 nodes
  {
    id: "phase-1",
    type: "phaseNode",
    position: { x: 50, y: 50 },
    data: {
      label: "Phase 1: Foundation",
      type: "phase",
      phase: 1,
      progress: 100,
      taskCount: 9,
    },
  },
  {
    id: "task-1-1-1",
    type: "taskNode",
    position: { x: 100, y: 150 },
    data: {
      label: "Initialize Next.js",
      type: "task",
      agent: mockAgents[3],
      status: "completed",
      phase: 1,
    },
  },
  {
    id: "task-1-1-2",
    type: "taskNode",
    position: { x: 300, y: 150 },
    data: {
      label: "Configure TypeScript",
      type: "task",
      agent: mockAgents[3],
      status: "completed",
      phase: 1,
    },
  },
  {
    id: "task-1-1-3",
    type: "taskNode",
    position: { x: 500, y: 150 },
    data: {
      label: "Setup Tailwind + shadcn/ui",
      type: "task",
      agent: mockAgents[0],
      status: "completed",
      phase: 1,
    },
  },
  {
    id: "task-1-2-1",
    type: "taskNode",
    position: { x: 100, y: 250 },
    data: {
      label: "Create schema diagrams",
      type: "task",
      agent: mockAgents[1],
      status: "completed",
      phase: 1,
    },
  },
  {
    id: "task-1-2-2",
    type: "taskNode",
    position: { x: 300, y: 250 },
    data: {
      label: "Write migrations",
      type: "task",
      agent: mockAgents[1],
      status: "completed",
      phase: 1,
    },
  },
  {
    id: "task-1-2-3",
    type: "taskNode",
    position: { x: 500, y: 250 },
    data: {
      label: "Seed test data",
      type: "task",
      agent: mockAgents[3],
      status: "completed",
      phase: 1,
    },
  },
  {
    id: "task-1-3-1",
    type: "taskNode",
    position: { x: 100, y: 350 },
    data: {
      label: "Setup Supabase Auth",
      type: "task",
      agent: mockAgents[1],
      status: "completed",
      phase: 1,
    },
  },
  {
    id: "task-1-3-2",
    type: "taskNode",
    position: { x: 300, y: 350 },
    data: {
      label: "Create login UI",
      type: "task",
      agent: mockAgents[0],
      status: "completed",
      phase: 1,
    },
  },
  {
    id: "task-1-3-3",
    type: "taskNode",
    position: { x: 500, y: 350 },
    data: {
      label: "Implement sessions",
      type: "task",
      agent: mockAgents[3],
      status: "completed",
      phase: 1,
    },
  },
  // Phase 2 nodes
  {
    id: "phase-2",
    type: "phaseNode",
    position: { x: 750, y: 50 },
    data: {
      label: "Phase 2: Core Features",
      type: "phase",
      phase: 2,
      progress: 65,
      taskCount: 7,
    },
  },
  {
    id: "task-2-1-1",
    type: "taskNode",
    position: { x: 800, y: 150 },
    data: {
      label: "Product API",
      type: "task",
      agent: mockAgents[1],
      status: "completed",
      phase: 2,
    },
  },
  {
    id: "task-2-1-2",
    type: "taskNode",
    position: { x: 1000, y: 150 },
    data: {
      label: "Product UI",
      type: "task",
      agent: mockAgents[0],
      status: "in_progress",
      phase: 2,
    },
  },
  {
    id: "task-2-1-3",
    type: "taskNode",
    position: { x: 1200, y: 150 },
    data: {
      label: "Product tests",
      type: "task",
      agent: mockAgents[3],
      status: "pending",
      phase: 2,
    },
  },
  {
    id: "task-2-2-1",
    type: "taskNode",
    position: { x: 1000, y: 250 },
    data: {
      label: "Cart state management",
      type: "task",
      agent: mockAgents[3],
      status: "pending",
      phase: 2,
    },
  },
  {
    id: "task-2-2-2",
    type: "taskNode",
    position: { x: 1200, y: 250 },
    data: {
      label: "Cart UI components",
      type: "task",
      agent: mockAgents[0],
      status: "pending",
      phase: 2,
    },
  },
  {
    id: "task-2-3-1",
    type: "taskNode",
    position: { x: 1400, y: 200 },
    data: {
      label: "Stripe integration",
      type: "task",
      agent: mockAgents[1],
      status: "pending",
      phase: 2,
    },
  },
  {
    id: "task-2-3-2",
    type: "taskNode",
    position: { x: 1600, y: 200 },
    data: {
      label: "Checkout UI",
      type: "task",
      agent: mockAgents[0],
      status: "pending",
      phase: 2,
    },
  },
  // Phase 3 nodes
  {
    id: "phase-3",
    type: "phaseNode",
    position: { x: 1450, y: 50 },
    data: {
      label: "Phase 3: Advanced",
      type: "phase",
      phase: 3,
      progress: 0,
      taskCount: 1,
    },
  },
  {
    id: "task-3-1-1",
    type: "taskNode",
    position: { x: 1800, y: 150 },
    data: {
      label: "Search implementation",
      type: "task",
      agent: mockAgents[1],
      status: "pending",
      phase: 3,
    },
  },
]

export const mockFlowEdges: Edge<FlowEdgeData>[] = [
  // Phase 1 dependencies
  {
    id: "e1-1-1-to-1-1-2",
    source: "task-1-1-1",
    target: "task-1-1-2",
    data: { type: "required", isCriticalPath: true },
  },
  {
    id: "e1-1-2-to-1-1-3",
    source: "task-1-1-2",
    target: "task-1-1-3",
    data: { type: "required", isCriticalPath: true },
  },
  {
    id: "e1-2-1-to-1-2-2",
    source: "task-1-2-1",
    target: "task-1-2-2",
    data: { type: "required", isCriticalPath: false },
  },
  {
    id: "e1-2-2-to-1-2-3",
    source: "task-1-2-2",
    target: "task-1-2-3",
    data: { type: "required", isCriticalPath: false },
  },
  {
    id: "e1-3-1-to-1-3-2",
    source: "task-1-3-1",
    target: "task-1-3-2",
    data: { type: "required", isCriticalPath: false },
  },
  {
    id: "e1-3-2-to-1-3-3",
    source: "task-1-3-2",
    target: "task-1-3-3",
    data: { type: "required", isCriticalPath: false },
  },

  // Phase 1 to Phase 2 dependencies
  {
    id: "e1-1-3-to-2-1-1",
    source: "task-1-1-3",
    target: "task-2-1-1",
    data: { type: "required", isCriticalPath: true },
  },
  {
    id: "e1-2-3-to-2-1-1",
    source: "task-1-2-3",
    target: "task-2-1-1",
    data: { type: "optional", isCriticalPath: false },
  },

  // Phase 2 dependencies
  {
    id: "e2-1-1-to-2-1-2",
    source: "task-2-1-1",
    target: "task-2-1-2",
    data: { type: "required", isCriticalPath: true },
  },
  {
    id: "e2-1-2-to-2-1-3",
    source: "task-2-1-2",
    target: "task-2-1-3",
    data: { type: "required", isCriticalPath: true },
  },
  {
    id: "e2-1-2-to-2-2-1",
    source: "task-2-1-2",
    target: "task-2-2-1",
    data: { type: "required", isCriticalPath: false },
  },
  {
    id: "e2-2-1-to-2-2-2",
    source: "task-2-2-1",
    target: "task-2-2-2",
    data: { type: "required", isCriticalPath: false },
  },
  {
    id: "e2-2-2-to-2-3-1",
    source: "task-2-2-2",
    target: "task-2-3-1",
    data: { type: "required", isCriticalPath: true },
  },
  {
    id: "e2-3-1-to-2-3-2",
    source: "task-2-3-1",
    target: "task-2-3-2",
    data: { type: "required", isCriticalPath: true },
  },

  // Phase 2 to Phase 3 dependencies
  {
    id: "e2-1-3-to-3-1-1",
    source: "task-2-1-3",
    target: "task-3-1-1",
    data: { type: "required", isCriticalPath: true },
  },
]

export const mockDocuments: Document[] = [
  {
    id: "doc-1",
    name: "architecture.md",
    type: "markdown",
    tags: ["phase-1", "database", "api-spec"],
    linkedTasks: ["task-1-2-1", "task-1-2-2", "task-2-1-1"],
    lastModified: new Date("2025-01-25T10:30:00"),
    content: `# System Architecture

## Overview
This document outlines the architecture for the e-commerce platform.

## Tech Stack
- **Frontend**: Next.js 14 with App Router
- **Database**: PostgreSQL with Supabase
- **Payments**: Stripe
- **Styling**: Tailwind CSS + shadcn/ui

## Database Schema
- Users table
- Products table
- Orders table
- Cart items table`,
  },
  {
    id: "doc-2",
    name: "product-wireframes.fig",
    type: "figma",
    tags: ["phase-2", "design", "ui"],
    linkedTasks: ["task-2-1-2"],
    lastModified: new Date("2025-01-24T16:45:00"),
    url: "https://figma.com/file/example",
  },
  {
    id: "doc-3",
    name: "api-documentation.md",
    type: "markdown",
    tags: ["phase-2", "api", "backend"],
    linkedTasks: ["task-2-1-1", "task-2-2-1"],
    lastModified: new Date("2025-01-23T09:15:00"),
    content: `# API Documentation

## Product Endpoints

### GET /api/products
Returns list of all products

### GET /api/products/:id
Returns single product details

### POST /api/products
Creates a new product (admin only)`,
  },
  {
    id: "doc-4",
    name: "design-system.pdf",
    type: "pdf",
    tags: ["design", "ui", "brand"],
    linkedTasks: ["task-2-1-2", "task-2-3-2"],
    lastModified: new Date("2025-01-22T16:45:00"),
    url: "https://example.com/design-system.pdf",
  },
  {
    id: "doc-5",
    name: "business-requirements.docx",
    type: "word",
    tags: ["business", "planning"],
    linkedTasks: [],
    lastModified: new Date("2025-01-20T11:00:00"),
  },
  {
    id: "doc-6",
    name: "checkout-flow.png",
    type: "image",
    tags: ["phase-2", "design", "checkout"],
    linkedTasks: ["task-2-3-2"],
    lastModified: new Date("2025-01-19T13:30:00"),
    url: "/checkout-flow-diagram.jpg",
  },
  {
    id: "doc-7",
    name: "stripe-integration.md",
    type: "markdown",
    tags: ["phase-2", "payments", "api"],
    linkedTasks: ["task-2-3-1"],
    lastModified: new Date("2025-01-18T08:20:00"),
    content: `# Stripe Integration Guide

## Setup
1. Install Stripe SDK
2. Configure API keys
3. Create payment intent endpoint

## Testing
Use test card: 4242 4242 4242 4242`,
  },
  {
    id: "doc-8",
    name: "database-schema.png",
    type: "image",
    tags: ["phase-1", "database"],
    linkedTasks: ["task-1-2-1"],
    lastModified: new Date("2025-01-15T10:00:00"),
    url: "/database-schema.png",
  },
]

export const mockDocsData: DocSection[] = [
  {
    id: "getting-started",
    name: "Getting Started",
    icon: "📚",
    expanded: true,
    items: [
      {
        id: "readme",
        name: "README",
        icon: "📄",
        type: "markdown",
        content: `# E-commerce Platform

Welcome to the Mission Control documentation for our e-commerce platform project.

## Quick Start

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Setup environment variables
4. Run development server: \`npm run dev\`

## Project Overview

This is a modern e-commerce platform built with Next.js 14, PostgreSQL, and Stripe for payments.`,
      },
      {
        id: "setup-guide",
        name: "Setup Guide",
        icon: "📄",
        type: "markdown",
        content: `# Setup Guide

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Stripe account

## Installation Steps

\`\`\`bash
# Clone the repository
git clone https://github.com/example/ecommerce-platform.git

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
\`\`\`

## Environment Variables

\`\`\`env
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
\`\`\``,
      },
      {
        id: "quick-start",
        name: "Quick Start",
        icon: "📄",
        type: "markdown",
      },
    ],
  },
  {
    id: "architecture",
    name: "Architecture",
    icon: "🏗️",
    expanded: true,
    items: [
      {
        id: "system-design",
        name: "System Design",
        icon: "📄",
        type: "markdown",
        content: `# System Architecture Overview

This document outlines the high-level architecture of our e-commerce platform.

## Architecture Diagram

\`\`\`mermaid
graph TD
    A[Frontend - Next.js] --> B[API Layer]
    B --> C[Database - PostgreSQL]
    B --> D[Cache - Redis]
    B --> E[Stripe API]
    A --> F[CDN - Vercel]
\`\`\`

## Tech Stack

Our platform is built using modern, scalable technologies:

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | Next.js 14 | Server-side rendering, routing |
| Database | PostgreSQL | Primary data store |
| Cache | Redis | Session & query caching |
| Payments | Stripe | Payment processing |
| Styling | Tailwind CSS | Utility-first CSS |
| UI Components | shadcn/ui | Accessible components |

## Database Design

### Core Tables

\`\`\`typescript
interface User {
  id: string
  email: string
  name: string
  createdAt: Date
}

interface Product {
  id: string
  name: string
  price: number
  inventory: number
}

interface Order {
  id: string
  userId: string
  total: number
  status: 'pending' | 'completed' | 'cancelled'
}
\`\`\`

## API Layer

Our API follows RESTful principles with the following structure:

- \`/api/products\` - Product management
- \`/api/orders\` - Order processing
- \`/api/users\` - User management
- \`/api/payments\` - Payment handling

### Authentication

We use JWT tokens for authentication with refresh token rotation.

## Frontend Architecture

The frontend is organized into:

- **Pages** - Route handlers using App Router
- **Components** - Reusable UI components
- **Hooks** - Custom React hooks for state management
- **Utils** - Helper functions and utilities

## Decision Log

### ADR-001: Why Next.js?

**Status:** Accepted

**Context:** We needed a framework that supports SSR, has great DX, and scales well.

**Decision:** Use Next.js 14 with App Router for its performance, SEO benefits, and developer experience.

**Consequences:** 
- ✅ Excellent performance with RSC
- ✅ Built-in routing and API routes
- ⚠️ Learning curve for App Router`,
      },
      {
        id: "database-schema",
        name: "Database Schema",
        icon: "📄",
        type: "markdown",
      },
      {
        id: "api-design",
        name: "API Design",
        icon: "📄",
        type: "markdown",
      },
    ],
  },
  {
    id: "components",
    name: "Components",
    icon: "🧩",
    items: [
      {
        id: "component-docs",
        name: "Component Docs",
        icon: "📄",
        type: "markdown",
      },
      {
        id: "storybook",
        name: "Storybook Link",
        icon: "🔗",
        type: "markdown",
      },
      {
        id: "design-system",
        name: "Design System",
        icon: "📄",
        type: "markdown",
      },
    ],
  },
  {
    id: "api-reference",
    name: "API Reference",
    icon: "🔌",
    items: [
      {
        id: "endpoints",
        name: "Endpoints",
        icon: "📄",
        type: "api",
      },
      {
        id: "authentication",
        name: "Authentication",
        icon: "📄",
        type: "markdown",
      },
      {
        id: "webhooks",
        name: "Webhooks",
        icon: "📄",
        type: "markdown",
      },
    ],
  },
  {
    id: "testing",
    name: "Testing",
    icon: "🧪",
    items: [
      {
        id: "test-strategy",
        name: "Test Strategy",
        icon: "📄",
        type: "markdown",
      },
      {
        id: "e2e-guide",
        name: "E2E Guide",
        icon: "📄",
        type: "markdown",
      },
      {
        id: "ci-cd",
        name: "CI/CD",
        icon: "📄",
        type: "markdown",
      },
    ],
  },
  {
    id: "notebooks",
    name: "Notebooks",
    icon: "📓",
    items: [
      {
        id: "data-analysis",
        name: "data-analysis.ipynb",
        icon: "📔",
        type: "notebook",
      },
    ],
  },
  {
    id: "adrs",
    name: "ADRs",
    icon: "🗂️",
    items: [
      {
        id: "adr-001",
        name: "ADR-001: Framework Choice",
        icon: "📄",
        type: "markdown",
      },
    ],
  },
  {
    id: "deployment",
    name: "Deployment",
    icon: "🚀",
    items: [
      {
        id: "runbooks",
        name: "Runbooks",
        icon: "📄",
        type: "markdown",
      },
      {
        id: "environment-setup",
        name: "Environment Setup",
        icon: "📄",
        type: "markdown",
      },
    ],
  },
]

export const mockProjects: ProjectSummary[] = [
  {
    id: "ecommerce-platform",
    name: "E-commerce Platform",
    description: "Modern online shopping experience with Stripe integration",
    status: "in_progress",
    phase: "Phase 2 of 4: Core Features",
    progress: 65,
    techStack: ["Next.js", "PostgreSQL", "Stripe", "Tailwind"],
    startDate: new Date("2025-01-02"),
    lastActivity: new Date("2025-01-25T10:30:00"),
    totalTasks: 47,
    completedTasks: 31,
    activeAgents: 2,
    health: "good",
  },
  {
    id: "saas-dashboard",
    name: "SaaS Dashboard",
    description: "Analytics and reporting platform for enterprise clients",
    status: "planning",
    phase: "Phase 1 of 3: Planning",
    progress: 15,
    techStack: ["React", "Node.js", "MongoDB", "D3.js"],
    startDate: new Date("2025-01-20"),
    lastActivity: new Date("2025-01-24T16:45:00"),
    totalTasks: 32,
    completedTasks: 5,
    activeAgents: 1,
    health: "excellent",
  },
  {
    id: "mobile-app",
    name: "Mobile App",
    description: "Cross-platform mobile application with offline support",
    status: "in_progress",
    phase: "Phase 3 of 4: Feature Development",
    progress: 78,
    techStack: ["React Native", "Firebase", "TypeScript"],
    startDate: new Date("2024-12-01"),
    lastActivity: new Date("2025-01-25T14:20:00"),
    totalTasks: 56,
    completedTasks: 44,
    activeAgents: 3,
    health: "good",
  },
  {
    id: "api-gateway",
    name: "API Gateway",
    description: "Microservices API gateway with rate limiting and auth",
    status: "review",
    phase: "Phase 4 of 4: Testing & Deployment",
    progress: 92,
    techStack: ["Go", "Redis", "Docker", "Kubernetes"],
    startDate: new Date("2024-11-15"),
    lastActivity: new Date("2025-01-23T09:15:00"),
    totalTasks: 38,
    completedTasks: 35,
    activeAgents: 1,
    health: "excellent",
  },
  {
    id: "cms-platform",
    name: "CMS Platform",
    description: "Headless CMS for content management and distribution",
    status: "on_hold",
    phase: "Phase 2 of 5: Content Modeling",
    progress: 40,
    techStack: ["Next.js", "GraphQL", "PostgreSQL", "Vercel"],
    startDate: new Date("2024-10-01"),
    lastActivity: new Date("2025-01-10T11:00:00"),
    totalTasks: 62,
    completedTasks: 25,
    activeAgents: 0,
    health: "attention",
  },
  {
    id: "ml-pipeline",
    name: "ML Pipeline",
    description: "Machine learning pipeline for data processing and model training",
    status: "in_progress",
    phase: "Phase 2 of 3: Model Training",
    progress: 55,
    techStack: ["Python", "TensorFlow", "AWS", "Docker"],
    startDate: new Date("2025-01-05"),
    lastActivity: new Date("2025-01-25T08:00:00"),
    totalTasks: 28,
    completedTasks: 15,
    activeAgents: 2,
    health: "good",
  },
]
