"use client"

import type { KanbanTask } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Clock, FileText, User, Flag, CheckCircle2, PlayCircle } from "lucide-react"

interface TaskDetailModalProps {
  task: KanbanTask | null
  open: boolean
  onClose: () => void
  onUpdate: (task: KanbanTask) => void
}

const agentColors = {
  v0: "bg-blue-500",
  claude: "bg-purple-500",
  gemini: "bg-green-500",
  gpt: "bg-orange-500",
}

const priorityColors = {
  high: "text-red-500",
  medium: "text-yellow-500",
  low: "text-green-500",
}

export function TaskDetailModal({ task, open, onClose, onUpdate }: TaskDetailModalProps) {
  if (!task) return null

  const handleAgentChange = (agent: "v0" | "claude" | "gemini" | "gpt") => {
    onUpdate({ ...task, agent })
  }

  const handlePriorityChange = (priority: "high" | "medium" | "low") => {
    onUpdate({ ...task, priority })
  }

  const handleStartTask = () => {
    onUpdate({ ...task, status: "in_progress" })
    onClose()
  }

  const handleMarkComplete = () => {
    onUpdate({ ...task, status: "complete" })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{task.title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{task.phase}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Description */}
          <div>
            <h4 className="text-sm font-semibold mb-2 text-foreground">Description</h4>
            <p className="text-sm text-muted-foreground">{task.description}</p>
          </div>

          {/* Agent Assignment */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
              <User className="w-4 h-4" />
              Assigned Agent
            </h4>
            <Select value={task.agent} onValueChange={handleAgentChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="v0">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full ${agentColors.v0}`} />
                    v0
                  </div>
                </SelectItem>
                <SelectItem value="claude">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full ${agentColors.claude}`} />
                    claude
                  </div>
                </SelectItem>
                <SelectItem value="gemini">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full ${agentColors.gemini}`} />
                    gemini
                  </div>
                </SelectItem>
                <SelectItem value="gpt">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full ${agentColors.gpt}`} />
                    gpt
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
              <Flag className="w-4 h-4" />
              Priority
            </h4>
            <Select value={task.priority} onValueChange={handlePriorityChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">
                  <span className={priorityColors.high}>High Priority</span>
                </SelectItem>
                <SelectItem value="medium">
                  <span className={priorityColors.medium}>Medium Priority</span>
                </SelectItem>
                <SelectItem value="low">
                  <span className={priorityColors.low}>Low Priority</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time Estimate */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Estimated time:</span>
            <Badge variant="outline">{task.estimate}</Badge>
          </div>

          {/* Attached Documents */}
          {task.attachedDocs > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
                <FileText className="w-4 h-4" />
                Attached Documents ({task.attachedDocs})
              </h4>
              <div className="space-y-1">
                {Array.from({ length: task.attachedDocs }).map((_, i) => (
                  <div key={i} className="text-sm text-blue-500 hover:underline cursor-pointer">
                    Document {i + 1}.pdf
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subtasks */}
          {task.subtasks && task.subtasks.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">Subtasks</h4>
              <div className="space-y-2">
                {task.subtasks.map((subtask) => (
                  <div key={subtask.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={subtask.done} readOnly className="w-4 h-4" />
                    <span className={subtask.done ? "line-through text-muted-foreground" : "text-foreground"}>
                      {subtask.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            {task.status === "backlog" && (
              <Button onClick={handleStartTask} className="flex-1">
                <PlayCircle className="w-4 h-4 mr-2" />
                Start Task
              </Button>
            )}
            {(task.status === "in_progress" || task.status === "review") && (
              <Button onClick={handleMarkComplete} className="flex-1">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark Complete
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
