import type { Phase, Task, DocSection, DocItem } from "./types"
import type { Node, Edge } from "@xyflow/react"

/**
 * Normalize status values from database (hyphenated) to UI format (underscored)
 */
function normalizeStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'in-progress': 'in_progress',
    'on-hold': 'on_hold',
  }
  return statusMap[status] || status
}

/**
 * Agent colors for consistent styling
 */
const agentColors: Record<string, string> = {
  v0: '#3b82f6',      // blue
  claude: '#8b5cf6',  // purple
  gemini: '#10b981',  // green
  gpt: '#f59e0b',     // amber
  human: '#6b7280',   // gray
}

/**
 * Transform database steps into React Flow nodes and edges for FlowView
 */
export function transformStepsToFlow(steps: any[]): { nodes: Node[], edges: Edge[] } {
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return { nodes: [], edges: [] }
  }

  try {
    const nodes: Node[] = []
    const edges: Edge[] = []
    const phaseMap = new Map<string, any[]>()

    // Group steps by phase
    steps.forEach((step) => {
      if (!step) return
      const phase = step.phase || step.current_phase || 'Uncategorized'
      if (!phaseMap.has(phase)) {
        phaseMap.set(phase, [])
      }
      phaseMap.get(phase)!.push(step)
    })

    // Layout constants
    const PHASE_WIDTH = 300
    const PHASE_GAP = 100
    const NODE_HEIGHT = 80
    const NODE_GAP = 20
    const START_X = 50
    const START_Y = 50

    let phaseIndex = 0
    const stepIdToNodeId = new Map<string, string>()

    // Create phase nodes and task nodes
    phaseMap.forEach((phaseSteps, phaseName) => {
      const phaseX = START_X + (phaseIndex * (PHASE_WIDTH + PHASE_GAP))
      const phaseId = `phase-${phaseIndex}`

      // Calculate phase progress
      const completedSteps = phaseSteps.filter(s => s?.status === 'completed').length
      const progress = phaseSteps.length > 0
        ? Math.round((completedSteps / phaseSteps.length) * 100)
        : 0

      // Add phase node
      nodes.push({
        id: phaseId,
        type: 'phaseNode',
        position: { x: phaseX, y: START_Y },
        data: {
          label: phaseName,
          progress,
          taskCount: phaseSteps.length,
          completedCount: completedSteps,
          type: 'phase',
        },
      })

      // Add task nodes within this phase
      phaseSteps.forEach((step, stepIndex) => {
        if (!step) return

        const nodeId = step.id || `task-${phaseIndex}-${stepIndex}`
        stepIdToNodeId.set(step.id, nodeId)

        const agent = step.assigned_agent || step.agent_type || 'human'
        const agentColor = agentColors[agent] || agentColors.human

        nodes.push({
          id: nodeId,
          type: 'taskNode',
          position: {
            x: phaseX + 20,
            y: START_Y + 80 + (stepIndex * (NODE_HEIGHT + NODE_GAP)),
          },
          data: {
            label: step.title || step.name || 'Untitled Task',
            description: step.description || '',
            status: normalizeStatus(step.status || 'pending'),
            priority: step.priority || 'medium',
            agent: { name: agent, color: agentColor },
            estimatedTime: step.estimated_hours ? `${step.estimated_hours}h` : '',
            type: 'task',
          },
        })
      })

      phaseIndex++
    })

    // Create edges from dependencies
    steps.forEach((step) => {
      if (!step?.id) return

      const targetNodeId = stepIdToNodeId.get(step.id)
      if (!targetNodeId) return

      // Handle dependencies array
      const deps = step.dependencies || step.depends_on || []
      if (Array.isArray(deps)) {
        deps.forEach((dep: any) => {
          const depId = typeof dep === 'string' ? dep : dep?.id
          const sourceNodeId = stepIdToNodeId.get(depId)

          if (sourceNodeId && targetNodeId) {
            edges.push({
              id: `edge-${sourceNodeId}-${targetNodeId}`,
              source: sourceNodeId,
              target: targetNodeId,
              type: 'smoothstep',
              animated: step.status === 'in-progress',
              data: {
                type: dep?.type || 'required',
                isCriticalPath: dep?.critical || false,
              },
            })
          }
        })
      }
    })

    return { nodes, edges }
  } catch (error) {
    console.error('Error in transformStepsToFlow:', error)
    return { nodes: [], edges: [] }
  }
}

/**
 * Transform flat database steps into hierarchical phase structure for TreeView
 * Groups steps by phase and converts them to the expected format
 */
export function transformStepsToPhases(steps: any[]): Phase[] {
  // Extra defensive null checks
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return []
  }

  try {
    // Group steps by phase
    const phaseMap = new Map<string, any[]>()

    steps.forEach((step) => {
      if (!step) return // Skip null/undefined steps

      const phase = step.phase || step.current_phase || 'Uncategorized'
      if (!phaseMap.has(phase)) {
        phaseMap.set(phase, [])
      }
      phaseMap.get(phase)!.push(step)
    })

    // Convert to Phase structure
    const phases: Phase[] = []
    let phaseIndex = 1

    phaseMap.forEach((phaseSteps, phaseName) => {
      const phaseId = `phase-${phaseIndex}`

      // Calculate phase progress and status
      const completedSteps = phaseSteps.filter(s => s && s.status === 'completed').length
      const totalSteps = phaseSteps.length
      const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

      // Determine phase status
      let status: 'completed' | 'in-progress' | 'pending' = 'pending'
      if (progress === 100) {
        status = 'completed'
      } else if (progress > 0) {
        status = 'in-progress'
      }

      // Convert steps to tasks
      const tasks: Task[] = phaseSteps
        .filter(step => step != null) // Filter out null/undefined
        .map((step, index) => ({
          id: step.id || `task-${phaseIndex}-${index}`,
          name: step.name || step.title || 'Untitled Task',
          description: step.description || '',
          agent: step.assigned_agent || step.agent_type || 'human',
          status: step.status || 'pending',
          estimatedTime: step.estimated_duration || '',
          actualTime: step.actual_duration || '',
          dependencies: Array.isArray(step.dependencies) ? step.dependencies : [],
        }))

      phases.push({
        id: phaseId,
        name: phaseName,
        progress,
        status,
        tasks,
        subtasks: [], // For now, no nested subtasks
      })

      phaseIndex++
    })

    return phases
  } catch (error) {
    console.error('Error in transformStepsToPhases:', error)
    return []
  }
}

/**
 * Transform database steps into flat task list
 */
export function transformStepsToTasks(steps: any[]): Task[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    return []
  }

  return steps.map((step, index) => ({
    id: step.id || `task-${index}`,
    name: step.name || step.title || 'Untitled Task',
    description: step.description || '',
    agent: step.assigned_agent || step.agent_type || 'human',
    status: step.status || 'pending',
    estimatedTime: step.estimated_duration || '',
    actualTime: step.actual_duration || '',
    dependencies: Array.isArray(step.dependencies) ? step.dependencies : [],
  }))
}

/**
 * Transform database documents into hierarchical DocSection structure for DocsView
 * Groups documents by category and converts them to the expected format
 */
export function transformDocumentsToSections(documents: any[]): DocSection[] {
  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    return []
  }

  try {
    // Group documents by category
    const categoryMap = new Map<string, any[]>()

    documents.forEach((doc) => {
      if (!doc) return

      const category = doc.category || doc.doc_type || 'General'
      if (!categoryMap.has(category)) {
        categoryMap.set(category, [])
      }
      categoryMap.get(category)!.push(doc)
    })

    // Category icon mapping
    const categoryIcons: Record<string, string> = {
      'Getting Started': '📚',
      'Architecture': '🏗️',
      'API Documentation': '🔌',
      'UI/UX': '🎨',
      'Testing': '🧪',
      'Deployment': '🚀',
      'General': '📄',
      'requirements': '📋',
      'api': '🔌',
      'architecture': '🏗️',
      'ui_ux': '🎨',
      'testing': '🧪',
      'deployment': '🚀',
      'general': '📄',
    }

    // Convert to DocSection structure
    const sections: DocSection[] = []

    categoryMap.forEach((categoryDocs, categoryName) => {
      const items: DocItem[] = categoryDocs.map((doc) => ({
        id: doc.id,
        name: doc.title || 'Untitled Document',
        icon: '📄',
        type: 'markdown',
        content: doc.content || '',
        lastUpdated: doc.updated_at ? new Date(doc.updated_at).toLocaleDateString() : undefined,
        updatedBy: doc.last_edited_by || undefined,
      }))

      sections.push({
        id: categoryName.toLowerCase().replace(/\s+/g, '-'),
        name: categoryName,
        icon: categoryIcons[categoryName] || '📁',
        expanded: true,
        items,
      })
    })

    return sections
  } catch (error) {
    console.error('Error in transformDocumentsToSections:', error)
    return []
  }
}
