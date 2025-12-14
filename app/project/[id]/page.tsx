"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useParams, useRouter } from 'next/navigation'
import { TopNavigation } from "@/components/shared/TopNavigation"
import { DocumentBrowser } from "@/components/shared/DocumentBrowser"
import Link from "next/link"
import { MessageSquare } from "lucide-react"
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
import { transformStepsToPhases, transformStepsToFlow } from "@/lib/data-transforms"
import type { Task, KanbanTask, Document } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react'

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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const projectId = params.id as string

  // Fetch project data (with optional silent mode for background refresh)
  const fetchProjectData = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true)
      } else {
        setIsRefreshing(true)
      }
      setError(null)
      const response = await fetch(`/api/projects/${projectId}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("API Error:", errorData)
        const debugInfo = errorData.receivedId ? ` (ID: ${errorData.receivedId}, DB: ${errorData.dbUrl})` : ''
        throw new Error((errorData.error || `Failed to fetch project data: ${response.status}`) + debugInfo)
      }
      const json = await response.json()
      if (json.success && json.data) {
        setProjectData(json.data)
        setLastRefresh(new Date())
      } else {
        throw new Error(json.error?.message || "Failed to fetch project data")
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "An error occurred")
      }
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [projectId])

  // Initial fetch
  useEffect(() => {
    if (projectId) {
      fetchProjectData()
    }
  }, [projectId, fetchProjectData])

  // Auto-refresh every 5 seconds when enabled
  useEffect(() => {
    if (autoRefresh && projectId) {
      refreshIntervalRef.current = setInterval(() => {
        fetchProjectData(true) // Silent refresh
      }, 5000)
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [autoRefresh, projectId, fetchProjectData])

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    fetchProjectData(true)
  }, [fetchProjectData])

  // Transform database steps into hierarchical phase structure (before early returns)
  const phases = useMemo(() => {
    if (!projectData?.steps) return []

    try {
      return transformStepsToPhases(projectData.steps)
    } catch (error) {
      console.error('Error transforming steps to phases:', error)
      return []
    }
  }, [projectData?.steps])

  // Transform steps to React Flow nodes and edges
  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!projectData?.steps) return { nodes: [], edges: [] }

    try {
      return transformStepsToFlow(projectData.steps)
    } catch (error) {
      console.error('Error transforming steps to flow:', error)
      return { nodes: [], edges: [] }
    }
  }, [projectData?.steps])

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
        projectName={project?.name || 'Project'}
      />

      {/* Back button and refresh controls */}
      <div className="border-b border-white/10 bg-black/40 backdrop-blur-sm">
        <div className="px-8 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
            className="text-muted-foreground hover:text-white gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Button>

          <div className="flex items-center gap-4">
            {/* Last refresh indicator */}
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}

            {/* Refresh button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>

            {/* Auto-refresh toggle */}
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {autoRefresh ? '⚡ Auto-refresh ON' : 'Auto-refresh'}
            </Button>
          </div>
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
              <RecentActivity activities={(progressNotes || []).map((note: any) => ({
                id: note.id,
                type: note.note_type || 'update',
                message: note.title || (note.content ? note.content.substring(0, 50) : '') || 'No message',
                timestamp: note.created_at ? new Date(note.created_at).toLocaleString() : 'Unknown',
                agent: note.author_type === 'agent' ? note.author : undefined,
                icon: '📝',
              }))} />
            </div>
          )}

          {activeTab === "tree" && (
            <div className="max-w-[1400px] mx-auto h-[calc(100vh-180px)]">
              <TreeView
                phases={phases}
                projectId={projectId}
                projectName={project?.name}
                onTaskSelect={setSelectedTask}
              />
            </div>
          )}

          {activeTab === "gantt" && (
            <div className="h-[calc(100vh-180px)]">
              <GanttView projectId={projectId} onTaskSelect={setSelectedTask} />
            </div>
          )}

          {activeTab === "kanban" && (
            <div className="max-w-[1400px] mx-auto h-[calc(100vh-180px)]">
              <KanbanView projectId={projectId} onTaskSelect={setSelectedTask} />
            </div>
          )}

          {activeTab === "flow" && (
            <div className="h-[calc(100vh-180px)]">
              <FlowView
                nodes={flowNodes}
                edges={flowEdges}
                projectId={projectId}
                onTaskSelect={setSelectedTask}
                onRefresh={handleRefresh}
              />
            </div>
          )}

          {activeTab === "docs" && (
            <div className="h-[calc(100vh-180px)]">
              <DocsView projectId={projectId} />
            </div>
          )}
        </main>

{/* AI Chat Button - Links to Chat SDK */}
        <Link
          href="/chat"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-full shadow-lg transition-colors"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="font-medium">AI Chat</span>
        </Link>
      </div>

      <DocumentBrowser projectId={projectId} open={docsOpen} onOpenChange={setDocsOpen} onDocumentSelect={setSelectedDocument} />
    </div>
  )
}
