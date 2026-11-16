"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { JOB_STATUSES, canCancelJob, canDeleteJob, createdInLastDay, filterJobs, jobStatusLabel, jobStatusTone, showsProgress, whenLabel } from "@/lib/agents/jobs-view"

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
  status: string
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

const priorityTone: Record<string, string> = {
  critical: "j-neg", high: "j-warn", normal: "j-info", low: "j-muted",
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const INITIAL_FORM: CreateJobForm = {
  title: "",
  description: "",
  priority: "normal",
  assignedTo: "",
}

const fieldLabel: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--opx-muted)", marginBottom: 6 }

// --- Component ---

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentData[]>([])
  // Every job the server returns, unfiltered: the filters and the counts are both worked out from this one
  // list, so a count never changes because a filter was chosen.
  const [allJobs, setAllJobs] = useState<JobData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [agentFilter, setAgentFilter] = useState<string>("all")

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<"cancel" | "delete" | null>(null)
  const [acting, setActing] = useState(false)

  const [showCreateJob, setShowCreateJob] = useState(false)
  const [createForm, setCreateForm] = useState<CreateJobForm>(INITIAL_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/agents?withTask=true")
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) throw new Error(json?.error?.message || "The agents could not be loaded")
    setAgents(json.data || [])
  }, [])

  const fetchJobs = useCallback(async () => {
    const res = await fetch("/api/agents/jobs?includeCompleted=true&limit=100")
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) throw new Error(json?.error?.message || "The jobs could not be loaded")
    setAllJobs(json.data || [])
  }, [])

  const load = useCallback(async (say?: boolean) => {
    try {
      await Promise.all([fetchAgents(), fetchJobs()])
      setLoadError("")
      if (say) toast.success("Up to date")
    } catch (err) {
      const m = err instanceof Error ? err.message : "This page could not be loaded"
      setLoadError(m)
      if (say) toast.error(m)
    } finally {
      setLoading(false)
    }
  }, [fetchAgents, fetchJobs])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const jobs = useMemo(() => filterJobs(allJobs, statusFilter, agentFilter), [allJobs, statusFilter, agentFilter])
  const filtered = statusFilter !== "all" || agentFilter !== "all"
  const selectedJob = allJobs.find((j) => j.id === selectedId) || null
  const closeJob = () => { setSelectedId(null); setConfirming(null) }

  const handleCreateJob = async () => {
    if (!createForm.title.trim()) { setCreateError("Give the job a title first."); return }
    try {
      setCreating(true)
      setCreateError("")
      const body: Record<string, any> = {
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        priority: createForm.priority,
        createdBy: "user",
      }
      if (createForm.assignedTo && createForm.assignedTo !== "unassigned") body.assignedTo = createForm.assignedTo

      const res = await fetch("/api/agents/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.success === false) { setCreateError(json?.error?.message || "The job was not created. Try again."); return }
      setShowCreateJob(false)
      setCreateForm(INITIAL_FORM)
      toast.success("Job created")
      await fetchJobs().catch(() => {})
    } catch {
      setCreateError("The job was not created. Check your connection and try again.")
    } finally {
      setCreating(false)
    }
  }

  const cancelJob = async (job: JobData) => {
    setActing(true)
    try {
      const res = await fetch(`/api/agents/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", cancelledBy: "user", reason: "Cancelled from the Agents page" }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.success === false) { toast.error(json?.error?.message || "The job was not cancelled"); return }
      toast.success("Job cancelled")
      setConfirming(null)
      await fetchJobs().catch(() => {})
    } catch { toast.error("The job was not cancelled") } finally { setActing(false) }
  }

  const deleteJob = async (job: JobData) => {
    setActing(true)
    try {
      const res = await fetch(`/api/agents/jobs/${job.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.success === false) { toast.error(json?.error?.message || "The job was not removed"); return }
      toast.success("Job removed")
      closeJob()
      await fetchJobs().catch(() => {})
    } catch { toast.error("The job was not removed") } finally { setActing(false) }
  }

  const stats = [
    { l: "Agents", v: agents.length, s: "registered" },
    { l: "Active", v: agents.filter(a => a.status === "active").length, s: "connected now" },
    { l: "Working", v: agents.filter(a => a.status === "working").length, s: "on a job now" },
    { l: "Jobs · 24h", v: createdInLastDay(allJobs, now), s: `created in the last day, of ${allJobs.length} listed` },
  ]

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4 opx-agents">
        {loadError && (
          <div role="alert" className="j-card" style={{ padding: 14, color: "var(--opx-ink)" }}>
            {loadError}. <button className="opx-btn sm" style={{ marginLeft: 8 }} onClick={() => load(true)}>Try again</button>
          </div>
        )}

        {/* Stats strip */}
        <div className="opx-agrid">
          {stats.map(s => (
            <div key={s.l} className="j-card j-tight" style={{ padding: 16 }}>
              <div className="j-eyebrow">{s.l}</div>
              <div className="j-amount-lg" style={{ marginTop: 8 }}>{loading ? "–" : s.v}</div>
              <div className="opx-muted" style={{ fontSize: 12, marginTop: 4 }}>{s.s}</div>
            </div>
          ))}
        </div>

        {/* Agent cards */}
        <div className="j-col j-gap-3">
          <div className="j-row j-between">
            <h3 className="j-card-title" style={{ fontSize: 15 }}>Registered agents</h3>
            <button className="opx-btn sm" onClick={() => load(true)}>Refresh</button>
          </div>
          {loading ? (
            <div className="opx-agrid">
              {[1,2,3,4].map(i => (
                <div key={i} className="j-card" style={{ height: 100, background: "var(--opx-soft)" }} />
              ))}
            </div>
          ) : agents.length > 0 ? (
            <div className="opx-agrid">
              {agents.map((agent) => {
                const tone  = agentStatusTone[agent.status]  || "j-muted"
                const label = agentStatusLabel[agent.status] || cap(String(agent.status))
                return (
                  <div key={agent.id} className="j-card">
                    <div className="j-row j-between" style={{ marginBottom: 12 }}>
                      <div className="j-row j-gap-3" style={{ minWidth: 0 }}>
                        <div className="j-avatar" style={{ width: 32, height: 32, fontSize: 12, flexShrink: 0 }}>{(agentInitials[agent.name] || agent.name.slice(0,2)).toUpperCase()}</div>
                        <div style={{ fontWeight: 500, textTransform: "capitalize", overflowWrap: "anywhere" }}>{agent.name}</div>
                      </div>
                      <span className={`j-pill ${tone}`} style={{ fontSize: 12 }}>{label}</span>
                    </div>
                    {agent.currentTask ? (
                      <div className="opx-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                        <span style={{ display: "block", marginBottom: 2 }}>Current task:</span>
                        <span style={{ fontWeight: 500, color: "var(--opx-ink)" }}>{agent.currentTask.title}</span>
                      </div>
                    ) : (
                      <div className="opx-muted" style={{ fontSize: 12 }}>Last active: {whenLabel(agent.lastActiveAt, now)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="j-coming-soon" style={{ padding: 32 }}>
              <p className="opx-muted" style={{ margin: 0, fontSize: 13 }}>No agents registered yet. Agents register automatically when they connect.</p>
            </div>
          )}
        </div>

        {/* Jobs table */}
        <div className="j-card" style={{ padding: 0 }}>
          <div className="j-row j-between j-wrap" style={{ padding: 16, gap: 10 }}>
            <h3 className="j-card-title">Jobs <span className="opx-muted" style={{ fontWeight: 400, fontSize: 13 }}>{filtered ? `${jobs.length} of ${allJobs.length}` : allJobs.length}</span></h3>
            <div className="j-row j-gap-2 j-wrap">
              <select className="opx-input opx-afilter" aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">Status: all</option>
                {JOB_STATUSES.map((s) => <option key={s} value={s}>{jobStatusLabel(s)}</option>)}
              </select>
              <select className="opx-input opx-afilter" aria-label="Filter by agent" value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
                <option value="all">Agent: all</option>
                <option value="unassigned">Unassigned</option>
                {agents.map(a => <option key={a.name} value={a.name}>{cap(a.name)}</option>)}
              </select>
              {filtered && <button className="opx-btn sm" onClick={() => { setStatusFilter("all"); setAgentFilter("all") }}>Show everything</button>}
              <button className="opx-btn primary" onClick={() => { setCreateError(""); setShowCreateJob(true) }}>Create job</button>
            </div>
          </div>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <span className="opx-muted" style={{ fontSize: 13 }}>Loading jobs…</span>
            </div>
          ) : jobs.length > 0 ? (
            <div className="opx-ascroll">
              <table className="j-table">
                <thead>
                  <tr><th>Title</th><th>Status</th><th>Agent</th><th>Priority</th><th>Progress</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <button type="button" className="opx-ajob" onClick={() => setSelectedId(job.id)} aria-label={`Open job: ${job.title}`}>
                          <span className="opx-ajob-t">{job.title}</span>
                          {job.description && <span className="opx-ajob-d">{job.description}</span>}
                        </button>
                      </td>
                      <td><span className={`j-pill ${jobStatusTone(job.status)}`}>{jobStatusLabel(job.status)}</span></td>
                      <td>
                        <span className="opx-muted" style={{ textTransform: job.agent ? "capitalize" : undefined, fontSize: 13 }}>{job.agent ? job.agent.name : "Unassigned"}</span>
                      </td>
                      <td><span className={`j-pill ${priorityTone[job.priority] || "j-muted"}`}>{cap(job.priority)}</span></td>
                      <td>
                        {showsProgress(job.status) ? (
                          <div className="j-row j-gap-2" style={{ minWidth: 90 }}>
                            <div className="j-progress" style={{ flex: 1 }}><span style={{ width: `${job.progress}%` }} /></div>
                            <span className="j-num opx-muted" style={{ fontSize: 12, minWidth: 32 }}>{job.progress}%</span>
                          </div>
                        ) : <span className="opx-muted" aria-label="No progress to show">–</span>}
                      </td>
                      <td className="opx-muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{whenLabel(job.createdAt, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 32, textAlign: "center" }}>
              <p className="opx-muted" style={{ fontSize: 13, margin: 0 }}>
                {filtered ? "No jobs match these filters." : "No jobs yet. Create one to get started."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Job detail */}
      <Dialog open={selectedJob !== null} onOpenChange={(open) => { if (!open) closeJob() }}>
        {selectedJob && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedJob.title}</DialogTitle>
              <DialogDescription>Created {whenLabel(selectedJob.createdAt, now)} by {selectedJob.createdBy === "user" ? "you" : selectedJob.createdBy}</DialogDescription>
            </DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
              {selectedJob.description && (
                <div>
                  <div style={fieldLabel}>Description</div>
                  <p style={{ fontSize: 14, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selectedJob.description}</p>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={fieldLabel}>Status</div>
                  <span className={`j-pill ${jobStatusTone(selectedJob.status)}`}>{jobStatusLabel(selectedJob.status)}</span>
                </div>
                <div>
                  <div style={fieldLabel}>Priority</div>
                  <span className={`j-pill ${priorityTone[selectedJob.priority] || "j-muted"}`}>{cap(selectedJob.priority)}</span>
                </div>
                <div>
                  <div style={fieldLabel}>Assigned to</div>
                  <p style={{ fontSize: 14, margin: 0, textTransform: selectedJob.agent ? "capitalize" : undefined }}>{selectedJob.agent?.name || "Unassigned"}</p>
                </div>
                {showsProgress(selectedJob.status) && (
                  <div>
                    <div style={fieldLabel}>Progress</div>
                    <div className="j-row j-gap-2">
                      <div className="j-progress" style={{ flex: 1, height: 6 }}><span style={{ width: `${selectedJob.progress}%` }} /></div>
                      <span className="j-num" style={{ fontSize: 13 }}>{selectedJob.progress}%</span>
                    </div>
                  </div>
                )}
              </div>
              {selectedJob.tags.length > 0 && (
                <div>
                  <div style={fieldLabel}>Tags</div>
                  <div className="j-row j-wrap j-gap-2">
                    {selectedJob.tags.map(tag => <span key={tag} className="j-pill j-ghost" style={{ fontSize: 12 }}>{tag}</span>)}
                  </div>
                </div>
              )}
              {selectedJob.error && (
                <div role="alert" style={{ padding: 12, borderRadius: 8, border: "1px solid color-mix(in srgb, var(--opx-hot) 40%, transparent)", background: "color-mix(in srgb, var(--opx-hot) 10%, transparent)" }}>
                  <div style={fieldLabel}>Error</div>
                  <p style={{ fontSize: 13, margin: 0, overflowWrap: "anywhere" }}>{selectedJob.error}</p>
                </div>
              )}
              {selectedJob.status === "awaiting-unlock" && (
                <p className="opx-muted" style={{ fontSize: 13, margin: 0 }}>This job is waiting on your answer. <Link href="/inbox" style={{ color: "var(--opx-ink)", textDecoration: "underline" }}>Answer it in the inbox</Link>.</p>
              )}
            </div>
            <DialogFooter>
              {confirming ? (
                <div className="j-row j-gap-2 j-wrap" style={{ width: "100%", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 13, marginRight: "auto" }}>{confirming === "cancel" ? "Cancel this job? The agent will stop working on it." : "Remove this job for good? This cannot be undone."}</span>
                  <button className="opx-btn" onClick={() => setConfirming(null)} disabled={acting}>Keep it</button>
                  <button className="opx-btn danger" disabled={acting} onClick={() => (confirming === "cancel" ? cancelJob(selectedJob) : deleteJob(selectedJob))}>
                    {acting ? "Working…" : confirming === "cancel" ? "Yes, cancel the job" : "Yes, remove it"}
                  </button>
                </div>
              ) : (
                <div className="j-row j-gap-2 j-wrap" style={{ width: "100%", justifyContent: "flex-end" }}>
                  {canCancelJob(selectedJob.status) && <button className="opx-btn" onClick={() => setConfirming("cancel")}>Cancel job</button>}
                  {canDeleteJob(selectedJob.status) && <button className="opx-btn danger" onClick={() => setConfirming("delete")}>Remove</button>}
                  <button className="opx-btn primary" onClick={closeJob}>Done</button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Create job */}
      <Dialog open={showCreateJob} onOpenChange={setShowCreateJob}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create job</DialogTitle>
            <DialogDescription>Create a new job and optionally assign it to an agent.</DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
            <label>
              <span style={fieldLabel}>Title</span>
              <input className="opx-input" value={createForm.title} onChange={(e) => { setCreateForm({ ...createForm, title: e.target.value }); if (createError) setCreateError("") }} placeholder="What should be done" />
            </label>
            <label>
              <span style={fieldLabel}>Description</span>
              <textarea className="opx-input" value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Describe what this job should accomplish" rows={3} style={{ resize: "vertical" }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                <span style={fieldLabel}>Priority</span>
                <select className="opx-input" value={createForm.priority} onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value as CreateJobForm["priority"] })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
              <label>
                <span style={fieldLabel}>Assign to</span>
                <select className="opx-input" value={createForm.assignedTo || "unassigned"} onChange={(e) => setCreateForm({ ...createForm, assignedTo: e.target.value })}>
                  <option value="unassigned">Unassigned</option>
                  {agents.map(a => <option key={a.name} value={a.name}>{cap(a.name)}</option>)}
                </select>
              </label>
            </div>
            {createError && <p role="alert" style={{ fontSize: 13, margin: 0, color: "var(--opx-ink)" }}>{createError}</p>}
          </div>
          <DialogFooter>
            <button className="opx-btn" onClick={() => setShowCreateJob(false)}>Cancel</button>
            <button className="opx-btn primary" onClick={handleCreateJob} disabled={creating}>
              {creating ? "Creating…" : "Create job"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
