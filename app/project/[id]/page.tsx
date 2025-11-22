"use client"

import { useState, useEffect } from "react"
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
import { mockAgents, quickActions } from "@/lib/mock-data"
import type { Task, KanbanTask, Document } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from 'lucide-react'

interface ProjectData {
  project: any
  steps: any[]
  techStack: any[]
  businessContext: any
  currentPhase: any
  progressNotes: any[]
  versions: any[]
}

export default function ProjectDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("dashboard")
  const [selectedTask, setSelectedTask] = useState<Task | KanbanTask | null>(null)
  const [docsOpen, setDocsOpen] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const projectId = params.id as string

  useEffect(() => {
    if (projectId) {
      fetchProjectData()
    }
  }, [projectId])

  const fetchProjectData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/projects/${projectId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch project data")
      }
      const data = await response.json()
      setProjectData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error || !projectData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || "Project not found"}</p>
          <Button onClick={() => router.push("/")} variant="outline">
            Back to Projects
          </Button>
        </div>
      </div>
    )
  }

  const { project, steps, progressNotes } = projectData

  return (
    <div className="min-h-screen bg-background">
      <TopNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onDocsClick={() => setDocsOpen(true)}
        projectName={project.name}
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
                <ProjectOverview project={project} />
                <AgentStatus agents={mockAgents} />
                <ProgressMetrics
                  progress={project.progress || 0}
                  tasksCompleted={project.completed_tasks || 0}
                  totalTasks={project.total_tasks || 0}
                  commitsToday={0}
                  lastUpdate={new Date(project.updated_at).toLocaleString()}
                />
              </div>
              <QuickActions actions={quickActions} />
              <RecentActivity activities={progressNotes.map((note: any) => ({
                id: note.id,
                type: note.note_type,
                message: note.title,
                timestamp: new Date(note.created_at).toLocaleString(),
                agent: note.author_type === 'agent' ? note.author : undefined,
              }))} />
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
