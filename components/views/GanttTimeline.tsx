"use client"

import { useMemo, useState } from "react"
import type { GanttTask } from "@/lib/types"
import { barRect, dayTicks, monthBands, rollupProgress, todayPct } from "@/lib/scheduling"

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

/** Phases are user data and can be any number (or NaN from text phases) — cycle the palette instead of crashing. */
function colorsFor(phase: number): { bg: string; dark: string } {
  const keys = [1, 2, 3, 4] as const
  const idx = Number.isFinite(phase) && phase > 0 ? ((phase - 1) % keys.length) + 1 : 1
  return phaseColors[idx as keyof typeof phaseColors]
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

  /*
    Geometry lives in lib/scheduling.ts now, with 46 assertions over it. It was
    inline percentage arithmetic here, which meant the only way to find out
    whether a bar landed on the right day was to look at the chart — and a
    chart that puts bars in the wrong place looks exactly like one that does
    not. barRect also clamps a bar that starts before the window instead of
    letting it render at a negative offset, which the old maths did via
    Math.max(0, …) on the start but not on the width.
  */
  const bands = useMemo(() => monthBands(startDate, endDate), [startDate, endDate])
  const ticks = useMemo(() => dayTicks(startDate, endDate), [startDate, endDate])
  const totalDays = ticks.length

  /*
    A day column narrower than ~22px cannot hold a two-digit date, so label
    every nth one and leave the rest as rules. The month band above carries
    the actual "when" — day numbers repeat every month and say nothing alone.
  */
  const labelEvery = totalDays <= 31 ? 1 : totalDays <= 62 ? 2 : totalDays <= 120 ? 7 : 14

  const getTaskPosition = (task: GanttTask) => {
    const r = barRect({ start: task.startDate, end: task.endDate }, startDate, endDate)
    if (!r) return null
    return { left: `${r.leftPct}%`, width: `${r.widthPct}%` }
  }

  const isMilestone = (task: GanttTask) => {
    return task.id.includes("milestone")
  }

  const todayLeft = todayPct(startDate, endDate)

  return (
    <div className="relative min-w-[800px]">
      {/*
        The date header. This chart previously had none: it drew one unlabelled
        rule per day, so you could see that a bar was long without being able
        to tell when it was. The month band is the row that answers "when" —
        the day numbers beneath it repeat every month and mean nothing on their
        own. Both rows are positioned from the same geometry as the bars, so
        columns cannot drift away from what they label.
      */}
      <div className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="relative h-6">
          {bands.map((b) => (
            <div
              key={b.key}
              className="absolute top-0 h-6 flex items-center border-r border-border/60 px-2 text-[11px] font-medium text-muted-foreground overflow-hidden whitespace-nowrap"
              style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
              title={b.label}
            >
              {b.label}
            </div>
          ))}
        </div>
        <div className="relative h-5">
          {ticks.map((t, i) => (
            <div
              key={t.key}
              className="absolute top-0 h-5 flex items-center justify-center border-r border-border/30 text-[10px] tabular-nums text-muted-foreground"
              style={{ left: `${t.leftPct}%`, width: `${t.widthPct}%` }}
            >
              {i % labelEvery === 0 ? t.label : ""}
            </div>
          ))}
        </div>
      </div>

      {/* Grid lines */}
      <div className="absolute inset-0 flex pointer-events-none">
        {Array.from({ length: totalDays }).map((_, i) => (
          <div key={i} className="flex-1 border-r border-border/30" />
        ))}
      </div>

      {/* Today indicator */}
      {(() => {
        if (todayLeft !== null) {
          return (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
              style={{ left: `${todayLeft}%` }}
            >
              <div className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rounded-full" />
            </div>
          )
        }
        return null
      })()}

      <div className="relative">
        {Object.entries(tasksByPhase).map(([phase, phaseTasks]) => {
          /*
            The phase span was taken from phaseTasks[0] and the last element,
            which is only right if the array happens to be date-sorted. It is
            grouped by phase, not sorted by date, so a phase whose first step
            started late reported a span that began late — and a rollup bar
            drawn from it would simply be wrong. Min/max over the group.
          */
          const spanStart = new Date(Math.min(...phaseTasks.map((t) => t.startDate.getTime())))
          const spanEnd = new Date(Math.max(...phaseTasks.map((t) => t.endDate.getTime())))
          const rollup = rollupProgress(phaseTasks)
          const rollupRect = barRect({ start: spanStart, end: spanEnd }, startDate, endDate)

          return (
            <div key={phase}>
              {/*
                Phase header row. This was an empty div: the rollup above was
                computed and thrown away, so a phase line showed nothing at all
                while every one of its children drew a bar. The summary bar is
                the row that tells you whether a phase is on track without
                reading each step under it.
              */}
              <div className="h-10 border-b border-border relative flex items-center">
                {rollupRect && (
                  <div
                    className="absolute h-2.5 rounded-sm bg-muted-foreground/30 ring-1 ring-inset ring-border"
                    style={{ left: `${rollupRect.leftPct}%`, width: `${rollupRect.widthPct}%` }}
                    title={`${phaseTasks.length} step${phaseTasks.length === 1 ? "" : "s"}${rollup !== null ? ` · ${rollup}% complete` : ""}`}
                  >
                    {rollup !== null && rollup > 0 && (
                      <div
                        className="h-full rounded-sm bg-foreground/50"
                        style={{ width: `${Math.min(100, rollup)}%` }}
                      />
                    )}
                  </div>
                )}
                {rollupRect && rollup !== null && (
                  <span
                    className="absolute text-[10px] tabular-nums text-muted-foreground"
                    style={{ left: `calc(${rollupRect.leftPct}% + ${rollupRect.widthPct}% + 6px)` }}
                  >
                    {rollup}%
                  </span>
                )}
              </div>

              {/* Phase tasks */}
              {phaseTasks.map((task) => {
                const position = getTaskPosition(task)
                /*
                  barRect returns null when a task falls entirely outside the
                  visible range. Keep the row — its label still belongs in the
                  list — but draw no bar, rather than rendering one at a
                  nonsense offset. The old maths clamped the start to 0 and
                  left the width unclamped, so an out-of-range task drew a bar
                  of the wrong length at the left edge.
                */
                if (!position) {
                  return (
                    <div
                      key={task.id}
                      className="h-10 flex items-center relative border-b border-border"
                      title={`${task.name} — outside the visible range`}
                    />
                  )
                }
                const colors = colorsFor(Number(task.phase))
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
