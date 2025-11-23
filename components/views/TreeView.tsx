"use client"

import { useState } from "react"
import { TreeNode } from "./TreeNode"
import { TaskDetails } from "./TaskDetails"
import { StepFormModal } from "@/components/steps/StepFormModal"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { Task, Phase } from "@/lib/types"

interface TreeViewProps {
  phases?: Phase[]
  projectName?: string
  projectId: string
  onTaskSelect?: (task: Task | null) => void
  onRefresh?: () => void
}

export function TreeView({ phases, projectName, projectId, onTaskSelect, onRefresh }: TreeViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false)
  const [showStepForm, setShowStepForm] = useState(false)

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task)
    onTaskSelect?.(task)
    setIsDetailsCollapsed(false)
  }

  // Use provided phases or show empty state
  const treeData = Array.isArray(phases) && phases.length > 0 ? phases : []
  const displayName = projectName || "Project"

  // Flatten all tasks for dependencies
  const allTasks = treeData.flatMap((phase) => phase.tasks)

  return (
    <>
      <div className="flex gap-6 h-full">
        {/* Tree Structure */}
        <div className="flex-1 space-y-1 overflow-y-auto pr-4">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-lg">📁</span>
              <h2 className="text-lg font-semibold text-foreground">{displayName}</h2>
            </div>
            <Button onClick={() => setShowStepForm(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Create Step
            </Button>
          </div>

          {treeData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg mb-2">No steps defined yet</p>
              <p className="text-sm mb-4">Create your first step to start tracking your project progress!</p>
              <Button onClick={() => setShowStepForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Step
              </Button>
            </div>
          ) : (
            treeData.map((phase) => (
              <TreeNode
                key={phase.id}
                phase={phase}
                level={0}
                selectedTaskId={selectedTask?.id}
                onTaskSelect={handleTaskSelect}
                onEdit={(task) => {
                  setSelectedTask(task)
                  setShowStepForm(true)
                }}
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
            onEdit={() => setShowStepForm(true)}
          />
        )}
      </div>

      <StepFormModal
        open={showStepForm}
        onClose={() => {
          setShowStepForm(false)
          setSelectedTask(null)
        }}
        projectId={projectId}
        step={selectedTask}
        availableSteps={allTasks}
        onSuccess={() => {
          onRefresh?.()
          setSelectedTask(null)
        }}
      />
    </>
  )
}
