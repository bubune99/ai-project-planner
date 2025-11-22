"use client"

import { useState } from "react"
import { TreeNode } from "./TreeNode"
import { TaskDetails } from "./TaskDetails"
import type { Task, Phase } from "@/lib/types"

interface TreeViewProps {
  phases?: Phase[]
  projectName?: string
  onTaskSelect?: (task: Task | null) => void
}

export function TreeView({ phases, projectName, onTaskSelect }: TreeViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false)

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task)
    onTaskSelect?.(task)
    setIsDetailsCollapsed(false)
  }

  // Use provided phases or show empty state
  const treeData = Array.isArray(phases) && phases.length > 0 ? phases : []
  const displayName = projectName || 'Project'

  return (
    <div className="flex gap-6 h-full">
      {/* Tree Structure */}
      <div className="flex-1 space-y-1 overflow-y-auto pr-4">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
          <span className="text-lg">📁</span>
          <h2 className="text-lg font-semibold text-foreground">{displayName}</h2>
        </div>

        {treeData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg mb-2">No steps defined yet</p>
            <p className="text-sm">Create your first step to start tracking your project progress!</p>
          </div>
        ) : (
          treeData.map((phase) => (
            <TreeNode
              key={phase.id}
              phase={phase}
              level={0}
              selectedTaskId={selectedTask?.id}
              onTaskSelect={handleTaskSelect}
            />
          ))
        )}
      </div>

      {/* Task Details Panel */}
      {selectedTask && (
        <TaskDetails
          task={selectedTask}
          isCollapsed={isDetailsCollapsed}
          onToggleCollapse={() => setIsDetailsCollapsed(!isDetailsCollapsed)}
        />
      )}
    </div>
  )
}
