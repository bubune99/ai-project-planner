"use client"

import { useState } from "react"
import { useParams, useRouter } from 'next/navigation'
import { TopNavigation } from "@/components/shared/TopNavigation"
import { AIAssistant } from "@/components/shared/AIAssistant"
import { DocumentBrowser } from "@/components/shared/DocumentBrowser"
import { ProjectOverview } from "@/components/dashboard/ProjectOverview"
import { AgentStatus } from "@/components/dashboard/AgentStatus"
import { ProgressMetrics } from "@/components/dashboard/ProgressMetrics"
import { QuickActions } from "@/components/dashboard/QuickActions"
import { RecentActivity } from "@/components/dashboard/RecentActivity"
import { TreeView } from "@/components/views/TreeView"
import { GanttView } from "@/components/views/GanttView"
import { KanbanView } from "@/components/views/KanbanView"
import { FlowView } from "@/components/views/FlowView"
import { DocsView } from "@/components/views/DocsView"
import { mockProject, mockAgents, mockActivities, quickActions } from "@/lib/mock-data"
import type { Task, KanbanTask, Document } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from 'lucide-react'

export default function ProjectDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("dashboard")
  const [selectedTask, setSelectedTask] = useState<Task | KanbanTask | null>(null)
  const [docsOpen, setDocsOpen] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)

  // In a real app, you'd fetch project data based on params.id
  const projectId = params.id as string

  return (
    <div className="min-h-screen bg-background">
      <TopNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onDocsClick={() => setDocsOpen(true)}
        projectName={mockProject.name}
      />

      {/* Back button */}
      <div className="border-b border-white/10 bg-black/40 backdrop-blur-sm">
        <div className="px-8 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
            className="text-muted-foreground hover:text-white gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Button>
        </div>
      </div>

      <div className="flex">
        <main className="flex-1 p-8 min-w-0">
          {activeTab === "dashboard" && (
            <div className="max-w-[1400px] mx-auto space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ProjectOverview project={mockProject} />
                <AgentStatus agents={mockAgents} />
                <ProgressMetrics
                  progress={mockProject.progress}
                  tasksCompleted={31}
                  totalTasks={47}
                  commitsToday={12}
                  lastUpdate="2 minutes ago"
                />
              </div>
              <QuickActions actions={quickActions} />
              <RecentActivity activities={mockActivities} />
            </div>
          )}

          {activeTab === "tree" && (
            <div className="max-w-[1400px] mx-auto h-[calc(100vh-180px)]">
              <TreeView onTaskSelect={setSelectedTask} />
            </div>
          )}

          {activeTab === "gantt" && (
            <div className="h-[calc(100vh-180px)]">
              <GanttView onTaskSelect={setSelectedTask} />
            </div>
          )}

          {activeTab === "kanban" && (
            <div className="max-w-[1400px] mx-auto h-[calc(100vh-180px)]">
              <KanbanView onTaskSelect={setSelectedTask} />
            </div>
          )}

          {activeTab === "flow" && (
            <div className="h-[calc(100vh-180px)]">
              <FlowView onTaskSelect={setSelectedTask} />
            </div>
          )}

          {activeTab === "docs" && (
            <div className="h-[calc(100vh-180px)]">
              <DocsView />
            </div>
          )}
        </main>

        <AIAssistant activeTab={activeTab} selectedTask={selectedTask} selectedDocument={selectedDocument} />
      </div>

      <DocumentBrowser open={docsOpen} onOpenChange={setDocsOpen} onDocumentSelect={setSelectedDocument} />
    </div>
  )
}
