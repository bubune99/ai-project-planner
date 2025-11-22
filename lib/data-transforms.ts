import type { Phase, Task, DocSection, DocItem } from "./types"

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
