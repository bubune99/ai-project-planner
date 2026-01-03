"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"
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

const WELCOME_MESSAGE: UIMessage = {
  id: "welcome",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "Hello! I'm your AI project planning assistant. I can help you navigate views, manage tasks, track progress, and more. What would you like to do?",
    },
  ],
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
  const [loadedMessages, setLoadedMessages] = useState<UIMessage[]>([WELCOME_MESSAGE])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const processedToolCallsRef = useRef<Set<string>>(new Set())
  const hasLoadedHistory = useRef(false)

  // Build context object to send with each message
  const context = {
    activeTab,
    selectedTask,
    selectedDocument,
    projectId,
  }

  // Load conversation history when projectId changes
  useEffect(() => {
    if (!projectId || hasLoadedHistory.current) return

    const loadConversationHistory = async () => {
      setIsLoadingHistory(true)
      try {
        // Find existing conversation for this project
        const response = await fetch(
          `/api/conversations?contextType=project&contextId=${projectId}&includeMessages=false`
        )

        if (response.ok) {
          const data = await response.json()
          const conversations = data.conversations || []

          if (conversations.length > 0) {
            // Load messages from the most recent conversation
            const conv = conversations[0]
            setConversationId(conv.id)

            const messagesResponse = await fetch(
              `/api/conversations/${conv.id}/messages`
            )

            if (messagesResponse.ok) {
              const messagesData = await messagesResponse.json()
              const fetchedMessages = messagesData.messages || []

              if (fetchedMessages.length > 0) {
                // Transform messages to the format expected by useChat
                const transformedMessages: UIMessage[] = fetchedMessages.map((msg: any) => {
                  const parts: any[] = []

                  // Add text content as a part
                  if (msg.content) {
                    parts.push({ type: "text", text: msg.content })
                  }

                  // Include parts if present (for AI SDK v5 compatibility)
                  if (msg.parts && msg.parts.length > 0) {
                    parts.push(...msg.parts)
                  }

                  // Include toolInvocations as tool-result parts if present
                  if (msg.toolInvocations && msg.toolInvocations.length > 0) {
                    for (const invocation of msg.toolInvocations) {
                      parts.push({
                        type: "tool-invocation",
                        toolInvocation: invocation,
                      })
                    }
                  }

                  const baseMsg: UIMessage = {
                    id: msg.id,
                    role: msg.role as "user" | "assistant" | "system",
                    parts: parts.length > 0 ? parts : [{ type: "text", text: "" }],
                  }

                  return baseMsg
                })
                setLoadedMessages(transformedMessages)
                console.log(`[AIAssistant] Loaded ${transformedMessages.length} messages from conversation ${conv.id}`)
              }
            }
          }
        }
      } catch (error) {
        console.error("[AIAssistant] Failed to load conversation history:", error)
      } finally {
        setIsLoadingHistory(false)
        hasLoadedHistory.current = true
      }
    }

    loadConversationHistory()
  }, [projectId])

  const { messages, sendMessage, setMessages, status } = useChat({
    messages: loadedMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest(request: any) {
        return {
          body: {
            ...request.body,
            context,
            conversationId,
          },
        }
      },
    }),
  })

  const isLoading = status === "streaming" || status === "submitted"

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: input }],
    })
    setInput("")
  }

  const append = (message: { role: "user" | "assistant"; content: string }) => {
    sendMessage({
      role: message.role,
      parts: [{ type: "text", text: message.content }],
    })
  }

  // Update messages when loadedMessages changes (after loading history)
  useEffect(() => {
    if (loadedMessages.length > 1 || loadedMessages[0]?.id !== "welcome") {
      setMessages(loadedMessages)
    }
  }, [loadedMessages, setMessages])

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

  // Helper to extract text content from message parts
  const getMessageContent = (message: UIMessage) => {
    if (!message.parts) return ""
    const textParts = message.parts
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
    return textParts.join("")
  }

  // Helper to extract tool invocations from message parts
  const getToolInvocations = (message: UIMessage) => {
    if (!message.parts) return []
    return message.parts
      .filter((part: any) => part.type === "tool-invocation")
      .map((part: any) => part.toolInvocation)
  }

  // Process tool invocations when messages change
  useEffect(() => {
    const latestMessage = messages[messages.length - 1]
    const toolInvocations = latestMessage ? getToolInvocations(latestMessage) : []
    if (latestMessage?.role === "assistant" && toolInvocations.length > 0) {
      for (const invocation of toolInvocations) {
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
      contextPrompt = `Regarding the document "${selectedDocument.title}": ${suggestion}`
    } else if (selectedTask) {
      const taskName = "title" in selectedTask ? selectedTask.title : selectedTask.name
      contextPrompt = `Regarding the task "${taskName}": ${suggestion}`
    }
    append({ role: "user", content: contextPrompt })
  }

  const getContextLabel = () => {
    if (selectedDocument) return `Document - ${selectedDocument.title}`
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
    if (selectedDocument) return `Ask about ${selectedDocument.title}...`
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
        {isLoadingHistory && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 border border-border/30">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading conversation history...</span>
          </div>
        )}
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
              {getMessageContent(message)}
            </div>
            {/* Show tool invocations */}
            {getToolInvocations(message).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 mr-4">
                {getToolInvocations(message).map(renderToolInvocation)}
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
            <p className="text-foreground font-medium">{selectedDocument.title}</p>
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
            disabled={isLoading || !input?.trim()}
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
