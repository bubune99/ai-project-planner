"use client"

import { useChat, Message } from "@ai-sdk/react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Send,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Wrench,
  CheckCircle,
  XCircle,
} from "lucide-react"
import type { Task, KanbanTask, Document } from "@/lib/types"
import { cn } from "@/lib/utils"
import { processMessageToolCalls, UIActionHandlers } from "@/lib/ai/ui-actions"

interface AIAssistantProps {
  activeTab?: string
  selectedTask?: Task | KanbanTask | null
  selectedDocument?: Document | null
  projectId?: string
  // UI Action handlers
  onNavigateView?: (view: string) => void
  onOpenDocumentBrowser?: (filter?: string) => void
  onCloseDocumentBrowser?: () => void
  onSelectTask?: (task: any) => void
  onSelectDocument?: (doc: any) => void
}

export function AIAssistant({
  activeTab = "dashboard",
  selectedTask,
  selectedDocument,
  projectId,
  onNavigateView,
  onOpenDocumentBrowser,
  onCloseDocumentBrowser,
  onSelectTask,
  onSelectDocument,
}: AIAssistantProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const processedToolCallsRef = useRef<Set<string>>(new Set())

  // Build context object to send with each message
  const context = {
    activeTab,
    selectedTask,
    selectedDocument,
    projectId,
  }

  const { messages, input, setInput, handleSubmit, isLoading, append } = useChat({
    api: "/api/chat",
    body: { context }, // Send context with each request
    initialMessages: [
      {
        id: "welcome",
        role: "assistant",
        content:
          "Hello! I'm your AI project planning assistant. I can help you navigate views, manage tasks, track progress, and more. What would you like to do?",
      },
    ],
  })

  // UI Action handlers to process tool results
  const uiActionHandlers: UIActionHandlers = {
    onNavigateView: (view, reason) => {
      console.log(`[AI] Navigating to ${view}${reason ? `: ${reason}` : ""}`)
      onNavigateView?.(view)
    },
    onOpenDocumentBrowser: (filter) => {
      console.log(`[AI] Opening document browser${filter ? ` with filter: ${filter}` : ""}`)
      onOpenDocumentBrowser?.(filter)
    },
    onCloseDocumentBrowser: () => {
      console.log("[AI] Closing document browser")
      onCloseDocumentBrowser?.()
    },
    onSelectTask: (taskId, scrollTo) => {
      console.log(`[AI] Selecting task: ${taskId}`)
      onSelectTask?.({ id: taskId })
    },
    onSelectDocument: (documentId) => {
      console.log(`[AI] Selecting document: ${documentId}`)
      onSelectDocument?.({ id: documentId })
    },
    onHighlightElements: (elementIds, type, duration, color) => {
      console.log(`[AI] Highlighting ${elementIds.length} elements`)
      // Implement DOM highlighting
      elementIds.forEach((id) => {
        const el = document.getElementById(id) || document.querySelector(`[data-id="${id}"]`)
        if (el) {
          el.classList.add("ring-2", `ring-${color}-500`, "animate-pulse")
          setTimeout(() => {
            el.classList.remove("ring-2", `ring-${color}-500`, "animate-pulse")
          }, duration)
        }
      })
    },
    onScrollToElement: (elementId, position) => {
      const el = document.getElementById(elementId) || document.querySelector(`[data-id="${elementId}"]`)
      el?.scrollIntoView({ behavior: "smooth", block: position as ScrollLogicalPosition })
    },
    onShowToast: (title, description, type, duration) => {
      // For now, log - could integrate with toast library
      console.log(`[AI Toast] ${title}: ${description}`)
    },
    onGetContext: () => context,
  }

  // Process tool invocations when messages change
  useEffect(() => {
    const latestMessage = messages[messages.length - 1]
    if (latestMessage?.role === "assistant" && latestMessage.toolInvocations) {
      for (const invocation of latestMessage.toolInvocations) {
        // Only process each tool call once
        const callId = `${latestMessage.id}-${invocation.toolCallId}`
        if (invocation.state === "result" && !processedToolCallsRef.current.has(callId)) {
          processedToolCallsRef.current.add(callId)
          processMessageToolCalls({ toolInvocations: [invocation] }, uiActionHandlers)
        }
      }
    }
  }, [messages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Update suggestions based on context
  useEffect(() => {
    if (selectedDocument) {
      setSuggestions([
        "Summarize this document",
        "Find related tasks",
        "Create a task from this",
      ])
    } else if (selectedTask) {
      if (activeTab === "gantt") {
        setSuggestions([
          "Adjust this timeline",
          "Show dependencies",
          "Find blockers",
        ])
      } else if (activeTab === "kanban") {
        setSuggestions([
          "Move to next column",
          "Assign to Claude",
          "Show similar tasks",
        ])
      } else {
        setSuggestions([
          "Explain dependencies",
          "Why is this blocked?",
          "Assign this task",
        ])
      }
    } else if (activeTab === "tree") {
      setSuggestions([
        "Show critical path",
        "Find blocked tasks",
        "Switch to Kanban view",
      ])
    } else if (activeTab === "gantt") {
      setSuggestions([
        "Find overdue tasks",
        "Optimize schedule",
        "Show milestones",
      ])
    } else if (activeTab === "kanban") {
      setSuggestions([
        "What's in progress?",
        "Show blockers",
        "Suggest next task",
      ])
    } else if (activeTab === "flow") {
      setSuggestions([
        "Explain this flow",
        "Find bottlenecks",
        "Show dependencies",
      ])
    } else if (activeTab === "docs") {
      setSuggestions([
        "List all documents",
        "Create new document",
        "Search docs for...",
      ])
    } else {
      setSuggestions([
        "Show project status",
        "What needs attention?",
        "Navigate to Kanban",
      ])
    }
  }, [selectedTask, selectedDocument, activeTab])

  const handleSuggestionClick = (suggestion: string) => {
    let contextPrompt = suggestion
    if (selectedDocument) {
      contextPrompt = `Regarding the document "${selectedDocument.name}": ${suggestion}`
    } else if (selectedTask) {
      const taskName = "title" in selectedTask ? selectedTask.title : selectedTask.name
      contextPrompt = `Regarding the task "${taskName}": ${suggestion}`
    }
    append({ role: "user", content: contextPrompt })
  }

  const getContextLabel = () => {
    if (selectedDocument) return `Document - ${selectedDocument.name}`
    if (selectedTask) {
      const taskName = "title" in selectedTask ? selectedTask.title : selectedTask.name
      return `Task - ${taskName}`
    }
    const viewLabels: Record<string, string> = {
      dashboard: "Dashboard",
      tree: "Tree View",
      gantt: "Gantt View",
      kanban: "Kanban View",
      flow: "Flow View",
      docs: "Documentation",
    }
    return viewLabels[activeTab] || "Dashboard"
  }

  const getPlaceholder = () => {
    if (selectedDocument) return `Ask about ${selectedDocument.name}...`
    if (selectedTask) {
      const taskName = "title" in selectedTask ? selectedTask.title : selectedTask.name
      return `Ask about ${taskName}...`
    }
    return "Ask anything or give a command..."
  }

  // Render tool invocation status
  const renderToolInvocation = (invocation: any) => {
    const toolDisplayNames: Record<string, string> = {
      navigateToView: "Navigate",
      openDocumentBrowser: "Open Docs",
      selectTask: "Select Task",
      selectDocument: "Select Document",
      highlightElements: "Highlight",
      listProjects: "List Projects",
      getProjectContext: "Get Context",
      getProjectTasks: "Get Tasks",
      createTask: "Create Task",
      updateTaskStatus: "Update Task",
      assignTask: "Assign Task",
      listPhases: "List Phases",
      transitionPhase: "Transition Phase",
      listDocuments: "List Documents",
      readDocument: "Read Document",
      createDocument: "Create Document",
      addProgressNote: "Add Note",
      listAgents: "List Agents",
      showToast: "Notify",
    }

    const displayName = toolDisplayNames[invocation.toolName] || invocation.toolName

    return (
      <div
        key={invocation.toolCallId}
        className={cn(
          "flex items-center gap-2 text-xs px-2 py-1 rounded",
          invocation.state === "result"
            ? "bg-green-500/10 text-green-400"
            : invocation.state === "error"
            ? "bg-red-500/10 text-red-400"
            : "bg-blue-500/10 text-blue-400"
        )}
      >
        {invocation.state === "result" ? (
          <CheckCircle className="w-3 h-3" />
        ) : invocation.state === "error" ? (
          <XCircle className="w-3 h-3" />
        ) : (
          <Loader2 className="w-3 h-3 animate-spin" />
        )}
        <span>{displayName}</span>
      </div>
    )
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
          <p className="text-xs text-muted-foreground mt-1">
            Context: {getContextLabel()}
          </p>
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
        {messages.map((message) => (
          <div key={message.id}>
            <div
              className={cn(
                "p-3 rounded-lg text-sm whitespace-pre-wrap",
                message.role === "user"
                  ? "bg-blue-500/10 border border-blue-500/20 text-foreground ml-4"
                  : "bg-accent/50 border border-border/30 text-foreground mr-4"
              )}
            >
              {message.content}
            </div>
            {/* Show tool invocations */}
            {message.toolInvocations && message.toolInvocations.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 mr-4">
                {message.toolInvocations.map(renderToolInvocation)}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 border border-border/30 mr-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-border/50 bg-card/20 space-y-3">
        {/* Selected item info */}
        {selectedTask && !selectedDocument && (
          <div className="text-xs space-y-1 p-2 bg-accent/30 rounded">
            <p className="text-muted-foreground">Selected Task:</p>
            <p className="text-foreground font-medium">
              {"title" in selectedTask ? selectedTask.title : selectedTask.name}
            </p>
          </div>
        )}

        {selectedDocument && (
          <div className="text-xs space-y-1 p-2 bg-accent/30 rounded">
            <p className="text-muted-foreground">Selected Document:</p>
            <p className="text-foreground font-medium">{selectedDocument.name}</p>
          </div>
        )}

        {/* Quick suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Quick actions:</p>
            <div className="flex flex-wrap gap-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={isLoading}
                  className="text-xs px-2 py-1 bg-accent/50 hover:bg-accent border border-border/30 rounded text-foreground transition-colors disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={getPlaceholder()}
            disabled={isLoading}
            className="flex-1 bg-background/50 border-border/50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>
    </aside>
  )
}
