# Idea Incubator / Idea Tank

## Vision

The Idea Incubator is a **thought repository with execution integration** - a system designed to capture, evolve, and transform ideas into executable projects. It treats ideas like code: with versioning, branching, dependencies, and a clear path from conception to execution.

**Core Principle**: *"The bigger picture is only as clear as the pixels used to make it."*

Ideas grow and transform. A simple recipe can evolve into a restaurant concept. A technical note can become a full product. The system must support this natural evolution while maintaining traceability and context.

---

## Core Concepts

### 1. Idea → Process → Evolution

**Idea Lifecycle**:
```
SEED → EXPLORING → REFINED → PROMOTED → (Project Execution)
  ↓        ↓          ↓           ↓
Capture  Develop   Polish    Convert to Project
```

- **Seed**: Initial thought capture (minimal structure)
- **Exploring**: Adding facets, branching alternatives
- **Refined**: Ready for execution
- **Promoted**: Converted to active project
- **Archived**: Preserved for reference

### 2. Modular Complexity (Facets)

Ideas start simple and gain structure as needed. No forced fields - you add "facets" when thinking deepens.

**Available Facets**:
- **pros-cons**: Benefits vs drawbacks
- **dependencies**: What this needs/enables
- **timeline**: Key milestones
- **resources**: Links, files, references
- **competitors**: Market landscape
- **technical-specs**: Implementation details
- **financials**: Cost/revenue
- **blockers**: Current barriers
- **notes**: Freeform additions
- **versions**: Branch/history tracking
- **custom**: Define your own

**Example Flow**:
1. Create idea: "Thai curry recipe" (just title + core thought)
2. Add facets as thinking evolves:
   - Ingredients → Menu items (restaurant concept emerges)
   - Add market research facet
   - Add location analysis facet
3. Transform: Recipe → Business Idea

###3. Git-Like Evolution

Ideas have **branches**, **transformations**, and **refinement PRs**.

**Branching**:
```
Restaurant Concept (main)
  ├─ food-truck (mobile version)
  ├─ virtual-kitchen (delivery-only)
  └─ franchise-model (scale approach)
```

**Transformations**:
- `evolved-into`: Natural progression
- `branched-as`: Alternative exploration
- `merged-with`: Combined ideas
- `spawned`: Created from existing

**Refinement PRs** (from execution back to ideation):
When a project hits a barrier during execution, create a "refinement PR" back to the idea:
1. Execution finds cost barrier
2. Create refinement proposing pivot
3. Accept → merge to main idea
4. Fork → create new branch to explore alternative

---

## Database Schema

### Core Tables

```sql
-- Ideas: The incubator
CREATE TABLE ideas (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,

  -- Evolution tracking
  idea_state TEXT DEFAULT 'seed',  -- 'seed', 'exploring', 'refined', 'promoted', 'archived'
  origin_idea_id UUID REFERENCES ideas(id),  -- What spawned this?
  transformed_from TEXT,  -- Track type changes

  -- Current shape
  current_type TEXT,  -- Can change over time
  category TEXT,  -- User-defined, emergent
  tags TEXT[],

  -- Core content
  core_content TEXT,

  -- Promotion tracking
  promoted_to_project_id UUID REFERENCES projects(id),
  promoted_at TIMESTAMP,

  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Idea facets (modular complexity)
CREATE TABLE idea_facets (
  id UUID PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id),
  facet_type TEXT,  -- 'pros-cons', 'dependencies', 'timeline', etc.
  data JSONB,  -- Flexible structure per type
  added_at TIMESTAMP
)

-- Idea evolution (git-like)
CREATE TABLE idea_branches (
  id UUID PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id),
  branch_name TEXT,  -- 'main', 'restaurant-concept', 'cookbook-version'
  parent_branch_id UUID,
  is_active BOOLEAN DEFAULT true,

  -- Snapshot of idea state on this branch
  snapshot JSONB,

  created_at TIMESTAMP,
  created_by TEXT  -- 'manual', 'claude', 'agent-name'
)

-- Refinement PRs (feedback from execution)
CREATE TABLE idea_refinements (
  id UUID PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id),
  source_project_id UUID REFERENCES projects(id),  -- Where feedback came from

  refinement_type TEXT,  -- 'barrier-found', 'new-approach', 'pivot-needed'
  description TEXT,
  proposed_changes JSONB,

  status TEXT DEFAULT 'open',  -- 'open', 'accepted', 'rejected', 'merged'

  created_at TIMESTAMP,
  resolved_at TIMESTAMP
)

-- Idea transformations (evolution log)
CREATE TABLE idea_transformations (
  id UUID PRIMARY KEY,
  from_idea_id UUID REFERENCES ideas(id),
  to_idea_id UUID REFERENCES ideas(id),
  transformation_type TEXT,  -- 'evolved-into', 'branched-as', 'merged-with', 'spawned'
  notes TEXT,
  created_at TIMESTAMP
)

-- Idea relationships (network connections)
CREATE TABLE idea_relationships (
  from_idea_id UUID REFERENCES ideas(id),
  to_idea_id UUID REFERENCES ideas(id),
  relationship_type TEXT,  -- User-defined, emerges naturally
  metadata JSONB,
  created_at TIMESTAMP
)

-- Categories emerge from usage
CREATE TABLE categories (
  name TEXT PRIMARY KEY,
  parent_category TEXT,  -- Optional hierarchy
  created_at TIMESTAMP
)
```

---

## The Complete Flow

```
┌──────────────────────────────────────────────────────┐
│                   IDEA INCUBATOR                      │
├──────────────────────────────────────────────────────┤
│                                                       │
│  1. CAPTURE (seed)                                   │
│     └─> "Thai curry recipe"                         │
│         - Just title + core thought                  │
│         - No forced structure                        │
│                                                       │
│  2. EXPLORE (exploring)                              │
│     ├─> Add facets as needed:                       │
│     │   • Ingredients → Menu items                  │
│     │   • Market research                            │
│     │   • Location analysis                          │
│     ├─> Branch: "restaurant-concept"                │
│     ├─> Branch: "food-truck-version"                │
│     └─> Transform: Recipe → Business Idea           │
│                                                       │
│  3. REFINE (refined)                                 │
│     ├─> Restaurant branch grows business facets     │
│     ├─> Add financials, competitors                 │
│     └─> Merge branches or keep alternatives         │
│                                                       │
│  4. PROMOTE (promoted)                               │
│     └─> Convert to PROJECT EXECUTION                 │
│         - Links back to source idea                  │
│         - Creates initial steps from facets          │
│         - Idea state = 'promoted'                    │
│                                                       │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│               PROJECT EXECUTION                       │
├──────────────────────────────────────────────────────┤
│  • Steps, tasks, timeline                            │
│  • Resources, assignments                            │
│  • Progress tracking                                 │
│                                                       │
│  ⚠️  BARRIER ENCOUNTERED                              │
│     "Cost model doesn't work at scale"               │
│                                                       │
│  [Create Refinement PR] ──────────────┐             │
└───────────────────────────────────────┼─────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │  Refinement PR   │
                              ├─────────────────┤
                              │ Type: pivot      │
                              │                  │
                              │ "Cost barrier    │
                              │  requires pivot  │
                              │  to subscription │
                              │  model instead   │
                              │  of one-time"    │
                              │                  │
                              │ Proposed:        │
                              │ - Add recurring  │
                              │   revenue facet  │
                              │ - Update         │
                              │   financials     │
                              │                  │
                              │ [Accept] [Fork]  │
                              └─────────────────┘
                                        │
                                        ▼
                              Back to IDEAS
                              (merge or new branch)
```

---

## Domain Validation & Specialized Agents

### The Validation Layer

Between **refined ideas** and **project execution**, there's a critical validation phase where ideas are tested, challenged, and validated based on their domain.

```
Idea (Refined) → Domain Validation → Document Generation → Project Execution
                        ↑
                 Specialized Agents
```

### The Validation Flow

```
┌──────────────────────────────────────────────┐
│           IDEA INCUBATOR                      │
│  Idea reaches "refined" state                 │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│        DOMAIN VALIDATION                      │
├──────────────────────────────────────────────┤
│                                               │
│  Business Idea? → Business Validation Agent   │
│    • Market size analysis                     │
│    • Competitive landscape                    │
│    • Financial modeling                       │
│    • Revenue model validation                 │
│    • Unit economics                           │
│                                               │
│  Technical Idea? → Technical Validation Agent │
│    • Architecture review                      │
│    • Scalability analysis                     │
│    • Cost estimation                          │
│    • Technology feasibility                   │
│    • Security considerations                  │
│                                               │
│  Product Idea? → Product Validation Agent     │
│    • User research                            │
│    • Problem-solution fit                     │
│    • MVP definition                           │
│    • Go-to-market strategy                    │
│    • Success metrics                          │
│                                               │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│      DOCUMENT GENERATION                      │
├──────────────────────────────────────────────┤
│  Auto-generate from validated facets:         │
│    • Business Plan                            │
│    • Investment Proposal                      │
│    • PRD (Product Requirements Doc)           │
│    • Technical Specification                  │
│    • Pitch Deck                               │
│    • Executive Summary                        │
│    • Go-to-Market Plan                        │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
         PROJECT EXECUTION
```

### Specialized Validation Agents

#### Business Validation Agent

**Questions it asks**:
- What problem does this solve?
- Who is the target customer?
- How big is the market?
- Who are the competitors?
- What's your unfair advantage?
- What's the revenue model?
- What are unit economics?
- What's the go-to-market strategy?

**Validates**:
- Market size calculations
- Financial projections
- Competitive positioning
- Revenue assumptions

**Outputs**:
- Validated business model canvas
- Financial model
- Competitive analysis
- Market sizing report

#### Technical Validation Agent

**Questions it asks**:
- What's the core technical challenge?
- What's the proposed architecture?
- What's the expected scale?
- What are the critical dependencies?
- What are security/compliance needs?
- What's the tech stack rationale?
- What are the performance requirements?

**Validates**:
- Architecture soundness
- Technology choices
- Scalability approach
- Cost projections
- Security model

**Outputs**:
- Technical specification
- Architecture diagram
- Cost analysis
- Risk assessment

#### Product Validation Agent

**Questions it asks**:
- What's the core user need?
- Who is the target user?
- What's the MVP scope?
- How will you validate assumptions?
- What are success metrics?
- What's the user journey?
- How will you acquire users?

**Validates**:
- Problem-solution fit
- MVP definition
- User research
- Success metrics

**Outputs**:
- PRD (Product Requirements Document)
- User stories
- Success metrics
- Go-to-market plan

### Database Schema for Validation

```sql
-- Add validation tracking to facets
ALTER TABLE idea_facets ADD COLUMN validation_status TEXT DEFAULT 'pending';
  -- 'pending', 'in_progress', 'validated', 'needs_revision'
ALTER TABLE idea_facets ADD COLUMN validated_by TEXT;  -- Agent name
ALTER TABLE idea_facets ADD COLUMN validated_at TIMESTAMP;
ALTER TABLE idea_facets ADD COLUMN validation_notes JSONB;

-- Validation sessions (conversations with agents)
CREATE TABLE validation_sessions (
  id UUID PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id),
  agent_type TEXT,  -- 'business', 'technical', 'product'
  status TEXT,  -- 'active', 'completed', 'paused'

  -- Conversation tracking
  messages JSONB[],  -- Full conversation history
  current_facet TEXT,  -- Which facet being validated

  -- Validation results
  validated_facets TEXT[],
  validation_score NUMERIC,  -- 0-100
  blockers JSONB[],
  recommendations JSONB[],

  started_at TIMESTAMP,
  completed_at TIMESTAMP
)

-- Generated documents
CREATE TABLE generated_documents (
  id UUID PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id),
  document_type TEXT,  -- 'business-plan', 'prd', 'pitch-deck', 'tech-spec'

  content TEXT,  -- Markdown or rich format
  template_used TEXT,
  generated_from_facets TEXT[],

  version INT DEFAULT 1,
  status TEXT,  -- 'draft', 'reviewed', 'finalized'

  generated_at TIMESTAMP,
  generated_by TEXT  -- 'auto', 'manual', 'agent-name'
)
```

### Interactive Validation Example

**Trigger Validation**:
```
User clicks: "Validate Business Model"
  ↓
System launches Business Validation Agent
  ↓
Agent starts conversation:
  "Let's validate your restaurant concept.
   First, tell me about your target customer..."
```

**Interactive Q&A**:
```
Agent: "What's your expected customer acquisition cost?"
User: "Around $50 per customer"

Agent analyzes with facet data:
  - Revenue per customer: $30/month
  - LTV calculation: $30 × 12 months = $360
  - CAC payback: 1.67 months ✓

Agent: "Your unit economics look solid. CAC is recovered
        in under 2 months. Let's talk about churn..."
```

**Validation Results**:
```json
{
  "facet": "financials",
  "validation_status": "validated",
  "validated_by": "business-validation-agent",
  "validation_notes": {
    "cac": {
      "value": 50,
      "status": "good",
      "reasoning": "Below industry average of $75"
    },
    "ltv": {
      "value": 360,
      "status": "good",
      "reasoning": "3:1 LTV:CAC ratio is healthy"
    },
    "payback_period": {
      "value": 1.67,
      "status": "excellent",
      "reasoning": "Under 2 months is exceptional"
    },
    "recommendations": [
      "Consider loyalty program to increase LTV to $500+",
      "Monitor churn closely in first 3 months",
      "Test pricing elasticity - room to increase"
    ]
  }
}
```

### Validation Implementation Phases

**Phase 1**: Manual validation helpers
- Forms with guided questions
- Validation checklists
- Template documents
- Fill-in worksheets

**Phase 2**: AI-assisted validation
- Claude skills for each domain
- Interactive Q&A
- Auto-fill based on responses
- Suggestion engine

**Phase 3**: Specialized agents
- Dedicated validation agents
- Deep domain knowledge
- Autonomous validation
- Real-time analysis

**Phase 4**: Full automation
- AI suggests validation needs
- Auto-generates documents
- Continuous validation as idea evolves
- Learning from outcomes

---

## The Framework (AI-Optional)

### The Dual Nature of This System

The Idea Incubator is fundamentally a **thinking methodology** that can be used with or without AI. The software implementation accelerates the process, but the framework has standalone value.

```
┌─────────────────────────────────────────────┐
│         IDEA INCUBATOR FRAMEWORK             │
│                                              │
│  Core Value: Structure for Creative Minds    │
├─────────────────────────────────────────────┤
│                                              │
│  Path 1: Manual (The Methodology)            │
│   → Worksheets                               │
│   → Guided questions                         │
│   → Frameworks to fill                       │
│   → Templates                                │
│   → Book/Guide/Course                        │
│                                              │
│  Path 2: AI-Assisted (The Accelerator)       │
│   → Conversational validation                │
│   → Auto-generation                          │
│   → Intelligent suggestions                  │
│   → Real-time analysis                       │
│                                              │
│  Same foundation, different execution        │
└─────────────────────────────────────────────┘
```

### The Core Problem This Solves

**Creative minds generate ideas faster than they can be properly developed.**

Without structure, ideas get lost or remain half-formed. With too much structure, creativity gets constrained.

**The Solution**:
- **The framework provides the questions** ("What to think about")
- **The user provides the answers** (creative freedom)
- **Branches allow exploration** (safely veer off)
- **Core remains intact** (never lose the original)

This is like **jazz improvisation** - there's a structure (the chord progression), but infinite freedom within it.

### The Methodology Captures What Experts Do Naturally

When experienced entrepreneurs evaluate ideas, they ask specific questions:
- **Business**: Market size? Competition? Unit economics?
- **Technical**: Architecture? Scale? Costs?
- **Product**: User need? MVP? Metrics?

The framework **codifies this expert thinking** into a repeatable process anyone can follow.

### As a Standalone Product

**"The Idea Development Framework"** could be:
- A book
- A course
- A workshop series
- A certification program
- A coaching methodology

### Hypothetical Book Outline

#### Chapter 1: Capturing Ideas
- The Seed Format (minimal structure)
- Why most people lose ideas
- The power of incomplete capture
- **Exercise**: Capture 10 ideas in seed format

#### Chapter 2: Modular Thinking (Facets)
- **Business Facets**: Market, Revenue, Competition
- **Technical Facets**: Architecture, Stack, Scale
- **Product Facets**: User, Problem, Solution
- Add facets as thinking deepens
- **Exercise**: Take one seed, add 3 facets

#### Chapter 3: Branching & Exploration
- When to branch (exploring alternatives)
- How to maintain coherence
- Merging vs keeping separate
- **Case Study**: Restaurant concept branches
- **Exercise**: Create 2 branches for your idea

#### Chapter 4: Validation Questions
- **Business Validation Worksheet** (20 key questions)
- **Technical Validation Worksheet** (15 key questions)
- **Product Validation Worksheet** (18 key questions)
- Fill in manually or with AI assistance
- **Exercise**: Complete validation worksheet

#### Chapter 5: Evolution & Transformation
- Ideas change - that's normal
- Tracking transformations
- From seed → business idea
- Refinement from execution feedback
- **Exercise**: Document your idea's evolution

#### Chapter 6: From Idea to Execution
- When to promote to project
- Creating execution plans
- Maintaining bidirectional flow
- Refinement PRs from execution
- **Exercise**: Create execution plan

#### Appendix A: Templates
- Idea capture template
- Facet worksheets for each domain
- Validation checklists
- Document templates (business plan, PRD, tech spec)

#### Appendix B: Case Studies
- Recipe → Restaurant business
- Technical note → SaaS product
- Personal need → Startup
- Corporate innovation project

### Manual Worksheets = Software Features

Every software feature has a manual equivalent:

| Software Feature | Manual Equivalent |
|-----------------|-------------------|
| **Facets** | Thinking prompts & worksheets |
| **Branches** | Alternative exploration sheets |
| **Validation agents** | Guided question checklists |
| **Document generation** | Templates you fill |
| **Evolution tracking** | Transformation log |
| **Relationship map** | Hand-drawn connections |

The software makes it **faster, searchable, and collaborative**, but the methodology works with pen and paper.

### Why This Matters

> *"I need to figure out how to tame my creativity all the while it is still free to go. We don't lose sight of the core, but we can safely veer off if needed."*

**This framework does exactly that**:

1. **Tame**: Structure via facets, validation questions
2. **Free**: Branch without destroying main idea
3. **Core**: Original thought always preserved
4. **Veer**: Explore alternatives safely
5. **Return**: Always trace back to origins

The framework provides **guardrails for creative thinking** - not constraints, but safe spaces to explore.

### The Jazz Improvisation Analogy

- **Core idea** = The melody
- **Facets** = The chord progression
- **Branches** = Improvised solos
- **Validation** = Checking you're still in key
- **Refinement** = Coming back to the theme

You can improvise wildly (branches), but you always know where home is (core).

### Implementation Philosophy

**Phase 1: Build the software** (what we're doing now)
- Proves the methodology works
- Creates the accelerated experience
- Generates case studies

**Phase 2: Extract the methodology**
- Document the process
- Create manual worksheets
- Write the book/guide
- Build training materials

**Phase 3: Dual offering**
- Software for those who want speed/AI
- Methodology for those who prefer manual/control
- Both refer to each other

This creates **two revenue streams** from one core insight:
1. **SaaS**: The software implementation
2. **Education**: The book/course/certification

And they reinforce each other - book readers become software users, software users become methodology advocates.

---

## UI Views

### 1. Idea Tank (Main Dashboard)
- Grid/List of all ideas
- Filter by state, category, tags
- Visual indicators for branches, promotions, transformations
- Quick actions: Create, Branch, Promote, Archive

### 2. Idea Detail View
```
┌────────────────────────────────────────┐
│ Thai Curry Restaurant Concept          │
├────────────────────────────────────────┤
│ State: Exploring  │  Origin: Recipe    │
│ Branch: main      │  Active            │
│                                        │
│ [Core] [Facets] [Branches] [History]  │
│ [Relationships] [Refinements]          │
│                                        │
│ Active Facets:                         │
│  ✓ Menu Items (from recipe)           │
│  ✓ Market Research                     │
│  ✓ Location Analysis                   │
│  ✓ Financials                          │
│                                        │
│ Branches:                              │
│  • main (active) - Dine-in model       │
│  • food-truck - Mobile version         │
│  • virtual-kitchen - Delivery only     │
│                                        │
│ Related Ideas:                         │
│  ← Depends on: "Thai cuisine R&D"     │
│  → Enables: "Chef training program"    │
│                                        │
│ [+] Add Facet  [Fork Branch]          │
│ [Transform]    [Promote to Project]    │
└────────────────────────────────────────┘
```

### 3. Evolution Graph (ReactFlow)
- **Nodes**: Ideas (colored by state)
- **Edges**: Transformations, relationships
- **Visual hierarchy**: Shows idea lineage
- **Interactive**: Click to open, drag to connect
- **Filters**: By category, state, date range

### 4. Refinement Queue
- PRs waiting for review
- Context: What project, what barrier
- Actions: Accept (merge), Fork (new branch), Reject

### 5. Categories View
- Emergent taxonomy
- Hierarchical organization
- Auto-suggested based on content
- User-defined and flexible

---

## Key Operations

### Create Idea (Minimal)
```typescript
{
  title: "AI-powered recipe recommender",
  core_content: "Use dietary preferences and available ingredients to suggest recipes",
  category: "cooking",  // or auto-suggest
  tags: ["ai", "food", "personalization"]
}
// Everything else optional
```

### Add Facet
```typescript
addFacet(ideaId, {
  facet_type: "technical-specs",
  data: {
    stack: ["Next.js", "OpenAI", "PostgreSQL"],
    complexity: "medium",
    estimated_time: "2-3 weeks"
  }
})
```

### Branch Idea
```typescript
branchIdea(ideaId, {
  branch_name: "mobile-app-version",
  from_branch: "main"  // optional, defaults to current
})
```

### Transform Idea
```typescript
transformIdea(ideaId, {
  new_type: "business",
  transformation_type: "evolved-into",
  notes: "Recipe app concept evolved into meal planning SaaS"
})
```

### Promote to Project
```typescript
promoteToProject(ideaId, {
  project_name: "AI Recipe Platform",
  initial_steps_from_facets: true,  // Auto-create steps
  link_back: true  // Maintain bidirectional link
})
```

### Create Refinement PR
```typescript
createRefinement(ideaId, {
  source_project_id: projectId,
  refinement_type: "barrier-found",
  description: "User testing revealed need for offline mode",
  proposed_changes: {
    add_facets: ["offline-strategy", "caching-approach"],
    update_technical_specs: {
      new_stack_items: ["Service Worker", "IndexedDB"]
    }
  }
})
```

---

## Future Enhancements

### Phase 1: MVP (Individual Use)
- ✅ Core schema
- ✅ Basic CRUD
- ✅ Modular facets
- ✅ Simple relationships
- 🔲 Evolution tracking
- 🔲 Promotion to projects

### Phase 2: Team Collaboration
- 🔲 Multiple users
- 🔲 Permissions/visibility
- 🔲 Commenting
- 🔲 Assignment
- 🔲 Notifications

### Phase 3: AI Integration
- 🔲 MCP server for Claude/agents
- 🔲 Conversation mining (extract ideas)
- 🔲 Auto-categorization
- 🔲 Relationship suggestions
- 🔲 Facet recommendations

### Phase 4: Enterprise Features
- 🔲 Idea portfolios
- 🔲 Investment tracking
- 🔲 ROI analysis
- 🔲 Audit trails
- 🔲 Compliance features

---

## MCP Integration (Phase 3)

Once the core system is built, AI agents will have MCP access:

**Tools**:
1. `create_idea` - Capture from conversation
2. `list_ideas` - Query with filters
3. `search_ideas` - Semantic search
4. `add_facet` - Enrich idea
5. `link_ideas` - Create relationships
6. `promote_idea` - Convert to project

**Usage Example**:
```
User: "I've been thinking about a finance tracker that uses AI"

Claude (via MCP):
  → create_idea({
      title: "AI-Powered Finance Tracker",
      core_content: "Track expenses with automatic AI categorization",
      category: "finance",
      tags: ["ai", "fintech", "automation"]
    })

Claude: "I've captured that in your Idea Tank. Want to explore it further?"
```

---

## Design Principles

1. **Start Simple**: Just title + core thought minimum
2. **Grow Naturally**: Add structure when needed, not before
3. **Preserve Context**: Never lose the "why" behind decisions
4. **Enable Evolution**: Ideas change - support transformation
5. **Bidirectional Flow**: Execution → refinement → ideation
6. **Network Thinking**: Ideas connect in multiple dimensions
7. **Git Philosophy**: Version, branch, merge thinking
8. **No Forced Structure**: Organic growth over rigid templates

---

## Why This Matters

Traditional todo lists and project managers assume linear execution. But **thinking isn't linear**:

- Ideas spawn from other ideas
- Concepts transform as you learn
- Some ideas branch into alternatives
- Execution reveals flaws that require re-thinking
- Context matters years later

The Idea Incubator treats **ideas as first-class citizens** with their own lifecycle, independent of execution. This creates a **persistent knowledge graph** that grows more valuable over time.

---

*"Ideas as Code" - Version, Branch, Evolve, Execute*
