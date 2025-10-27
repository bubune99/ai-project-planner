"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Sparkles, ChevronRight, ChevronLeft } from "lucide-react"
import type { Task, GanttTask, KanbanTask, Document } from "@/lib/types"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface AIAssistantProps {
  activeTab?: string
  selectedTask?: Task | GanttTask | KanbanTask | null
  selectedDocument?: Document | null
}

export function AIAssistant({ activeTab = "dashboard", selectedTask, selectedDocument }: AIAssistantProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! How can I assist you with your project today?" },
    { role: "user", content: "Show me the current progress" },
    { role: "assistant", content: "Your project is at 65% completion with 31 of 47 tasks done." },
  ])
  const [input, setInput] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (selectedDocument) {
      setSuggestions(["Summarize this document", "Find related tasks", "Show references"])
    } else if (selectedTask) {
      if (activeTab === "gantt") {
        setSuggestions(["Adjust timeline", "Find critical path", "Show blockers"])
      } else if (activeTab === "kanban") {
        setSuggestions(["Suggest next task", "Find blockers", "Assign agent"])
      } else {
        setSuggestions(["Explain dependencies", "Why is this blocked?", "Show related docs"])
      }
    } else if (activeTab === "tree") {
      setSuggestions(["Show critical path", "Optimize timeline", "Suggest next task"])
    } else if (activeTab === "gantt") {
      setSuggestions(["Find critical path", "Optimize schedule", "Show dependencies"])
    } else if (activeTab === "kanban") {
      setSuggestions(["Suggest next task", "Find blockers", "Optimize workflow"])
    } else if (activeTab === "flow") {
      setSuggestions(["Show critical path", "Explain dependencies", "Optimize flow"])
    } else {
      setSuggestions([])
    }
  }, [selectedTask, selectedDocument, activeTab])

  const handleSend = () => {
    if (!input.trim()) return
    setMessages([...messages, { role: "user", content: input }])
    setInput("")
  }

  const getContextLabel = () => {
    if (selectedDocument) return `Document - ${selectedDocument.name}`
    if (activeTab === "tree") return "Tree View"
    if (activeTab === "gantt") return "Gantt View"
    if (activeTab === "kanban") return "Kanban View"
    if (activeTab === "flow") return "Flow View"
    return "Dashboard"
  }

  const getPlaceholder = () => {
    if (selectedDocument) return `Ask about ${selectedDocument.name}...`
    if (selectedTask) {
      if ("title" in selectedTask) {
        return `Ask about ${selectedTask.title}...`
      }
      return `Ask about ${selectedTask.name}...`
    }
    return "Ask anything..."
  }

  const isGanttTask = (task: Task | GanttTask | KanbanTask): task is GanttTask => {
    return "startDate" in task && "endDate" in task
  }

  const isKanbanTask = (task: Task | GanttTask | KanbanTask): task is KanbanTask => {
    return "title" in task && "priority" in task
  }

  if (isCollapsed) {
    return (
      <aside className="w-12 h-screen sticky top-0 flex flex-col bg-card/30 backdrop-blur-md border-l border-border/50">
        <div className="flex-1 flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(false)}
            className="hover:bg-accent"
            title="Expand AI Assistant"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-80 h-screen sticky top-0 flex flex-col bg-card/30 backdrop-blur-md border-l border-border/50">
      <div className="p-4 border-b border-border/50 bg-card/20 flex items-center justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            AI Assistant
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Context: {getContextLabel()}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(true)}
          className="hover:bg-accent"
          title="Collapse AI Assistant"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg text-sm ${
              message.role === "user"
                ? "bg-blue-500/10 border border-blue-500/20 text-foreground ml-4"
                : "bg-accent/50 border border-border/30 text-foreground mr-4"
            }`}
          >
            {message.content}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border/50 bg-card/20 space-y-3">
        {selectedDocument && (
          <div className="text-xs space-y-1">
            <p className="text-muted-foreground">Selected Document:</p>
            <p className="text-foreground font-medium">{selectedDocument.name}</p>
            <p className="text-muted-foreground">Type: {selectedDocument.type}</p>
            <p className="text-muted-foreground">
              Linked to {selectedDocument.linkedTasks.length} task{selectedDocument.linkedTasks.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedDocument.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-accent rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {selectedTask && !selectedDocument && (
          <div className="text-xs space-y-1">
            <p className="text-muted-foreground">Selected:</p>
            {isKanbanTask(selectedTask) ? (
              <>
                <p className="text-foreground font-medium">{selectedTask.title}</p>
                <p className="text-muted-foreground">Agent: {selectedTask.agent}</p>
                <p className="text-muted-foreground">Priority: {selectedTask.priority}</p>
                <p className="text-muted-foreground">Status: {selectedTask.status}</p>
              </>
            ) : isGanttTask(selectedTask) ? (
              <>
                <p className="text-foreground font-medium">{selectedTask.name}</p>
                <p className="text-muted-foreground">Agent: {selectedTask.agent.name}</p>
                <p className="text-muted-foreground">
                  {selectedTask.startDate.toLocaleDateString()} - {selectedTask.endDate.toLocaleDateString()}
                </p>
                <p className="text-muted-foreground">Progress: {selectedTask.progress}%</p>
              </>
            ) : (
              <>
                <p className="text-foreground font-medium">{selectedTask.name}</p>
                <p className="text-muted-foreground">Agent: {selectedTask.agent}</p>
              </>
            )}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Quick suggestions:</p>
            <div className="flex flex-wrap gap-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-xs px-2 py-1 bg-accent/50 hover:bg-accent border border-border/30 rounded text-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={getPlaceholder()}
            className="flex-1 bg-background/50 border-border/50"
          />
          <Button size="icon" onClick={handleSend} className="bg-blue-600 hover:bg-blue-700">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
