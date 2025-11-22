"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, CheckCircle2, Clock, FileText, Calendar, Target, AlertCircle, XCircle } from "lucide-react"
import { format } from "date-fns"

interface Version {
  id: string
  project_id: string
  version_number: string
  name: string
  description: string | null
  goals: string[]
  start_date: string
  target_date: string | null
  completion_date: string | null
  status: "planning" | "in-progress" | "completed" | "cancelled"
  total_steps: number
  completed_steps: number
  progress_percentage: number
  created_at: string
  updated_at: string
}

interface VersionManagementProps {
  projectId: string
}

export function VersionManagement({ projectId }: VersionManagementProps) {
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState({
    version_number: "",
    name: "",
    description: "",
    goals: "",
    target_date: "",
  })

  useEffect(() => {
    fetchVersions()
  }, [projectId])

  const fetchVersions = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/versions`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch versions' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch versions`)
      }

      const data = await response.json()
      setVersions(data.versions || [])
    } catch (error) {
      console.error("Failed to fetch versions:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while fetching versions')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.version_number.trim() || !formData.name.trim()) {
      setError('Version number and name are required')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          goals: formData.goals.split("\n").filter((g) => g.trim()),
          target_date: formData.target_date || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create version' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to create version`)
      }

      setIsCreateModalOpen(false)
      setFormData({ version_number: "", name: "", description: "", goals: "", target_date: "" })
      await fetchVersions()
    } catch (error) {
      console.error("Failed to create version:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while creating version')
    } finally {
      setCreating(false)
    }
  }

  const getStatusIcon = (status: Version["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case "in-progress":
        return <Clock className="h-5 w-5 text-blue-500" />
      default:
        return <FileText className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: Version["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "in-progress":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
      case "planning":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-400 text-sm font-medium">Error</p>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
            aria-label="Dismiss error"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Versions & Releases</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage project iterations and track release progress</p>
        </div>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-600 gap-2">
              <Plus className="h-4 w-4" />
              Create Version
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white">Create New Version</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="version_number">Version Number</Label>
                  <Input
                    id="version_number"
                    placeholder="v1.0"
                    value={formData.version_number}
                    onChange={(e) => setFormData({ ...formData, version_number: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target_date">Target Date</Label>
                  <Input
                    id="target_date"
                    type="date"
                    value={formData.target_date}
                    onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Version Name</Label>
                <Input
                  id="name"
                  placeholder="Enhancements & New Features"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="What's included in this version?"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-black/40 border-white/10 min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goals">Goals (one per line)</Label>
                <Textarea
                  id="goals"
                  placeholder="Payment integration&#10;Analytics dashboard&#10;Email notifications"
                  value={formData.goals}
                  onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                  className="bg-black/40 border-white/10 min-h-[100px] font-mono text-sm"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                {creating ? "Creating..." : "Create Version"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading versions...</div>
      ) : versions.length === 0 ? (
        <Card className="bg-gray-900/50 border-white/10 p-8 text-center">
          <p className="text-muted-foreground">No versions created yet. Start by creating your first version!</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {versions.map((version) => (
            <Card key={version.id} className="bg-gray-900/50 border-white/10 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  {getStatusIcon(version.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-white">
                        {version.version_number} - {version.name}
                      </h3>
                      <Badge variant="outline" className={getStatusColor(version.status)}>
                        {version.status}
                      </Badge>
                    </div>

                    {version.description ? (
                      <p className="text-muted-foreground text-sm mb-3">{version.description}</p>
                    ) : (
                      <p className="text-muted-foreground/50 text-sm mb-3 italic">No description</p>
                    )}

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Started:</span>
                        <span className="text-white">{format(new Date(version.start_date), "MMM dd, yyyy")}</span>
                      </div>
                      {version.target_date && (
                        <div className="flex items-center gap-2 text-sm">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Target:</span>
                          <span className="text-white">{format(new Date(version.target_date), "MMM dd, yyyy")}</span>
                        </div>
                      )}
                      {version.completion_date && (
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="text-muted-foreground">Completed:</span>
                          <span className="text-white">
                            {format(new Date(version.completion_date), "MMM dd, yyyy")}
                          </span>
                        </div>
                      )}
                    </div>

                    {version.goals && version.goals.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-white mb-2">Goals:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {version.goals.map((goal, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground">
                              {goal}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="text-white font-medium">{version.progress_percentage}%</span>
                        </div>
                        <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${version.progress_percentage}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {version.completed_steps} / {version.total_steps} steps
                      </div>
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5 bg-transparent">
                  View Details
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
