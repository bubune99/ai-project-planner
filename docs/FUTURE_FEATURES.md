# Future Features & Enhancements

This document outlines planned features and enhancements for the AI Project Planner platform.

## FlowView: Multi-Mode Architecture Visualization

### Current State (Task Execution Flow)

The FlowView currently provides:
- Interactive dependency graph for project tasks
- Phase-based grouping with custom PhaseNode components
- Task nodes showing status, agent assignment, and progress
- Highlight mode for upstream/downstream dependency visualization
- Critical path analysis to identify bottleneck tasks
- Real-time node selection and interaction

**Tech Stack:**
- `@xyflow/react` - Core flow diagram library
- Custom node types: PhaseNode, TaskNode
- ReactFlow features: MiniMap, Controls, Background grid

### Vision: Multi-Mode Visualization System

Expand FlowView to support multiple visualization modes that can be toggled based on context:

#### 1. Task Execution Flow (Current - Enhanced)
**Purpose:** Visualize project implementation sequence and dependencies

**Node Types:**
- Phase Nodes - Major project milestones
- Task Nodes - Individual implementation steps
- Milestone Nodes - Key deliverables and checkpoints
- Blocked Nodes - Tasks waiting on dependencies

**Features:**
- Dependency chain visualization
- Critical path highlighting
- Agent workload distribution
- Time-based sequencing
- Progress tracking overlay

**Use Cases:**
- Planning sprint work
- Identifying bottlenecks
- Understanding task dependencies
- Tracking project progress

---

#### 2. System Architecture View (NEW)
**Purpose:** Visualize technical architecture and component relationships

**Node Types:**
- **Service Nodes** - Microservices, APIs, backend services
  - Labels: service name, tech stack, status
  - Color coding: Running (green), Stopped (gray), Error (red)
  - Metadata: port, version, health status

- **Database Nodes** - Databases, caches, data stores
  - Types: PostgreSQL, Redis, MongoDB, etc.
  - Show: connection strings, schemas, replication status
  - Indicators: query performance, storage usage

- **Frontend Nodes** - Web apps, mobile apps, SPAs
  - Framework info (Next.js, React, etc.)
  - Build status, deployment URL
  - Performance metrics

- **External Service Nodes** - Third-party APIs, SaaS integrations
  - Provider info (Stripe, Auth0, SendGrid, etc.)
  - API key status, rate limits
  - Integration health

- **Infrastructure Nodes** - Servers, containers, edge functions
  - Cloud provider (Vercel, AWS, etc.)
  - Resource usage (CPU, memory)
  - Scaling configuration

**Edge Types:**
- **API Calls** - REST, GraphQL, gRPC connections
- **Data Flow** - Data movement between components
- **Event Streams** - Pub/sub, webhooks, event buses
- **Authentication** - OAuth flows, JWT validation
- **Dependencies** - Service dependencies and required services

**Interactive Features:**
- Click node to view detailed specs
- Show live health status indicators
- Display API endpoint documentation
- Visualize data flow on hover
- Toggle different layers (infra, services, data)

**Use Cases:**
- Onboarding new developers
- Planning architecture changes
- Debugging integration issues
- Documenting system design
- Security audit visualization

---

#### 3. Data Flow View (NEW)
**Purpose:** Visualize how data moves through the system

**Node Types:**
- Data Source Nodes (user input, APIs, databases)
- Transformation Nodes (functions, middleware, validators)
- Storage Nodes (databases, caches, file systems)
- Output Nodes (UI, APIs, webhooks)

**Edge Properties:**
- Data format (JSON, XML, binary)
- Transformation applied
- Validation rules
- Error handling paths

**Use Cases:**
- Understanding data transformations
- Identifying data quality issues
- Planning data migration
- GDPR compliance mapping

---

#### 4. Infrastructure View (NEW)
**Purpose:** Visualize deployment architecture and infrastructure

**Node Types:**
- Cloud Provider Nodes (Vercel, AWS, Azure)
- Container Nodes (Docker, Kubernetes pods)
- Edge Function Nodes (Vercel Functions, Cloudflare Workers)
- CDN Nodes (Content delivery networks)
- Load Balancer Nodes
- Region/Availability Zone Nodes

**Features:**
- Geographic distribution map
- Resource utilization metrics
- Cost per component
- Scaling policies
- Disaster recovery paths

**Use Cases:**
- Infrastructure planning
- Cost optimization
- Performance optimization
- Disaster recovery planning
- Compliance documentation

---

### Implementation Plan

#### Phase 1: Foundation (Current)
- ✅ Task execution flow with ReactFlow
- ✅ Custom node components (PhaseNode, TaskNode)
- ✅ Dependency highlighting
- ✅ Critical path analysis

#### Phase 2: Mode System
- [ ] Add view mode selector (dropdown or tabs)
- [ ] Create base architecture for multiple node type registries
- [ ] Design common node interface for all types
- [ ] Implement mode-specific layouts and styling

#### Phase 3: Architecture Nodes
- [ ] Design and implement Service Node component
- [ ] Design and implement Database Node component
- [ ] Design and implement Frontend Node component
- [ ] Design and implement External Service Node component
- [ ] Add health status indicators and live updates

#### Phase 4: Data Integration
- [ ] Connect architecture view to project's tech stack data
- [ ] Parse codebase to auto-detect services and dependencies
- [ ] Integrate with deployment platforms (Vercel API)
- [ ] Add manual node creation and editing

#### Phase 5: Advanced Features
- [ ] Auto-layout algorithms for different view types
- [ ] Export diagrams as PNG/SVG
- [ ] Collaborative editing (real-time multi-user)
- [ ] Version control for architecture diagrams
- [ ] AI-powered architecture suggestions

---

### Database Schema Considerations

To support architecture visualization, consider adding these tables:

\`\`\`sql
-- Architecture components
CREATE TABLE architecture_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  type TEXT NOT NULL, -- 'service', 'database', 'frontend', etc.
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB, -- tech stack, config, endpoints, etc.
  position JSONB, -- x, y coordinates for diagram
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Component relationships
CREATE TABLE component_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES architecture_components(id),
  target_id UUID REFERENCES architecture_components(id),
  relationship_type TEXT NOT NULL, -- 'api_call', 'data_flow', 'depends_on', etc.
  metadata JSONB, -- protocol, format, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Architecture versions (for history)
CREATE TABLE architecture_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  version_number INTEGER,
  snapshot JSONB, -- full diagram state
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

---

### Technical Considerations

**ReactFlow Advanced Features to Leverage:**
- Custom edge types for different relationship types
- Node toolbars for quick actions
- Grouping nodes (for microservice clusters)
- Zoom and pan controls
- Minimap for navigation
- Background patterns for different zones

**Performance Optimization:**
- Virtualization for large diagrams (100+ nodes)
- Lazy loading of node details
- Memoization of expensive calculations
- Web Workers for layout algorithms

**UX Enhancements:**
- Keyboard shortcuts for common actions
- Drag-and-drop from component library
- Quick search/filter nodes
- Collapsible node groups
- Context menus on right-click
- Undo/redo support

**Integration Points:**
- MCP server can expose architecture data to Claude
- Claude can suggest architecture improvements
- Auto-sync with git repository structure
- Import from infrastructure-as-code (Terraform, etc.)
- Export to documentation formats (Markdown, PDF)

---

### Example: Service Node Component

\`\`\`typescript
interface ServiceNodeData {
  label: string
  type: 'rest-api' | 'graphql' | 'microservice' | 'edge-function'
  status: 'running' | 'stopped' | 'error' | 'deploying'
  techStack: string[] // ['Next.js', 'TypeScript', 'PostgreSQL']
  endpoints?: {
    path: string
    method: string
    description: string
  }[]
  healthCheck?: {
    status: 'healthy' | 'degraded' | 'down'
    lastCheck: Date
    uptime: number
  }
  deployment?: {
    url: string
    provider: 'vercel' | 'aws' | 'azure'
    region: string
  }
}

export function ServiceNode({ data }: { data: ServiceNodeData }) {
  // Render service with status indicator, tech stack badges,
  // and interactive health check display
}
\`\`\`

---

### Related Features

These complementary features would enhance the architecture visualization:

1. **Architecture Template Library**
   - Pre-built templates for common architectures
   - MERN stack, JAMstack, Microservices, Serverless
   - One-click import of standard patterns

2. **Dependency Scanner**
   - Auto-detect architecture from package.json, Dockerfile, etc.
   - Parse API routes and generate service nodes
   - Detect database connections from environment variables

3. **Cost Calculator**
   - Estimate infrastructure costs from architecture
   - Show cost per component
   - Optimize suggestions for cost reduction

4. **Security Audit View**
   - Highlight security boundaries
   - Show authentication flows
   - Identify unencrypted connections

5. **Documentation Generator**
   - Auto-generate architecture docs from diagram
   - Export to Markdown, PDF, or interactive HTML
   - Keep docs in sync with actual architecture

---

## Priority & Timeline

**High Priority** (Next 2-3 months):
- Complete task execution flow enhancements
- Remove all mock data dependencies
- Implement mode selector foundation

**Medium Priority** (3-6 months):
- Architecture node components
- Service/database visualization
- Auto-detection from codebase

**Low Priority** (6+ months):
- Data flow and infrastructure views
- Advanced features (collaboration, AI suggestions)
- Template library and cost calculator

---

## Related Documentation

- Current FlowView implementation: `components/views/FlowView.tsx`
- ReactFlow docs: https://reactflow.dev
- Node component examples: `components/views/PhaseNode.tsx`, `TaskNode.tsx`
- Architecture inspiration: Check user's other project with architecture visualization

---

*Last Updated: 2025-11-22*
*Status: Vision Document - Not yet implemented*
