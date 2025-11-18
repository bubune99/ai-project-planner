"use client"

import { useState } from "react"
import type { GanttTask } from "@/lib/types"

interface GanttTimelineProps {
  tasks: GanttTask[]
  startDate: Date
  endDate: Date
  onTaskClick?: (task: GanttTask) => void
  selectedTaskId?: string
  showDependencies: boolean
  tasksByPhase: Record<number, GanttTask[]>
}

const phaseColors = {
  1: { bg: "bg-green-500", dark: "bg-green-600" },
  2: { bg: "bg-blue-500", dark: "bg-blue-600" },
  3: { bg: "bg-purple-500", dark: "bg-purple-600" },
  4: { bg: "bg-orange-500", dark: "bg-orange-600" },
}

export function GanttTimeline({
  tasks,
  startDate,
  endDate,
  onTaskClick,
  selectedTaskId,
  showDependencies,
  tasksByPhase,
}: GanttTimelineProps) {
  const [hoveredTask, setHoveredTask] = useState<string | null>(null)
  const [draggedTask, setDraggedTask] = useState<string | null>(null)

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  const getTaskPosition = (task: GanttTask) => {
    const taskStart = Math.max(0, Math.ceil((task.startDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
    const taskDuration = Math.ceil((task.endDate.getTime() - task.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const left = (taskStart / totalDays) * 100
    const width = (taskDuration / totalDays) * 100

    return { left: `${left}%`, width: `${width}%` }
  }

  const isMilestone = (task: GanttTask) => {
    return task.id.includes("milestone")
  }

  return (
    <div className="relative min-w-[800px]">
      {/* Grid lines */}
      <div className="absolute inset-0 flex pointer-events-none">
        {Array.from({ length: totalDays }).map((_, i) => (
          <div key={i} className="flex-1 border-r border-border/30" />
        ))}
      </div>

      {/* Today indicator */}
      {(() => {
        const today = new Date()
        if (today >= startDate && today <= endDate) {
          const todayPosition =
            ((today.getTime() - startDate.getTime()) / (endDate.getTime() - startDate.getTime())) * 100
          return (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
              style={{ left: `${todayPosition}%` }}
            >
              <div className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rounded-full" />
            </div>
          )
        }
        return null
      })()}

      <div className="relative">
        {Object.entries(tasksByPhase).map(([phase, phaseTasks]) => {
          const phaseTask: GanttTask = {
            id: `phase-${phase}`,
            name: `Phase ${phase}`,
            agent: phaseTasks[0].agent,
            startDate: phaseTasks[0].startDate,
            endDate: phaseTasks[phaseTasks.length - 1].endDate,
            progress: Math.round(phaseTasks.reduce((sum, t) => sum + t.progress, 0) / phaseTasks.length),
            dependencies: [],
            phase: Number(phase),
            status: phaseTasks.every((t) => t.status === "completed")
              ? "completed"
              : phaseTasks.some((t) => t.status === "in_progress")
                ? "in_progress"
                : "pending",
          }

          return (
            <div key={phase}>
              {/* Phase header row */}
              <div className="h-10 border-b border-border" />

              {/* Phase tasks */}
              {phaseTasks.map((task) => {
                const position = getTaskPosition(task)
                const colors = phaseColors[task.phase as keyof typeof phaseColors]
                const isHovered = hoveredTask === task.id
                const isSelected = selectedTaskId === task.id
                const isDragged = draggedTask === task.id
                const opacity =
                  task.status === "completed" || task.status === "in_progress" ? "opacity-100" : "opacity-50"

                if (isMilestone(task)) {
                  return (
                    <div
                      key={task.id}
                      className="h-10 flex items-center relative border-b border-border"
                      style={{ paddingLeft: position.left }}
                    >
                      <div
                        className={`w-4 h-4 ${colors.bg} rotate-45 cursor-pointer hover:scale-125 transition-transform z-10`}
                        onClick={() => onTaskClick?.(task)}
                        onMouseEnter={() => setHoveredTask(task.id)}
                        onMouseLeave={() => setHoveredTask(null)}
                        title={task.name}
                      />
                      {isHovered && (
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-popover border border-border rounded-md p-2 shadow-lg z-30 whitespace-nowrap">
                          <div className="text-xs font-semibold text-foreground">{task.name}</div>
                          <div className="text-xs text-muted-foreground">{task.startDate.toLocaleDateString()}</div>
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <div key={task.id} className="h-10 flex items-center relative border-b border-border">
                    <div
                      className={`absolute h-6 rounded ${colors.bg} ${opacity} cursor-pointer transition-all ${
                        isHovered || isSelected ? "h-7 shadow-lg" : ""
                      } ${isDragged ? "cursor-grabbing" : "cursor-grab"}`}
                      style={position}
                      onClick={() => onTaskClick?.(task)}
                      onMouseEnter={() => setHoveredTask(task.id)}
                      onMouseLeave={() => setHoveredTask(null)}
                      onMouseDown={() => setDraggedTask(task.id)}
                      onMouseUp={() => {
                        if (draggedTask) {
                          setDraggedTask(null)
                        }
                      }}
                    >
                      {/* Progress fill */}
                      <div
                        className={`h-full ${colors.dark} rounded-l transition-all`}
                        style={{ width: `${task.progress}%` }}
                      />

                      {/* Hover tooltip */}
                      {isHovered && (
                        <div className="absolute left-0 -top-24 bg-popover border border-border rounded-md p-3 shadow-lg z-30 whitespace-nowrap">
                          <div className="text-sm font-semibold text-foreground mb-1">{task.name}</div>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <div>Agent: {task.agent.name}</div>
                            <div>
                              {task.startDate.toLocaleDateString()} - {task.endDate.toLocaleDateString()}
                            </div>
                            <div>Progress: {task.progress}%</div>
                            {task.dependencies.length > 0 && <div>Dependencies: {task.dependencies.length}</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
