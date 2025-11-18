"use client"

import { useState } from "react"
import { TreeNode } from "./TreeNode"
import { TaskDetails } from "./TaskDetails"
import { mockTreeData } from "@/lib/mock-data"
import type { Task } from "@/lib/types"

interface TreeViewProps {
  onTaskSelect?: (task: Task | null) => void
}

export function TreeView({ onTaskSelect }: TreeViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false)

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task)
    onTaskSelect?.(task)
    setIsDetailsCollapsed(false)
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Tree Structure */}
      <div className="flex-1 space-y-1 overflow-y-auto pr-4">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
          <span className="text-lg">📁</span>
          <h2 className="text-lg font-semibold text-foreground">E-commerce Platform</h2>
        </div>

        {mockTreeData.map((phase) => (
          <TreeNode
            key={phase.id}
            phase={phase}
            level={0}
            selectedTaskId={selectedTask?.id}
            onTaskSelect={handleTaskSelect}
          />
        ))}
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
