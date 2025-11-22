# v0 Handoff Instructions: Build Missing UI Components

## 🎯 Mission

Build **3 critical UI components** for Mission Control that connect to the database and enable AI agent prompt generation (the core pain point).

You have been given:
- ✅ **Complete database schema** with all necessary fields
- ✅ **5 new migrations** (007-011) that add the missing fields
- ✅ **Prompt generator utility** (`lib/prompt-generator.ts`) - the core logic
- ✅ **Full gap analysis** (`UI-GAPS-ANALYSIS.md`) - read this first!

---

## 📚 Required Reading

Before you start, **READ THESE FILES:**

1. **`UI-GAPS-ANALYSIS.md`** - Shows exactly what's missing in the UI
2. **`DB-VALIDATION-REPORT.md`** - Database schema details
3. **`lib/db/schema.ts`** - All TypeScript types for the database
4. **`lib/prompt-generator.ts`** - The utility you'll use
5. **`lib/types.ts`** - Current UI types (some need updating)
6. **`lib/mock-data.ts`** - See current data structure

---

## 🏗️ Components to Build

### **1. BusinessContextForm.tsx** ⚠️ HIGH PRIORITY

**Location:** `components/projects/BusinessContextForm.tsx`

**Purpose:** Capture comprehensive business context when creating/editing a project

**Database Fields to Populate:**
```typescript
interface BusinessContext {
  vision: string
  target_market: string
  primary_use_case: string
  revenue_model: string
  competitive_advantage: string

  success_metrics: Array<{
    metric: string
    target: string | number
    current: string | number
  }>

  risk_assessment: Array<{
    risk: string
    impact: 'high' | 'medium' | 'low'
    mitigation: string
  }>

  stakeholders: Array<{
    name: string
    role: string
    priority: 'primary' | 'secondary'
  }>

  budget_info: {
    total: number
    allocated: number
    spent: number
  }
}
```

**UI Design:**
- **Multi-step wizard** (4-5 steps)
  - Step 1: Vision & Strategy (vision, target_market, primary_use_case)
  - Step 2: Business Model (revenue_model, competitive_advantage)
  - Step 3: Success Metrics (dynamic array of metrics)
  - Step 4: Risks & Stakeholders
  - Step 5: Budget (optional)

- **Form Components:**
  - Rich text areas for long-form content (vision, etc.)
  - Dynamic array inputs for metrics, risks, stakeholders
  - Number inputs for budget
  - Progress indicator showing which step you're on

**Integration Points:**
- Should be accessible from:
  1. **NewProjectModal** - Add "Business Planning" section
  2. **Project Settings** - Edit existing business context

- **Save to:** `/api/business-context` endpoint (you'll need to create this)
  - POST: Create new business context
  - PUT: Update existing

**Key Features:**
- ✅ Validation: All text fields required, metrics need numeric targets
- ✅ Auto-save drafts to localStorage
- ✅ Show preview of completed sections
- ✅ "Skip for now" option (can fill later)

**Success Criteria:**
- Business context saved to database
- Accessible when generating prompts
- Can be edited later

---

### **2. PromptGenerator.tsx** ⚠️ HIGHEST PRIORITY (Pain Point)

**Location:** `components/prompts/PromptGenerator.tsx`

**Purpose:** Generate comprehensive AI agent instructions from project data

**Uses:** `lib/prompt-generator.ts` (already built!)

**Where to Add:**
1. **TaskDetailModal** - Add "Generate Prompt" button
2. **Tree View** - Right-click context menu
3. **Kanban Card** - Dropdown action menu
4. **Gantt View** - Timeline task actions

**UI Design:**

```
┌─────────────────────────────────────────┐
│ Generate AI Agent Instructions          │
├─────────────────────────────────────────┤
│                                         │
│ Options:                                 │
│ ☑ Include Business Context              │
│ ☑ Include Tech Stack                    │
│ ☑ Include Dependencies                  │
│ ☑ Include Acceptance Criteria           │
│ ☑ Include MCP Connection Details        │
│                                         │
│ Format:                                  │
│ ● Markdown  ○ Plain Text  ○ JSON        │
│                                         │
│ Export for:                              │
│ ● Claude Code  ○ Cursor  ○ GPT  ○ v0   │
│                                         │
│ [Generate Prompt]                        │
└─────────────────────────────────────────┘

↓ After clicking Generate ↓

┌─────────────────────────────────────────┐
│ Generated Agent Instructions             │
├─────────────────────────────────────────┤
│ # AI Agent Instructions: Implement Auth │
│                                         │
│ Project: **E-commerce Platform**        │
│ Phase: **Foundation** | Stage: **Back  │
│                                         │
│ ## 📋 Business Context                  │
│ **Vision:** Build a modern...           │
│ ...                                     │
│ (Full generated prompt here)            │
│                                         │
│ [📋 Copy to Clipboard]                  │
│ [💾 Save as Document]                   │
│ [🔗 Send to Claude Code]                │
│ [✏️ Edit Prompt]                        │
└─────────────────────────────────────────┘
```

**Implementation:**

```typescript
import { generateAgentPrompt, formatForTool } from '@/lib/prompt-generator'

// In your component:
const handleGeneratePrompt = async () => {
  // Fetch all required data
  const project = await fetch(`/api/projects/${projectId}`).then(r => r.json())
  const step = await fetch(`/api/steps/${stepId}`).then(r => r.json())
  const businessContext = await fetch(`/api/projects/${projectId}/business-context`).then(r => r.json())
  const techStack = await fetch(`/api/projects/${projectId}/tech-stack`).then(r => r.json())
  const dependencies = await fetch(`/api/steps/${stepId}/dependencies`).then(r => r.json())

  // Generate prompt using utility
  const prompt = generateAgentPrompt({
    project,
    step,
    businessContext,
    techStack,
    dependencies
  }, {
    includeBusinessContext: options.includeBusinessContext,
    includeTechStack: options.includeTechStack,
    // ... other options
  })

  // Format for selected tool
  const formatted = formatForTool(prompt, selectedTool)

  setGeneratedPrompt(formatted)
}
```

**Key Features:**
- ✅ Options to customize what's included
- ✅ Syntax highlighting for generated prompt
- ✅ Copy to clipboard
- ✅ Save as document (creates entry in documents table)
- ✅ Direct integration with Claude Code (if possible)
- ✅ Preview mode with expand/collapse sections

**Success Criteria:**
- Generates comprehensive prompts with all context
- Easy to copy and paste into AI tools
- Can save for reuse
- All options work correctly

---

### **3. DocumentEditor.tsx** ⚠️ HIGH PRIORITY

**Location:** `components/docs/DocumentEditor.tsx`

**Purpose:** Create and edit documentation inline with markdown support

**Database Fields:**
```typescript
interface Document {
  title: string
  description: string
  content: string           // NEW: Inline markdown
  doc_type: 'architecture' | 'api' | 'ui_ux' | 'requirements' | 'testing' | 'deployment' | 'general'
  tags: string[]            // NEW: For categorization
  category: string
  file_type: string
}

// NEW table: document_tasks
interface DocumentTask {
  document_id: UUID
  task_id: UUID
  relationship_type: 'reference' | 'implementation' | 'specification' | 'testing'
}
```

**UI Design:**

```
┌─────────────────────────────────────────┐
│ Create Documentation                     │
├─────────────────────────────────────────┤
│ Title: ___________________________      │
│                                         │
│ Type: [Architecture ▼]                  │
│                                         │
│ Tags: [api] [backend] [+ Add]           │
│                                         │
│ Link to Tasks: [+ Link Task]            │
│ • Authentication System (implementation)│
│ • Database Schema (reference)           │
│                                         │
│ ┌─────────────────────────────────────┐│
│ │ [B] [I] [Code] [Link] [Image]      ││
│ ├─────────────────────────────────────┤│
│ │ # API Documentation                 ││
│ │                                     ││
│ │ ## Authentication Endpoints         ││
│ │                                     ││
│ │ ### POST /api/auth/login            ││
│ │ ...                                 ││
│ │                                     ││
│ └─────────────────────────────────────┘│
│                                         │
│ [Preview] [Save Draft] [Publish]        │
└─────────────────────────────────────────┘
```

**Markdown Editor:**
- Use a library like **TipTap**, **Toast UI Editor**, or **SimpleMDE**
- Support:
  - Headings, bold, italic, code blocks
  - Links and images
  - Tables
  - Code syntax highlighting
  - Live preview

**Task Linking:**
- Search tasks by name
- Select multiple tasks
- Choose relationship type for each
- Display linked tasks with badges

**Templates:**
Provide common templates:
- **Architecture Document**: System design, components, data flow
- **API Specification**: Endpoints, request/response, auth
- **Requirements Document**: User stories, acceptance criteria
- **Testing Plan**: Test cases, coverage, scenarios

**Integration Points:**
- **DocsView** - List all documents, click to edit
- **DocumentBrowser** - Existing component, add "New Doc" button
- **TaskDetailModal** - Show linked docs, add "Create Doc" button

**Success Criteria:**
- Can create markdown docs inline
- Tag management works
- Task linking saves to `document_tasks` table
- Templates are useful
- Preview renders correctly

---

## 🔌 API Routes You Need to Create

These don't exist yet - you'll need to create them:

### **1. Business Context API**

**`app/api/projects/[id]/business-context/route.ts`**

```typescript
// GET - Fetch business context
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const businessContext = await sql`
    SELECT * FROM business_context
    WHERE project_id = ${params.id}
  `
  return Response.json(businessContext[0] || null)
}

// POST - Create business context
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const data = await request.json()
  const result = await sql`
    INSERT INTO business_context ${sql(data)}
    RETURNING *
  `
  return Response.json(result[0])
}

// PUT - Update business context
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const data = await request.json()
  const result = await sql`
    UPDATE business_context
    SET ${sql(data)}
    WHERE project_id = ${params.id}
    RETURNING *
  `
  return Response.json(result[0])
}
```

### **2. Step Dependencies API**

**`app/api/steps/[id]/dependencies/route.ts`**

```typescript
// GET - Fetch dependencies with completion status
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const dependencies = await sql`
    SELECT
      sd.id,
      sd.dependency_type,
      ps.id as step_id,
      ps.title,
      ps.status,
      ps.progress,
      ps.description,
      CASE WHEN ps.status = 'completed' THEN true ELSE false END as completed
    FROM step_dependencies sd
    JOIN project_steps ps ON ps.id = sd.depends_on_step_id
    WHERE sd.step_id = ${params.id}
      AND sd.deleted_at IS NULL
      AND ps.deleted_at IS NULL
    ORDER BY ps.order_index
  `
  return Response.json(dependencies)
}
```

### **3. Document Tasks API**

**`app/api/documents/[id]/tasks/route.ts`**

```typescript
// POST - Link document to task
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { taskId, relationshipType } = await request.json()
  const result = await sql`
    INSERT INTO document_tasks (document_id, task_id, relationship_type)
    VALUES (${params.id}, ${taskId}, ${relationshipType})
    ON CONFLICT (document_id, task_id) DO UPDATE
    SET relationship_type = ${relationshipType}
    RETURNING *
  `
  return Response.json(result[0])
}

// GET - Get all tasks linked to document
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const tasks = await sql`
    SELECT
      ps.id,
      ps.title,
      ps.description,
      ps.status,
      dt.relationship_type
    FROM document_tasks dt
    JOIN project_steps ps ON ps.id = dt.task_id
    WHERE dt.document_id = ${params.id}
      AND ps.deleted_at IS NULL
    ORDER BY dt.created_at DESC
  `
  return Response.json(tasks)
}
```

---

## 📦 Database Schema Updates

The database client is already configured at `lib/db/client.ts`.

**New fields added in migrations 007-011:**

**Projects:**
- `current_phase: TEXT`
- `health: TEXT ('excellent' | 'good' | 'attention' | 'critical')`
- Status enum now includes 'review'

**Project Steps:**
- `assigned_agent: TEXT ('v0' | 'claude' | 'gemini' | 'gpt')`
- `start_date: TIMESTAMP`
- `end_date: TIMESTAMP`
- `priority: TEXT ('low' | 'medium' | 'high')`
- `acceptance_criteria: JSONB`
- `parent_task_id: UUID` (for subtasks)
- Status enum now includes 'paused' and 'failed'

**New Table: Agents**
- `name: TEXT`
- `status: TEXT`
- `current_task_id: UUID`
- `capabilities: JSONB`

**Documents Enhanced:**
- `tags: TEXT[]`
- `content: TEXT`
- `doc_type: TEXT`
- `version: INTEGER`

**New Table: Document Tasks**
- `document_id: UUID`
- `task_id: UUID`
- `relationship_type: TEXT`

---

## 🎨 Design Guidelines

Follow Mission Control's existing design:

**Colors:**
- Background: `bg-background` (dark theme)
- Cards: `bg-card` with `border-white/10`
- Primary actions: `bg-blue-500`
- Accent: Use badges with semantic colors

**Typography:**
- Headers: Bold, hierarchical (text-3xl → text-xl)
- Body: `text-sm`, `text-muted-foreground` for secondary

**Components:**
- Use existing shadcn/ui components from `components/ui/`
- Follow patterns in existing components (see `components/views/`)
- Maintain consistent spacing with Tailwind utilities

**Responsiveness:**
- Mobile-first approach
- Use grid and flexbox layouts
- Dialogs/modals should be scrollable on mobile

---

## ✅ Success Criteria

When you're done, the user should be able to:

1. **Create a new project with full business context**
   - Vision, target market, revenue model, success metrics
   - All saved to database

2. **Generate comprehensive AI agent prompts**
   - Click a task → Generate Prompt
   - See full context with business goals, tech stack, dependencies
   - Copy and paste into Claude/Cursor/GPT
   - Prompt includes MCP connection instructions

3. **Create and manage documentation**
   - Write markdown docs inline
   - Tag and categorize
   - Link docs to specific tasks
   - Use templates for common doc types

---

## 🚀 Getting Started

1. **Read the gap analysis:** `UI-GAPS-ANALYSIS.md`
2. **Review the database schema:** `lib/db/schema.ts`
3. **Understand the prompt generator:** `lib/prompt-generator.ts`
4. **Check existing components:** Look at `components/projects/NewProjectModal.tsx` as reference
5. **Build the 3 components** in priority order:
   - PromptGenerator (highest priority)
   - BusinessContextForm
   - DocumentEditor

---

## 💡 Tips

- **Test with mock data first** - Use `lib/mock-data.ts` patterns
- **API routes can wait** - Build UI with placeholder data initially
- **Copy existing patterns** - Look at `TaskDetailModal.tsx`, `KanbanView.tsx` for reference
- **Use the prompt generator** - It's already built! Just call the functions
- **Follow TypeScript types** - They're all defined in `lib/db/schema.ts`

---

## 🆘 If You Get Stuck

**Reference these existing components:**
- **Form patterns:** `components/projects/NewProjectModal.tsx`
- **Modal patterns:** `components/views/TaskDetailModal.tsx`
- **Complex views:** `components/views/GanttView.tsx`, `KanbanView.tsx`
- **Sidebar patterns:** `components/shared/AIAssistant.tsx`

**The database schema is fully ready** - just connect your UI to it via API routes!

---

**Good luck! This will solve the core pain point of generating comprehensive AI agent instructions. 🚀**
