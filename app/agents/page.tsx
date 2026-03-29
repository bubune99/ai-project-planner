"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Bot,
  Plus,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Zap,
  Brain,
  Sparkles,
  CircleDot,
  Filter,
  XCircle,
} from "lucide-react"

// --- Types ---

interface AgentData {
  id: string
  name: string
  status: "active" | "idle" | "working" | "error"
  currentTaskId: string | null
  lastActiveAt: string | null
  capabilities: Record<string, any>
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
  currentTask: {
    id: string
    title: string
    status: string
  } | null
}

interface JobData {
  id: string
  title: string
  description: string | null
  createdBy: string
  assignedTo: string | null
  status: "pending" | "assigned" | "in_progress" | "completed" | "failed" | "cancelled"
  priority: "low" | "normal" | "high" | "critical"
  input: Record<string, any>
  result: any
  error: string | null
  parentJobId: string | null
  progress: number
  conversationId: string | null
  tags: string[]
  startedAt: string | null
  completedAt: string | null
  expiresAt: string | null
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
  agent: {
    id: string
    name: string
    status: string
  } | null
}

interface CreateJobForm {
  title: string
  description: string
  priority: "low" | "normal" | "high" | "critical"
  assignedTo: string
}

// --- Constants ---

const agentIcons: Record<string, React.ReactNode> = {
  v0: <Zap className="h-5 w-5 text-cyan-400" />,
  claude: <Brain className="h-5 w-5 text-purple-400" />,
  gemini: <Sparkles className="h-5 w-5 text-blue-400" />,
  gpt: <Bot className="h-5 w-5 text-green-400" />,
}

const statusConfig: Record<string, { color: string; bgColor: string; label: string; icon: React.ReactNode }> = {
  active: {
    color: "text-green-400",
    bgColor: "bg-green-500",
    label: "Active",
    icon: <CircleDot className="h-3 w-3" />,
  },
  idle: {
    color: "text-gray-400",
    bgColor: "bg-gray-500",
    label: "Idle",
    icon: <Clock className="h-3 w-3" />,
  },
  working: {
    color: "text-yellow-400",
    bgColor: "bg-yellow-500",
    label: "Working",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  error: {
    color: "text-red-400",
    bgColor: "bg-red-500",
    label: "Error",
    icon: <AlertCircle className="h-3 w-3" />,
  },
}

const jobStatusConfig: Record<string, { color: string; borderColor: string; label: string }> = {
  pending: { color: "text-gray-400", borderColor: "border-gray-500/50", label: "Pending" },
  assigned: { color: "text-blue-400", borderColor: "border-blue-500/50", label: "Assigned" },
  in_progress: { color: "text-yellow-400", borderColor: "border-yellow-500/50", label: "In Progress" },
  completed: { color: "text-green-400", borderColor: "border-green-500/50", label: "Completed" },
  failed: { color: "text-red-400", borderColor: "border-red-500/50", label: "Failed" },
  cancelled: { color: "text-gray-500", borderColor: "border-gray-600/50", label: "Cancelled" },
}

const priorityConfig: Record<string, { color: string; borderColor: string }> = {
  critical: { color: "text-red-400", borderColor: "border-red-500/50" },
  high: { color: "text-orange-400", borderColor: "border-orange-500/50" },
  normal: { color: "text-blue-400", borderColor: "border-blue-500/50" },
  low: { color: "text-gray-400", borderColor: "border-gray-500/50" },
}

// --- Helpers ---

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "Never"
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const INITIAL_FORM: CreateJobForm = {
  title: "",
  description: "",
  priority: "normal",
  assignedTo: "",
}

// --- Component ---

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentData[]>([])
  const [jobs, setJobs] = useState<JobData[]>([])
  const [loading, setLoading] = useState(true)
  const [jobsLoading, setJobsLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [agentFilter, setAgentFilter] = useState<string>("all")

  // Job detail modal
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null)

  // Create job dialog
  const [showCreateJob, setShowCreateJob] = useState(false)
  const [createForm, setCreateForm] = useState<CreateJobForm>(INITIAL_FORM)
  const [creating, setCreating] = useState(false)

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents?withTask=true")
      if (res.ok) {
        const json = await res.json()
        if (json.success) {
          setAgents(json.data || [])
        }
      }
    } catch (err) {
      console.error("Failed to fetch agents:", err)
    }
  }, [])

  const fetchJobs = useCallback(async () => {
    try {
      setJobsLoading(true)
      const params = new URLSearchParams({ includeCompleted: "true", limit: "50" })
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (agentFilter !== "all") params.set("assignedTo", agentFilter)

      const res = await fetch(`/api/agents/jobs?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success) {
          setJobs(json.data || [])
        }
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err)
    } finally {
      setJobsLoading(false)
    }
  }, [statusFilter, agentFilter])

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true)
      await Promise.all([fetchAgents(), fetchJobs()])
      setLoading(false)
    }
    loadInitial()
  }, [fetchAgents, fetchJobs])

  useEffect(() => {
    fetchJobs()
  }, [statusFilter, agentFilter, fetchJobs])

  const handleCreateJob = async () => {
    if (!createForm.title.trim()) return

    try {
      setCreating(true)
      const body: Record<string, any> = {
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        priority: createForm.priority,
        createdBy: "user",
      }
      if (createForm.assignedTo && createForm.assignedTo !== "unassigned") {
        body.assignedTo = createForm.assignedTo
      }

      const res = await fetch("/api/agents/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setShowCreateJob(false)
        setCreateForm(INITIAL_FORM)
        await fetchJobs()
      }
    } catch (err) {
      console.error("Failed to create job:", err)
    } finally {
      setCreating(false)
    }
  }

  const handleRefresh = async () => {
    await Promise.all([fetchAgents(), fetchJobs()])
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-white/10 bg-black/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">AI Agents</h1>
                <p className="text-muted-foreground">
                  Monitor agents and manage jobs
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className="border-white/10 gap-2"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                  onClick={() => setShowCreateJob(true)}
                >
                  <Plus className="h-4 w-4" />
                  Create Job
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-8 space-y-8">
          {/* Agent Cards */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Registered Agents</h2>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-32 bg-white/10 rounded-xl" />
                ))}
              </div>
            ) : agents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {agents.map((agent) => {
                  const cfg = statusConfig[agent.status] || statusConfig.idle
                  return (
                    <Card key={agent.id} className="bg-black/40 border-white/10 hover:border-white/20 transition-colors">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-white/5">
                              {agentIcons[agent.name] || <Bot className="h-5 w-5 text-gray-400" />}
                            </div>
                            <div>
                              <h3 className="font-semibold text-white capitalize">{agent.name}</h3>
                              <div className={`flex items-center gap-1.5 text-xs ${cfg.color}`}>
                                {cfg.icon}
                                <span>{cfg.label}</span>
                              </div>
                            </div>
                          </div>
                          <div className={`h-2.5 w-2.5 rounded-full ${cfg.bgColor} ${agent.status === "active" || agent.status === "working" ? "animate-pulse" : ""}`} />
                        </div>
                        {agent.currentTask ? (
                          <div className="mt-3 p-2 rounded bg-white/5 border border-white/10">
                            <p className="text-xs text-gray-400">Current task:</p>
                            <p className="text-sm text-white truncate">{agent.currentTask.title}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 mt-3">
                            Last active: {formatTimestamp(agent.lastActiveAt)}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <Card className="bg-black/40 border-white/10">
                <CardContent className="py-8 text-center">
                  <Bot className="h-10 w-10 mx-auto mb-3 text-gray-500 opacity-50" />
                  <p className="text-gray-400">No agents registered yet.</p>
                  <p className="text-xs text-gray-500 mt-1">Agents register automatically when they connect.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Jobs Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Jobs</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px] bg-black/40 border-white/10 text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="assigned">Assigned</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={agentFilter} onValueChange={setAgentFilter}>
                    <SelectTrigger className="w-[140px] bg-black/40 border-white/10 text-sm">
                      <SelectValue placeholder="Agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.name} value={a.name}>
                          {a.name.charAt(0).toUpperCase() + a.name.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {jobsLoading && !loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full bg-white/10 rounded-xl" />
                ))}
              </div>
            ) : jobs.length > 0 ? (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-white/5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  <div className="col-span-4">Title</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Agent</div>
                  <div className="col-span-1">Priority</div>
                  <div className="col-span-1">Progress</div>
                  <div className="col-span-2">Created</div>
                </div>

                {/* Table Body */}
                {jobs.map((job) => {
                  const jsCfg = jobStatusConfig[job.status] || jobStatusConfig.pending
                  const pCfg = priorityConfig[job.priority] || priorityConfig.normal
                  return (
                    <div
                      key={job.id}
                      className="grid grid-cols-12 gap-4 px-4 py-3 border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors items-center"
                      onClick={() => setSelectedJob(job)}
                    >
                      <div className="col-span-4">
                        <p className="text-sm font-medium text-white truncate">{job.title}</p>
                        {job.description && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">{job.description}</p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <Badge variant="outline" className={`text-[11px] ${jsCfg.color} ${jsCfg.borderColor}`}>
                          {jsCfg.label}
                        </Badge>
                      </div>
                      <div className="col-span-2">
                        {job.agent ? (
                          <div className="flex items-center gap-1.5">
                            {agentIcons[job.agent.name] || <Bot className="h-3.5 w-3.5 text-gray-400" />}
                            <span className="text-sm text-gray-300 capitalize">{job.agent.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">Unassigned</span>
                        )}
                      </div>
                      <div className="col-span-1">
                        <Badge variant="outline" className={`text-[10px] ${pCfg.color} ${pCfg.borderColor}`}>
                          {job.priority}
                        </Badge>
                      </div>
                      <div className="col-span-1">
                        <div className="flex items-center gap-2">
                          <Progress value={job.progress} className="h-1.5 flex-1 bg-white/10" />
                          <span className="text-[10px] text-gray-400">{job.progress}%</span>
                        </div>
                      </div>
                      <div className="col-span-2 text-xs text-gray-400">
                        {formatTimestamp(job.createdAt)}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Card className="bg-black/40 border-white/10">
                <CardContent className="py-8 text-center">
                  <Clock className="h-10 w-10 mx-auto mb-3 text-gray-500 opacity-50" />
                  <p className="text-gray-400">No jobs found.</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {statusFilter !== "all" || agentFilter !== "all"
                      ? "Try adjusting your filters."
                      : "Create a job to get started."}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Job Detail Modal */}
        <Dialog open={selectedJob !== null} onOpenChange={(open) => { if (!open) setSelectedJob(null) }}>
          {selectedJob && (
            <DialogContent className="bg-black/90 border-white/10 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-white">{selectedJob.title}</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Job ID: {selectedJob.id.slice(0, 8)}...
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {selectedJob.description && (
                  <div>
                    <Label className="text-xs text-gray-400">Description</Label>
                    <p className="text-sm text-gray-200 mt-1">{selectedJob.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-gray-400">Status</Label>
                    <div className="mt-1">
                      <Badge
                        variant="outline"
                        className={`${jobStatusConfig[selectedJob.status]?.color || "text-gray-400"} ${jobStatusConfig[selectedJob.status]?.borderColor || ""}`}
                      >
                        {jobStatusConfig[selectedJob.status]?.label || selectedJob.status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">Priority</Label>
                    <div className="mt-1">
                      <Badge
                        variant="outline"
                        className={`${priorityConfig[selectedJob.priority]?.color || "text-gray-400"} ${priorityConfig[selectedJob.priority]?.borderColor || ""}`}
                      >
                        {selectedJob.priority}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">Assigned To</Label>
                    <p className="text-sm text-gray-200 mt-1 capitalize">
                      {selectedJob.agent?.name || "Unassigned"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">Created By</Label>
                    <p className="text-sm text-gray-200 mt-1">{selectedJob.createdBy}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Progress</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <Progress value={selectedJob.progress} className="h-2 flex-1 bg-white/10" />
                    <span className="text-sm text-gray-300">{selectedJob.progress}%</span>
                  </div>
                </div>
                {selectedJob.tags.length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-400">Tags</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selectedJob.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs border-white/20 text-gray-300">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
                  <div>
                    <span className="block text-gray-500">Created</span>
                    {formatTimestamp(selectedJob.createdAt)}
                  </div>
                  {selectedJob.startedAt && (
                    <div>
                      <span className="block text-gray-500">Started</span>
                      {formatTimestamp(selectedJob.startedAt)}
                    </div>
                  )}
                  {selectedJob.completedAt && (
                    <div>
                      <span className="block text-gray-500">Completed</span>
                      {formatTimestamp(selectedJob.completedAt)}
                    </div>
                  )}
                </div>
                {selectedJob.error && (
                  <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10">
                    <Label className="text-xs text-red-400">Error</Label>
                    <p className="text-sm text-red-300 mt-1 font-mono">{selectedJob.error}</p>
                  </div>
                )}
                {selectedJob.result && (
                  <div>
                    <Label className="text-xs text-gray-400">Result</Label>
                    <pre className="text-xs text-gray-300 mt-1 p-2 bg-white/5 rounded overflow-auto max-h-32 font-mono">
                      {typeof selectedJob.result === "string"
                        ? selectedJob.result
                        : JSON.stringify(selectedJob.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </DialogContent>
          )}
        </Dialog>

        {/* Create Job Dialog */}
        <Dialog open={showCreateJob} onOpenChange={setShowCreateJob}>
          <DialogContent className="bg-black/90 border-white/10 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Create Job</DialogTitle>
              <DialogDescription className="text-gray-400">
                Create a new job and optionally assign it to an agent.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="job-title" className="text-gray-300">Title</Label>
                <Input
                  id="job-title"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="Enter job title"
                  className="mt-1 bg-white/5 border-white/10"
                />
              </div>
              <div>
                <Label htmlFor="job-desc" className="text-gray-300">Description</Label>
                <Textarea
                  id="job-desc"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Describe what this job should accomplish"
                  className="mt-1 bg-white/5 border-white/10 resize-none"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300">Priority</Label>
                  <Select
                    value={createForm.priority}
                    onValueChange={(v) => setCreateForm({ ...createForm, priority: v as CreateJobForm["priority"] })}
                  >
                    <SelectTrigger className="mt-1 bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-300">Assign To</Label>
                  <Select
                    value={createForm.assignedTo || "unassigned"}
                    onValueChange={(v) => setCreateForm({ ...createForm, assignedTo: v })}
                  >
                    <SelectTrigger className="mt-1 bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.name} value={a.name}>
                          {a.name.charAt(0).toUpperCase() + a.name.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="border-white/10"
                onClick={() => setShowCreateJob(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleCreateJob}
                disabled={creating || !createForm.title.trim()}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Job"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
