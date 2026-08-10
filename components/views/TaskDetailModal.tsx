"use client"

import { useEffect, useState } from "react"
import type { BoardStep, StepStatus } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  CalendarIcon,
  CheckCircle2,
  Link2,
  Pencil,
  PlayCircle,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"
import { format } from "date-fns"
import { AGENT_AVATAR, STATUS_COLUMNS, STATUS_LABELS, normalizeChecklist } from "./kanban-config"

interface TaskDetailModalProps {
  step: BoardStep | null
  subtasks: BoardStep[]
  allSteps: BoardStep[]
  phases: string[]
  open: boolean
  onClose: () => void
  onPatch: (stepId: string, patch: Record<string, unknown>) => Promise<void>
  onCreateSubtask: (parentId: string, title: string) => Promise<void>
  onDelete: (step: BoardStep) => void
  onEditFull: (step: BoardStep) => void
}

const NONE = "__none__"
const statusDot = Object.fromEntries(STATUS_COLUMNS.map((c) => [c.key, c.dotClass]))

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (iso: string | null) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs font-normal">
              <CalendarIcon className="w-3 h-3 mr-1.5" />
              {value ? format(new Date(value), "MMM d, yyyy") : "Set date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarPicker
              mode="single"
              selected={value ? new Date(value) : undefined}
              onSelect={(d) => onChange(d ? d.toISOString() : null)}
            />
          </PopoverContent>
        </Popover>
        {value && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onChange(null)} title="Clear">
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function TaskDetailModal({
  step,
  subtasks,
  allSteps,
  phases,
  open,
  onClose,
  onPatch,
  onCreateSubtask,
  onDelete,
  onEditFull,
}: TaskDetailModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [estimate, setEstimate] = useState("")
  const [actual, setActual] = useState("")
  const [progress, setProgress] = useState(0)
  const [newChecklistItem, setNewChecklistItem] = useState("")
  const [newSubtask, setNewSubtask] = useState("")

  useEffect(() => {
    if (step) {
      setTitle(step.title)
      setDescription(step.description ?? "")
      setEstimate(step.estimated_hours ? String(Number(step.estimated_hours)) : "")
      setActual(step.actual_hours ? String(Number(step.actual_hours)) : "")
      setProgress(step.progress ?? 0)
    }
  }, [step])

  if (!step) return null

  const patch = (body: Record<string, unknown>) => onPatch(step.id, body)
  const checklist = normalizeChecklist(step.tasks)
  const criteria = Array.isArray(step.acceptance_criteria) ? step.acceptance_criteria : []
  const deps = Array.isArray(step.dependencies) ? step.dependencies : []
  const stepTitle = (id: string) => allSteps.find((s) => s.id === id)?.title ?? "Unknown step"

  const advance =
    step.status === "in-progress"
      ? { label: "Mark complete", icon: CheckCircle2, next: "completed" as StepStatus }
      : step.status === "completed"
        ? { label: "Reopen", icon: RotateCcw, next: "pending" as StepStatus }
        : { label: "Start", icon: PlayCircle, next: "in-progress" as StepStatus }

  const toggleChecklistItem = (index: number) => {
    const next = checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c))
    patch({ tasks: next })
  }

  const removeChecklistItem = (index: number) => {
    patch({ tasks: checklist.filter((_, i) => i !== index) })
  }

  const addChecklistItem = () => {
    const t = newChecklistItem.trim()
    if (!t) return
    patch({ tasks: [...checklist, { title: t, done: false }] })
    setNewChecklistItem("")
  }

  const toggleCriteria = (index: number) => {
    const next = criteria.map((c, i) => (i === index ? { ...c, done: !c.done } : c))
    patch({ acceptance_criteria: next })
  }

  const addSubtask = async () => {
    const t = newSubtask.trim()
    if (!t) return
    await onCreateSubtask(step.id, t)
    setNewSubtask("")
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            {/* Status pill + advance */}
            <Select value={step.status} onValueChange={(v) => patch({ status: v })}>
              <SelectTrigger className="w-[150px] h-8">
                <span className={`w-2 h-2 rounded-full mr-1.5 ${statusDot[step.status]}`} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_COLUMNS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${c.dotClass}`} />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={() => patch({ status: advance.next })}>
              <advance.icon className="w-3.5 h-3.5 mr-1.5" />
              {advance.label}
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditFull(step)} title="Full edit">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-600"
              onClick={() => onDelete(step)}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <DialogTitle asChild>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const t = title.trim()
                if (t && t !== step.title) patch({ title: t })
              }}
              className="text-lg font-semibold border-transparent hover:border-input focus:border-input px-2 -mx-2 mt-1"
            />
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-[1fr_240px] gap-6">
          {/* Main column */}
          <div className="space-y-5 min-w-0">
            {/* Description */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Description
              </h4>
              <Textarea
                value={description}
                rows={3}
                placeholder="Add a description…"
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== (step.description ?? "")) patch({ description })
                }}
              />
            </div>

            {/* Subtasks */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Subtasks{" "}
                {subtasks.length > 0 && (
                  <span className="normal-case font-normal">
                    · {subtasks.filter((s) => s.status === "completed").length}/{subtasks.length}
                  </span>
                )}
              </h4>
              <div className="space-y-1">
                {subtasks.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2 text-sm group/sub rounded px-1.5 py-1 hover:bg-accent/40">
                    <Checkbox
                      checked={sub.status === "completed"}
                      onCheckedChange={(checked) =>
                        onPatch(sub.id, { status: checked ? "completed" : "pending" })
                      }
                    />
                    <span className={sub.status === "completed" ? "line-through text-muted-foreground" : ""}>
                      {sub.title}
                    </span>
                  </div>
                ))}
                <div className="flex gap-1.5 items-center pt-1">
                  <Input
                    value={newSubtask}
                    placeholder="Add subtask…"
                    className="h-7 text-sm"
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={addSubtask}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Checklist{" "}
                {checklist.length > 0 && (
                  <span className="normal-case font-normal">
                    · {checklist.filter((c) => c.done).length}/{checklist.length}
                  </span>
                )}
              </h4>
              <div className="space-y-1">
                {checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm group/chk rounded px-1.5 py-1 hover:bg-accent/40">
                    <Checkbox checked={item.done} onCheckedChange={() => toggleChecklistItem(i)} />
                    <span className={`flex-1 ${item.done ? "line-through text-muted-foreground" : ""}`}>
                      {item.title}
                    </span>
                    <button
                      onClick={() => removeChecklistItem(i)}
                      className="opacity-0 group-hover/chk:opacity-100 text-muted-foreground hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5 items-center pt-1">
                  <Input
                    value={newChecklistItem}
                    placeholder="Add checklist item…"
                    className="h-7 text-sm"
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addChecklistItem()}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={addChecklistItem}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Acceptance criteria */}
            {criteria.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Acceptance criteria
                </h4>
                <div className="space-y-1">
                  {criteria.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm rounded px-1.5 py-1 hover:bg-accent/40">
                      <Checkbox className="mt-0.5" checked={!!c.done} onCheckedChange={() => toggleCriteria(i)} />
                      <div className="min-w-0">
                        <span className={c.done ? "line-through text-muted-foreground" : ""}>{c.description}</span>
                        {c.testCommand && (
                          <code className="block text-xs text-muted-foreground truncate">{c.testCommand}</code>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dependencies */}
            {deps.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Waiting on
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {deps.map((d) => (
                    <Badge key={d.depends_on_step_id} variant="secondary" className="gap-1 font-normal">
                      <Link2 className="w-3 h-3" />
                      {stepTitle(d.depends_on_step_id)}
                      {d.dependency_type === "soft" && <span className="text-muted-foreground">(soft)</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Meta sidebar */}
          <div className="space-y-3 md:border-l md:border-border md:pl-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Priority</span>
              <Select
                value={step.priority ?? NONE}
                onValueChange={(v) => patch({ priority: v === NONE ? null : v })}
              >
                <SelectTrigger className="h-7 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value={NONE}>None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Agent</span>
              <Select
                value={step.assigned_agent ?? NONE}
                onValueChange={(v) => patch({ assigned_agent: v === NONE ? null : v })}
              >
                <SelectTrigger className="h-7 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(AGENT_AVATAR).map((a) => (
                    <SelectItem key={a} value={a}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${AGENT_AVATAR[a]}`} />
                        {a}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {phases.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Phase</span>
                <Select value={step.phase || undefined} onValueChange={(v) => patch({ phase: v })}>
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue placeholder="Set phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {phases.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DateField label="Start" value={step.start_date} onChange={(iso) => patch({ start_date: iso })} />
            <DateField label="Due" value={step.end_date} onChange={(iso) => patch({ end_date: iso })} />

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Estimate (h)</span>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={estimate}
                className="h-7 w-[80px] text-xs"
                onChange={(e) => setEstimate(e.target.value)}
                onBlur={() => {
                  const n = estimate === "" ? null : Number.parseFloat(estimate)
                  if (n !== Number(step.estimated_hours ?? 0)) patch({ estimated_hours: n ?? 0 })
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Actual (h)</span>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={actual}
                className="h-7 w-[80px] text-xs"
                onChange={(e) => setActual(e.target.value)}
                onBlur={() => {
                  const n = actual === "" ? null : Number.parseFloat(actual)
                  if (n !== Number(step.actual_hours ?? 0)) patch({ actual_hours: n ?? 0 })
                }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Progress</span>
                <span className="text-xs font-medium">{progress}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                className="w-full accent-blue-500"
                onChange={(e) => setProgress(Number(e.target.value))}
                onMouseUp={() => progress !== step.progress && patch({ progress })}
                onTouchEnd={() => progress !== step.progress && patch({ progress })}
              />
            </div>

            <div className="pt-2 border-t border-border space-y-1 text-[11px] text-muted-foreground">
              <div>Created {format(new Date(step.created_at), "MMM d, yyyy")}</div>
              {step.completed_at && <div>Completed {format(new Date(step.completed_at), "MMM d, yyyy")}</div>}
              <div>Status: {STATUS_LABELS[step.status]}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
