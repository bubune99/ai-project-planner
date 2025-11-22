"use client"

import { useState, useEffect } from "react"
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProjectCard } from "@/components/projects/ProjectCard"
import { ProjectStats } from "@/components/projects/ProjectStats"
import { NewProjectModal } from "@/components/projects/NewProjectModal"
import { Search, Plus, LayoutGrid, List, Loader2 } from 'lucide-react'

interface Project {
  id: string
  name: string
  description: string
  status: string
  priority: string
  progress: number
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  blocked_tasks: number
  pending_tasks: number
  created_at: string
  updated_at: string
}

export default function ProjectsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [statusFilter])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      setError(null)
      const url = statusFilter === "all"
        ? "/api/projects"
        : `/api/projects?status=${statusFilter}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error("Failed to fetch projects")
      }
      const data = await response.json()
      setProjects(data.projects || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || project.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleProjectSelect = (projectId: string) => {
    router.push(`/project/${projectId}`)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Mission Control</h1>
              <p className="text-muted-foreground">AI-powered project management dashboard</p>
            </div>
            <Button 
              className="bg-blue-500 hover:bg-blue-600 text-white gap-2"
              onClick={() => setIsNewProjectModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-8 py-8 space-y-8">
        {/* Stats */}
        <ProjectStats projects={projects} />

        {/* Filters and Search */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-black/40 border-white/10"
              />
            </div>
            <div className="flex items-center gap-2">
              {["all", "in-progress", "planning", "review", "completed", "on-hold"].map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                  className={
                    statusFilter === status
                      ? "bg-blue-500 hover:bg-blue-600"
                      : "border-white/10 hover:bg-white/5"
                  }
                >
                  {status.replace("-", " ")}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className={viewMode === "grid" ? "bg-blue-500" : "border-white/10"}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
              className={viewMode === "list" ? "bg-blue-500" : "border-white/10"}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Projects Grid */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">
            {filteredProjects.length} Projects
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-4">{error}</p>
              <Button onClick={fetchProjects} variant="outline">
                Try Again
              </Button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No projects found. Create your first project to get started!</p>
            </div>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  : "space-y-4"
              }
            >
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} onSelect={handleProjectSelect} />
              ))}
            </div>
          )}
        </div>
      </div>

      <NewProjectModal
        open={isNewProjectModalOpen}
        onOpenChange={setIsNewProjectModalOpen}
        onProjectCreated={fetchProjects}
      />
    </div>
  )
}
