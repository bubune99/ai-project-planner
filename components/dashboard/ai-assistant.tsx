"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Bot, User, Sparkles, Eye, Target, Highlighter } from "lucide-react"
import { useState, useEffect, useRef } from "react"

interface ContextualInfo {
  selectedText?: string
  cursorPosition?: { x: number; y: number }
  currentView?: string
  highlightedAreas?: Array<{ id: string; text: string; element: string }>
}

const chatHistory = [
  {
    type: "ai",
    message:
      "Hello! I'm your AI project assistant with contextual awareness. I can see what you're looking at and help with specific elements you select or highlight.",
    timestamp: "10:30 AM",
    context: null,
  },
  {
    type: "user",
    message: "I want to add authentication to my e-commerce project. What's the best approach?",
    timestamp: "10:32 AM",
    context: { currentView: "Project Overview", selectedText: "authentication" },
  },
  {
    type: "ai",
    message:
      "I see you're looking at authentication in your Project Overview. For your e-commerce platform, I recommend using Supabase Auth. It integrates well with your existing stack and provides social logins, email verification, and secure session management. Shall I create a implementation plan?",
    timestamp: "10:33 AM",
    context: null,
  },
]

export function AIAssistant() {
  const [contextInfo, setContextInfo] = useState<ContextualInfo>({})
  const [isHighlightMode, setIsHighlightMode] = useState(false)
  const [message, setMessage] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (selection && selection.toString().trim()) {
        setContextInfo((prev) => ({
          ...prev,
          selectedText: selection.toString().trim(),
        }))
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      setContextInfo((prev) => ({
        ...prev,
        cursorPosition: { x: e.clientX, y: e.clientY },
      }))
    }

    const detectCurrentView = () => {
      const activeTab = document.querySelector('[data-state="active"]')
      if (activeTab) {
        setContextInfo((prev) => ({
          ...prev,
          currentView: activeTab.textContent || "Unknown View",
        }))
      }
    }

    document.addEventListener("selectionchange", handleSelectionChange)
    document.addEventListener("mousemove", handleMouseMove)
    detectCurrentView()

    if (isHighlightMode) {
      document.body.style.cursor = "crosshair"
    } else {
      document.body.style.cursor = "default"
    }

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      document.removeEventListener("mousemove", handleMouseMove)
      document.body.style.cursor = "default"
    }
  }, [isHighlightMode])

  const handleSendMessage = () => {
    if (!message.trim()) return

    const contextualMessage = {
      message: message.trim(),
      context: contextInfo,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }

    console.log("[v0] Sending contextual message:", contextualMessage)
    setMessage("")

    // Clear selection after sending
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges()
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-balance">
          <Bot className="h-5 w-5 text-primary" />
          AI Assistant
          {contextInfo.selectedText && (
            <Badge variant="secondary" className="text-xs">
              <Eye className="h-3 w-3 mr-1" />
              Context Active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Contextually aware AI guidance for your projects</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(contextInfo.selectedText || contextInfo.currentView) && (
          <div className="p-3 bg-muted/50 rounded-lg border-l-2 border-primary space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-primary" />
              Current Context
            </div>
            {contextInfo.currentView && (
              <div className="text-xs text-muted-foreground">
                View: <span className="font-medium">{contextInfo.currentView}</span>
              </div>
            )}
            {contextInfo.selectedText && (
              <div className="text-xs">
                Selected: <span className="font-mono bg-background px-1 rounded">"{contextInfo.selectedText}"</span>
              </div>
            )}
          </div>
        )}

        {/* Chat History */}
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {chatHistory.map((chat, index) => (
            <div key={index} className="flex gap-3">
              <div className="flex-shrink-0">
                {chat.type === "ai" ? (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm text-pretty">{chat.message}</p>
                {chat.context && (
                  <div className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                    Context: {chat.context.currentView}
                    {chat.context.selectedText && ` | Selected: "${chat.context.selectedText}"`}
                  </div>
                )}
                <span className="text-xs text-muted-foreground">{chat.timestamp}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Quick Actions:</p>
            <Button
              variant={isHighlightMode ? "default" : "outline"}
              size="sm"
              onClick={() => setIsHighlightMode(!isHighlightMode)}
              className="text-xs"
            >
              <Highlighter className="h-3 w-3 mr-1" />
              {isHighlightMode ? "Exit Highlight" : "Highlight Mode"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-accent"
              onClick={() => setMessage("Plan new feature for " + (contextInfo.currentView || "current view"))}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Plan New Feature
            </Badge>
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-accent"
              onClick={() => setMessage("Debug issue in " + (contextInfo.selectedText || "current selection"))}
            >
              Debug Issue
            </Badge>
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-accent"
              onClick={() => setMessage("Optimize " + (contextInfo.selectedText || "current code"))}
            >
              Optimize Code
            </Badge>
            {contextInfo.selectedText && (
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-accent"
                onClick={() => setMessage(`Explain "${contextInfo.selectedText}"`)}
              >
                <Eye className="h-3 w-3 mr-1" />
                Explain Selection
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder={
                contextInfo.selectedText
                  ? `Ask about "${contextInfo.selectedText}"...`
                  : "Ask me anything about your project..."
              }
              className="flex-1"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            />
            <Button size="icon" onClick={handleSendMessage}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {isHighlightMode && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Highlight mode active - click and drag to select areas for AI context
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
