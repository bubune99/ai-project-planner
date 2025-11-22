"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Bug, Sparkles, Wrench, AlertCircle, CheckCircle2, XCircle, Clock } from "lucide-react"
import { format } from "date-fns"

interface FeatureRequest {
  id: string
  project_id: string
  title: string
  description: string
  type: "feature" | "bug" | "improvement" | "tech-debt"
  priority: "critical" | "high" | "medium" | "low"
  status: "proposed" | "approved" | "in-progress" | "completed" | "rejected" | "deferred"
  requested_by: string
  impact_analysis: string | null
  effort_estimate: "small" | "medium" | "large" | null
  assigned_version: string | null
  created_step_id: string | null
  created_at: string
  updated_at: string
}

interface FeatureBacklogProps {
  projectId: string
}

export function FeatureBacklog({ projectId }: FeatureBacklogProps) {
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [filter, setFilter] = useState<"all" | "proposed" | "approved" | "in-progress">("all")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "feature" as FeatureRequest["type"],
    priority: "medium" as FeatureRequest["priority"],
    impact_analysis: "",
    effort_estimate: "medium" as FeatureRequest["effort_estimate"],
    requested_by: "user",
  })

  useEffect(() => {
    fetchRequests()
  }, [projectId, filter])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      setError(null)
      const url =
        filter === "all"
          ? `/api/projects/${projectId}/feature-requests`
          : `/api/projects/${projectId}/feature-requests?status=${filter}`
      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch feature requests' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch feature requests`)
      }

      const data = await response.json()
      setRequests(data.requests || [])
    } catch (error) {
      console.error("Failed to fetch feature requests:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while fetching feature requests')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      setError('Title is required')
      return
    }
    if (!formData.description.trim()) {
      setError('Description is required')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/feature-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create feature request' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to create feature request`)
      }

      setIsCreateModalOpen(false)
      setFormData({
        title: "",
        description: "",
        type: "feature",
        priority: "medium",
        impact_analysis: "",
        effort_estimate: "medium",
        requested_by: "user",
      })
      await fetchRequests()
    } catch (error) {
      console.error("Failed to create feature request:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while creating feature request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApprove = async (requestId: string) => {
    try {
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/feature-requests/${requestId}/approve`, {
        method: "POST",
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to approve request' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to approve request`)
      }

      await fetchRequests()
    } catch (error) {
      console.error("Failed to approve request:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while approving request')
    }
  }

  const handleReject = async (requestId: string) => {
    try {
      setError(null)
      const response = await fetch(`/api/projects/${projectId}/feature-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to reject request' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to reject request`)
      }

      await fetchRequests()
    } catch (error) {
      console.error("Failed to reject request:", error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred while rejecting request')
    }
  }

  const getTypeIcon = (type: FeatureRequest["type"]) => {
    switch (type) {
      case "bug":
        return <Bug className="h-4 w-4" />
      case "feature":
        return <Sparkles className="h-4 w-4" />
      case "improvement":
        return <Wrench className="h-4 w-4" />
      case "tech-debt":
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getPriorityColor = (priority: FeatureRequest["priority"]) => {
    switch (priority) {
      case "critical":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      case "high":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30"
      case "medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      case "low":
        return "bg-green-500/20 text-green-400 border-green-500/30"
    }
  }

  const getStatusColor = (status: FeatureRequest["status"]) => {
    switch (status) {
      case "approved":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "in-progress":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
      case "completed":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30"
      case "rejected":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      case "deferred":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
      default:
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    }
  }

  const groupedRequests = {
    critical: requests.filter((r) => r.priority === "critical" && r.status !== "completed" && r.status !== "rejected"),
    high: requests.filter((r) => r.priority === "high" && r.status !== "completed" && r.status !== "rejected"),
    medium: requests.filter((r) => r.priority === "medium" && r.status !== "completed" && r.status !== "rejected"),
    low: requests.filter((r) => r.priority === "low" && r.status !== "completed" && r.status !== "rejected"),
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
          <h2 className="text-2xl font-bold text-white">Feature Backlog</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage bugs, features, and improvements</p>
        </div>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-600 gap-2">
              <Plus className="h-4 w-4" />
              Create Request
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-white/10 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Create Feature Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Add 2-factor authentication"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger className="bg-black/40 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="bug">Bug</SelectItem>
                      <SelectItem value="improvement">Improvement</SelectItem>
                      <SelectItem value="tech-debt">Tech Debt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger className="bg-black/40 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="effort">Effort Estimate</Label>
                  <Select
                    value={formData.effort_estimate || "medium"}
                    onValueChange={(value: any) => setFormData({ ...formData, effort_estimate: value })}
                  >
                    <SelectTrigger className="bg-black/40 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the feature or bug..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-black/40 border-white/10 min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="impact">Impact Analysis</Label>
                <Textarea
                  id="impact"
                  placeholder="What's the impact on users or the business?"
                  value={formData.impact_analysis}
                  onChange={(e) => setFormData({ ...formData, impact_analysis: e.target.value })}
                  className="bg-black/40 border-white/10 min-h-[80px]"
                />
              </div>
              <Button
                onClick={handleCreate}
                className="w-full bg-blue-500 hover:bg-blue-600"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create Request'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        {["all", "proposed", "approved", "in-progress"].map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status as any)}
            className={filter === status ? "bg-blue-500" : "border-white/10"}
          >
            {status.replace("-", " ")}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-red-500/10 border-red-500/30 p-4">
          <div className="text-2xl font-bold text-red-400">{groupedRequests.critical.length}</div>
          <div className="text-sm text-red-300">Critical</div>
        </Card>
        <Card className="bg-orange-500/10 border-orange-500/30 p-4">
          <div className="text-2xl font-bold text-orange-400">{groupedRequests.high.length}</div>
          <div className="text-sm text-orange-300">High</div>
        </Card>
        <Card className="bg-yellow-500/10 border-yellow-500/30 p-4">
          <div className="text-2xl font-bold text-yellow-400">{groupedRequests.medium.length}</div>
          <div className="text-sm text-yellow-300">Medium</div>
        </Card>
        <Card className="bg-green-500/10 border-green-500/30 p-4">
          <div className="text-2xl font-bold text-green-400">{groupedRequests.low.length}</div>
          <div className="text-sm text-green-300">Low</div>
        </Card>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading requests...</div>
      ) : requests.length === 0 ? (
        <Card className="bg-gray-900/50 border-white/10 p-8 text-center">
          <p className="text-muted-foreground">No feature requests yet. Create your first one!</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} className="bg-gray-900/50 border-white/10 p-6">
              <div className="flex items-start gap-4">
                <div className="mt-1">{getTypeIcon(request.type)}</div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-white">{request.title}</h3>
                      <Badge variant="outline" className={getPriorityColor(request.priority)}>
                        {request.priority}
                      </Badge>
                      <Badge variant="outline" className={getStatusColor(request.status)}>
                        {request.status}
                      </Badge>
                      <Badge variant="outline" className="border-white/10">
                        {request.type}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-muted-foreground text-sm mb-3">{request.description || 'No description provided'}</p>

                  {request.impact_analysis && request.impact_analysis.trim() && (
                    <div className="bg-black/30 rounded p-3 mb-3">
                      <p className="text-xs font-medium text-white mb-1">Impact:</p>
                      <p className="text-sm text-muted-foreground">{request.impact_analysis}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span>
                      Requested by: <span className="text-white">{request.requested_by || 'Unknown'}</span>
                    </span>
                    {request.effort_estimate && (
                      <span>
                        Effort: <span className="text-white capitalize">{request.effort_estimate}</span>
                      </span>
                    )}
                    {request.assigned_version && (
                      <span>
                        Version: <span className="text-white">{request.assigned_version}</span>
                      </span>
                    )}
                    <span>{format(new Date(request.created_at), "MMM dd, yyyy")}</span>
                  </div>

                  {request.status === "proposed" && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-green-500 hover:bg-green-600 gap-1"
                        onClick={() => handleApprove(request.id)}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Approve & Create Step
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 hover:bg-red-500/10 text-red-400 gap-1 bg-transparent"
                        onClick={() => handleReject(request.id)}
                      >
                        <XCircle className="h-3 w-3" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/10 hover:bg-white/5 gap-1 bg-transparent"
                      >
                        <Clock className="h-3 w-3" />
                        Defer
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
