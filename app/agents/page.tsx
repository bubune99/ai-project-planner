"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

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

const agentInitials: Record<string, string> = {
  v0: "V0", claude: "CL", gemini: "GE", gpt: "GP",
}

const agentStatusTone: Record<string, string> = {
  active: "j-pos", idle: "j-muted", working: "j-proj", error: "j-neg",
}

const agentStatusLabel: Record<string, string> = {
  active: "Active", idle: "Idle", working: "Working", error: "Error",
}

const jobStatusTone: Record<string, string> = {
  pending: "j-muted", assigned: "j-info", in_progress: "j-proj",
  completed: "j-pos", failed: "j-neg", cancelled: "j-muted",
}

const jobStatusLabel: Record<string, string> = {
  pending: "Pending", assigned: "Assigned", in_progress: "In Progress",
  completed: "Completed", failed: "Failed", cancelled: "Cancelled",
}

const priorityTone: Record<string, string> = {
  critical: "j-neg", high: "j-warn", normal: "j-info", low: "j-muted",
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
      <div className="j-content j-col j-gap-4">
        {/* Stats strip */}
        <div className="j-grid j-cols-4">
          {[
            { l: "Total agents",   v: agents.length,                                        t: "j-info" },
            { l: "Active",         v: agents.filter(a => a.status === "active").length,      t: "j-pos"  },
            { l: "Working",        v: agents.filter(a => a.status === "working").length,     t: "j-proj" },
            { l: "Jobs · 24h",     v: jobs.length,                                          t: "j-muted"},
          ].map(s => (
            <div key={s.l} className="j-card j-tight" style={{ padding: 16 }}>
              <div className="j-eyebrow">{s.l}</div>
              <div className="j-amount-lg" style={{ marginTop: 8 }}>{s.v}</div>
              <span className={`j-pill ${s.t}`} style={{ marginTop: 8 }}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* Agent cards */}
        <div className="j-col j-gap-3">
          <div className="j-row j-between">
            <h3 className="j-card-title" style={{ fontSize: 15 }}>Registered agents</h3>
            <button className="j-btn j-btn-ghost" onClick={handleRefresh} style={{ fontSize: 12 }}>↺ Refresh</button>
          </div>
          {loading ? (
            <div className="j-grid j-cols-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="j-card" style={{ height: 100, background: "oklch(1 0 0 / 0.04)" }} />
              ))}
            </div>
          ) : agents.length > 0 ? (
            <div className="j-grid j-cols-4">
              {agents.map((agent) => {
                const tone  = agentStatusTone[agent.status]  || "j-muted"
                const label = agentStatusLabel[agent.status] || agent.status
                return (
                  <div key={agent.id} className="j-card">
                    <div className="j-row j-between" style={{ marginBottom: 12 }}>
                      <div className="j-row j-gap-3">
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: agent.status === "active" || agent.status === "working" ? "oklch(0.870 0.045 252 / 0.18)" : "oklch(1 0 0 / 0.06)", display: "grid", placeItems: "center" }}>
                          <div className="j-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>{(agentInitials[agent.name] || agent.name.slice(0,2)).toUpperCase()}</div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, textTransform: "capitalize" }}>{agent.name}</div>
                          <div className="j-muted" style={{ fontSize: 11 }}>{label}</div>
                        </div>
                      </div>
                      {agent.status === "active" || agent.status === "working"
                        ? <span className="j-dot-pulse" />
                        : <span className={`j-pill ${tone}`} style={{ fontSize: 9 }}>{label}</span>}
                    </div>
                    {agent.currentTask ? (
                      <div className="j-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                        <span style={{ fontSize: 10, display: "block", marginBottom: 2 }}>Current task:</span>
                        <span style={{ fontWeight: 500, color: "oklch(0.860 0 0)" }}>{agent.currentTask.title}</span>
                      </div>
                    ) : (
                      <div className="j-muted" style={{ fontSize: 11 }}>Last active: {formatTimestamp(agent.lastActiveAt)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="j-coming-soon" style={{ padding: 32 }}>
              <p className="j-muted" style={{ margin: 0, fontSize: 13 }}>No agents registered yet. Agents register automatically when they connect.</p>
            </div>
          )}
        </div>

        {/* Jobs table */}
        <div className="j-card" style={{ padding: 0 }}>
          <div className="j-row j-between" style={{ padding: 16 }}>
            <h3 className="j-card-title">Jobs</h3>
            <div className="j-row j-gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ background: "oklch(0.180 0 0)", border: "1px solid var(--j-ring)", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "oklch(0.860 0 0)", cursor: "pointer" }}
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={agentFilter}
                onChange={e => setAgentFilter(e.target.value)}
                style={{ background: "oklch(0.180 0 0)", border: "1px solid var(--j-ring)", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "oklch(0.860 0 0)", cursor: "pointer" }}
              >
                <option value="all">All agents</option>
                {agents.map(a => (
                  <option key={a.name} value={a.name}>{a.name.charAt(0).toUpperCase() + a.name.slice(1)}</option>
                ))}
              </select>
              <button className="j-btn j-btn-primary" onClick={() => setShowCreateJob(true)}>+ Create job</button>
            </div>
          </div>
          {jobsLoading && !loading ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <span className="j-muted" style={{ fontSize: 13 }}>Loading jobs…</span>
            </div>
          ) : jobs.length > 0 ? (
            <table className="j-table">
              <thead>
                <tr><th>Title</th><th>Status</th><th>Agent</th><th>Priority</th><th>Progress</th><th>Created</th></tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} style={{ cursor: "pointer" }} onClick={() => setSelectedJob(job)}>
                    <td>
                      <div style={{ fontWeight: 500, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</div>
                      {job.description && <div className="j-muted" style={{ fontSize: 11, marginTop: 2 }}>{job.description.slice(0, 60)}</div>}
                    </td>
                    <td><span className={`j-pill ${jobStatusTone[job.status] || "j-muted"}`}>{jobStatusLabel[job.status] || job.status}</span></td>
                    <td>
                      {job.agent ? (
                        <div className="j-row j-gap-2">
                          <div className="j-avatar" style={{ width: 20, height: 20, fontSize: 9 }}>{(agentInitials[job.agent.name] || job.agent.name.slice(0,2)).toUpperCase()}</div>
                          <span className="j-muted" style={{ textTransform: "capitalize", fontSize: 12 }}>{job.agent.name}</span>
                        </div>
                      ) : (
                        <span className="j-muted" style={{ fontSize: 12 }}>Unassigned</span>
                      )}
                    </td>
                    <td><span className={`j-pill ${priorityTone[job.priority] || "j-muted"}`}>{job.priority}</span></td>
                    <td>
                      <div className="j-row j-gap-2" style={{ minWidth: 80 }}>
                        <div className="j-progress" style={{ flex: 1 }}><span style={{ width: `${job.progress}%` }} /></div>
                        <span className="j-num j-muted" style={{ fontSize: 10, minWidth: 28 }}>{job.progress}%</span>
                      </div>
                    </td>
                    <td className="j-muted" style={{ fontSize: 12 }}>{formatTimestamp(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 32, textAlign: "center" }}>
              <p className="j-muted" style={{ fontSize: 13, margin: 0 }}>
                {statusFilter !== "all" || agentFilter !== "all" ? "No jobs match your filters." : "No jobs yet. Create one to get started."}
              </p>
            </div>
          )}
        </div>
      </div>

        {/* Job Detail Modal */}
        <Dialog open={selectedJob !== null} onOpenChange={(open) => { if (!open) setSelectedJob(null) }}>
          {selectedJob && (
            <DialogContent className="bg-black/90 border-white/10 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-white">{selectedJob.title}</DialogTitle>
                <DialogDescription className="text-gray-400">Job ID: {selectedJob.id.slice(0, 8)}…</DialogDescription>
              </DialogHeader>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
                {selectedJob.description && (
                  <div>
                    <Label className="text-xs text-gray-400">Description</Label>
                    <p className="j-muted" style={{ fontSize: 13, marginTop: 4 }}>{selectedJob.description}</p>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <Label className="text-xs text-gray-400">Status</Label>
                    <div style={{ marginTop: 4 }}><span className={`j-pill ${jobStatusTone[selectedJob.status] || "j-muted"}`}>{jobStatusLabel[selectedJob.status] || selectedJob.status}</span></div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">Priority</Label>
                    <div style={{ marginTop: 4 }}><span className={`j-pill ${priorityTone[selectedJob.priority] || "j-muted"}`}>{selectedJob.priority}</span></div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">Assigned to</Label>
                    <p style={{ fontSize: 13, marginTop: 4, textTransform: "capitalize" }}>{selectedJob.agent?.name || "Unassigned"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">Created by</Label>
                    <p style={{ fontSize: 13, marginTop: 4 }}>{selectedJob.createdBy}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Progress</Label>
                  <div className="j-row j-gap-2" style={{ marginTop: 6 }}>
                    <div className="j-progress" style={{ flex: 1, height: 6 }}><span style={{ width: `${selectedJob.progress}%` }} /></div>
                    <span className="j-num" style={{ fontSize: 12 }}>{selectedJob.progress}%</span>
                  </div>
                </div>
                {selectedJob.tags.length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-400">Tags</Label>
                    <div className="j-row j-wrap j-gap-2" style={{ marginTop: 6 }}>
                      {selectedJob.tags.map(tag => <span key={tag} className="j-pill j-ghost" style={{ fontSize: 11 }}>{tag}</span>)}
                    </div>
                  </div>
                )}
                {selectedJob.error && (
                  <div style={{ padding: 12, borderRadius: 8, border: "1px solid oklch(0.396 0.141 22 / 0.4)", background: "oklch(0.396 0.141 22 / 0.1)" }}>
                    <Label className="text-xs" style={{ color: "var(--j-neg)" }}>Error</Label>
                    <p style={{ fontSize: 12, marginTop: 4, fontFamily: "monospace", color: "var(--j-neg)" }}>{selectedJob.error}</p>
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
              <DialogTitle className="text-white">Create job</DialogTitle>
              <DialogDescription className="text-gray-400">Create a new job and optionally assign it to an agent.</DialogDescription>
            </DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
              <div>
                <Label htmlFor="job-title" className="text-gray-300">Title</Label>
                <input
                  id="job-title"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="Enter job title"
                  style={{ width: "100%", marginTop: 6, background: "oklch(0.180 0 0)", border: "1px solid var(--j-ring)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "oklch(0.985 0 0)", outline: "none" }}
                />
              </div>
              <div>
                <Label htmlFor="job-desc" className="text-gray-300">Description</Label>
                <textarea
                  id="job-desc"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Describe what this job should accomplish"
                  rows={3}
                  style={{ width: "100%", marginTop: 6, background: "oklch(0.180 0 0)", border: "1px solid var(--j-ring)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "oklch(0.985 0 0)", outline: "none", resize: "none", fontFamily: "inherit" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label className="text-gray-300">Priority</Label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value as CreateJobForm["priority"] })}
                    style={{ width: "100%", marginTop: 6, background: "oklch(0.180 0 0)", border: "1px solid var(--j-ring)", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "oklch(0.985 0 0)", cursor: "pointer" }}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <Label className="text-gray-300">Assign to</Label>
                  <select
                    value={createForm.assignedTo || "unassigned"}
                    onChange={(e) => setCreateForm({ ...createForm, assignedTo: e.target.value })}
                    style={{ width: "100%", marginTop: 6, background: "oklch(0.180 0 0)", border: "1px solid var(--j-ring)", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "oklch(0.985 0 0)", cursor: "pointer" }}
                  >
                    <option value="unassigned">Unassigned</option>
                    {agents.map(a => <option key={a.name} value={a.name}>{a.name.charAt(0).toUpperCase() + a.name.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <button className="j-btn j-btn-ghost" onClick={() => setShowCreateJob(false)}>Cancel</button>
              <button className="j-btn j-btn-primary" onClick={handleCreateJob} disabled={creating || !createForm.title.trim()}>
                {creating ? "Creating…" : "Create job"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </DashboardLayout>
  )
}
