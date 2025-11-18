"use client"

import { Rocket, Settings, FileText } from 'lucide-react'
import { Button } from "@/components/ui/button"

const tabs = [
  { id: "dashboard", label: "📊 Dashboard" },
  { id: "tree", label: "🌳 Tree" },
  { id: "gantt", label: "📈 Gantt" },
  { id: "kanban", label: "📋 Kanban" },
  { id: "flow", label: "🔀 Flow" },
  { id: "docs", label: "📚 Docs" },
]

interface TopNavigationProps {
  activeTab?: string
  onTabChange?: (tabId: string) => void
  onDocsClick?: () => void
  projectName?: string // Added optional project name prop
}

export function TopNavigation({ activeTab = "dashboard", onTabChange, onDocsClick, projectName }: TopNavigationProps) {
  return (
    <nav className="h-[60px] border-b border-border bg-card flex items-center justify-between px-6">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <Rocket className="w-6 h-6 text-blue-500" />
          <h1 className="text-xl font-bold text-foreground">{projectName || "Mission Control"}</h1>
        </div>

        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`px-4 py-2 text-sm font-medium transition-colors rounded-md ${
                activeTab === tab.id
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onDocsClick}>
          <FileText className="w-4 h-4 mr-2" />
          Documents
        </Button>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-accent rounded-md">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-foreground">GPT-4</span>
          <span className="text-yellow-500">⚡</span>
        </div>

        <Button variant="ghost" size="icon">
          <Settings className="w-5 h-5" />
        </Button>
      </div>
    </nav>
  )
}
