"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/navigation"
import { Icon } from "@/components/jarvis/icons"

interface Client {
  id: string
  name: string
  company: string | null
  contactEmail: string | null
  contactPhone: string | null
  status: "active" | "paused" | "churned" | "prospect"
  billingReference: string | null
  notes: string | null
  projectCount: number
  activeScheduleCount: number
  nextServiceDate: string | null
}

interface Schedule {
  id: string
  title: string
  description: string | null
  frequency: string
  nextOccurrence: string
  lastPerformedAt: string | null
  amount: number | null
  currency: string
  isActive: boolean
  projectId: string | null
  projectName: string | null
  sopId: string | null
  sopTitle: string | null
}

interface ClientDetail extends Client {
  projects: { id: string; name: string; status: string; phase: string | null; progress: number; health: string | null }[]
  schedules: Schedule[]
}

type Counts = { active: number; paused: number; churned: number; prospect: number; total: number }

const STATUSES = ["active", "paused", "prospect", "churned"] as const
const STATUS_PILL: Record<string, string> = { active: "j-pos", paused: "j-warn", prospect: "j-ghost", churned: "j-muted" }
const FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"] as const

const emptyClient = {
  name: "", company: "", contactEmail: "", contactPhone: "",
  status: "active" as Client["status"], billingReference: "", notes: "",
}
function emptySchedule() {
  return {
    title: "", description: "", frequency: "monthly",
    nextOccurrence: new Date().toISOString().slice(0, 10),
    projectId: "", sopId: "", amount: "", currency: "USD",
  }
}

function dueClass(date: string | null): string {
  if (!date) return "j-muted"
  const today = new Date().toISOString().slice(0, 10)
  if (date < today) return "j-neg"
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  return date <= soon ? "j-warn" : "j-pos"
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [counts, setCounts] = useState<Counts>({ active: 0, paused: 0, churned: 0, prospect: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState(emptyClient)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<ClientDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [schedForm, setSchedForm] = useState(emptySchedule())
  const [showSched, setShowSched] = useState(false)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [sops, setSops] = useState<{ id: string; title: string }[]>([])

  const listSeq = useRef(0)
  const fetchClients = useCallback(async () => {
    // Only the newest request may fill the list: an older answer arriving late must not replace it.
    const mine = ++listSeq.current
    try {
      setLoading(true)
      const qs = new URLSearchParams()
      if (filter) qs.set("status", filter)
      if (search.trim()) qs.set("search", search.trim())
      const res = await fetch(`/api/clients?${qs.toString()}`)
      const json = await res.json()
      if (mine !== listSeq.current) return
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Failed to load clients")
      setClients(json.data || [])
      if (json.meta?.counts) setCounts(json.meta.counts)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load clients")
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { fetchClients() }, [fetchClients])

  const loadLookups = useCallback(async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/sops?status=active"),
      ])
      const pJson = await pRes.json().catch(() => null)
      const sJson = await sRes.json().catch(() => null)
      if (pJson?.success) setProjects((pJson.data || []).map((p: any) => ({ id: p.id, name: p.name })))
      if (sJson?.success) setSops((sJson.data || []).map((s: any) => ({ id: s.id, title: s.title })))
    } catch { /* lookups are best-effort */ }
  }, [])

  const openDetail = useCallback(async (id: string) => {
    if (expanded === id) { setExpanded(null); setDetail(null); return }
    setExpanded(id); setDetail(null); setDetailLoading(true); setShowSched(false)
    try {
      const res = await fetch(`/api/clients/${id}`)
      const json = await res.json()
      if (json.success) setDetail(json.data)
      if (!projects.length || !sops.length) loadLookups()
    } finally {
      setDetailLoading(false)
    }
  }, [expanded, projects.length, sops.length, loadLookups])

  const openCreate = () => { setEditing(null); setForm(emptyClient); setShowForm(true); setErr(null) }
  const openEdit = (c: Client) => {
    setEditing(c)
    setForm({
      name: c.name, company: c.company ?? "", contactEmail: c.contactEmail ?? "",
      contactPhone: c.contactPhone ?? "", status: c.status,
      billingReference: c.billingReference ?? "", notes: c.notes ?? "",
    })
    setShowForm(true); setErr(null)
  }

  const saveClient = async () => {
    if (!form.name.trim()) { setErr("Give the client a name first."); return }
    try {
      setSaving(true)
      const res = await fetch(editing ? `/api/clients/${editing.id}` : "/api/clients", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Save failed")
      setShowForm(false); setEditing(null); setForm(emptyClient)
      await fetchClients()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const removeClient = async (c: Client) => {
    if (!confirm(`Delete client "${c.name}"? Linked projects are kept but unlinked.`)) return
    const res = await fetch(`/api/clients/${c.id}`, { method: "DELETE" }).catch(() => null)
    if (!res || !res.ok) { toast.error("The client was not deleted"); return }
    toast.success("Client deleted")
    if (expanded === c.id) { setExpanded(null); setDetail(null) }
    await fetchClients()
  }

  const addSchedule = async () => {
    if (!detail) return
    if (!schedForm.title.trim()) { setErr("Give the service a title first."); return }
    const res = await fetch("/api/service-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...schedForm, clientId: detail.id, amount: schedForm.amount || null }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) { setErr(json?.error?.message || "Failed to add schedule"); return }
    setShowSched(false); setSchedForm(emptySchedule()); setErr(null)
    await openDetailRefresh(detail.id)
    await fetchClients()
  }

  const openDetailRefresh = async (id: string) => {
    const res = await fetch(`/api/clients/${id}`)
    const json = await res.json()
    if (json.success) setDetail(json.data)
  }

  const performSchedule = async (s: Schedule) => {
    if (!detail) return
    const res = await fetch(`/api/service-schedules/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "perform" }),
    }).catch(() => null)
    if (!res || !res.ok) { toast.error("It was not marked as done"); return }
    toast.success("Marked as done")
    await openDetailRefresh(detail.id)
    await fetchClients()
  }

  const removeSchedule = async (s: Schedule) => {
    if (!detail) return
    if (!confirm(`Delete service "${s.title}"?`)) return
    const res = await fetch(`/api/service-schedules/${s.id}`, { method: "DELETE" }).catch(() => null)
    if (!res || !res.ok) { toast.error("The service was not deleted"); return }
    await openDetailRefresh(detail.id)
    await fetchClients()
  }

  return (
    <DashboardLayout>
      <div className="j-content">
        {/* Vitals + new */}
        <div className="j-row j-between j-wrap" style={{ gap: 12 }}>
          <div className="j-row" style={{ gap: 8 }}>
            <span className="j-tab" style={{ cursor: "default" }}>Clients <b style={{ marginLeft: 6 }}>{counts.total}</b></span>
            <span className="j-tab" style={{ cursor: "default" }}>Active <b style={{ marginLeft: 6 }}>{counts.active}</b></span>
            <span className="j-tab" style={{ cursor: "default" }}>Prospects <b style={{ marginLeft: 6 }}>{counts.prospect}</b></span>
          </div>
          <button className="j-btn j-btn-primary" onClick={openCreate}>
            <Icon name="plus" size={14} /> New Client
          </button>
        </div>

        {/* Filters */}
        <div className="j-row j-wrap" style={{ gap: 8 }}>
          <select className="opx-input opx-afilter" aria-label="Filter by status" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Status: all</option>
            {STATUSES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <input
            className="j-search"
            style={{ minWidth: 220 }}
            aria-label="Search clients" placeholder="Search clients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Client editor */}
        {showForm && (
          <div className="j-card">
            <div className="j-card-head">
              <p className="j-card-title">{editing ? "Edit client" : "New client"}</p>
              <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => setShowForm(false)} aria-label="Close">
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="j-col" style={{ gap: 10 }}>
              <div className="j-row" style={{ gap: 8 }}>
                <input className="j-search" style={{ flex: 1 }} aria-label="Contact name" placeholder="Contact name *" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <input className="j-search" style={{ flex: 1 }} aria-label="Company" placeholder="Company" value={form.company}
                  onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
              </div>
              <div className="j-row" style={{ gap: 8 }}>
                <input className="j-search" style={{ flex: 1 }} aria-label="Email" placeholder="Email" value={form.contactEmail}
                  onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
                <input className="j-search" style={{ flex: 1 }} aria-label="Phone" placeholder="Phone" value={form.contactPhone}
                  onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
                <select className="j-search" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as Client["status"] }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <input className="j-search" aria-label="Billing reference (Finance income stream name)" placeholder="Billing reference (Finance income stream name)"
                value={form.billingReference}
                onChange={e => setForm(f => ({ ...f, billingReference: e.target.value }))} />
              <textarea
                aria-label="Notes" placeholder="Notes…" value={form.notes} rows={3}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                style={{
                  width: "100%", background: "var(--opx-soft)", color: "var(--opx-ink)",
                  border: "none", boxShadow: "0 0 0 1px var(--j-ring)", borderRadius: 8,
                  padding: 12, fontSize: 13, resize: "vertical",
                }}
              />
              {err && <div className="j-pill j-neg" style={{ alignSelf: "flex-start" }}>{err}</div>}
              <div className="j-row" style={{ gap: 8 }}>
                <button className="j-btn j-btn-primary" onClick={saveClient} disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create client"}
                </button>
                <button className="j-btn j-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading && clients.length === 0 ? (
          <div className="j-card"><span className="j-muted">Loading clients…</span></div>
        ) : err && !showForm ? (
          <div className="j-card"><span className="j-muted">{err}</span></div>
        ) : clients.length === 0 ? (
          <div className="j-card j-col" style={{ alignItems: "center", gap: 10, padding: 48 }}>
            <Icon name="users" size={28} />
            <p className="j-muted">{filter || search.trim() ? "No clients match these filters." : "No clients yet. Add a client to track ongoing work and retainers."}</p>
            <button className="j-btn j-btn-primary" onClick={openCreate}><Icon name="plus" size={14} /> New Client</button>
          </div>
        ) : (
          <div className="j-col" style={{ gap: 10 }}>
            {clients.map(c => (
              <div key={c.id} className="j-card">
                <div className="j-card-head">
                  <div style={{ minWidth: 0, cursor: "pointer" }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(c.id) } }} onClick={() => openDetail(c.id)}>
                    <div className="j-row" style={{ gap: 8 }}>
                      <p className="j-card-title">{c.name}</p>
                      {c.company && <span className="j-pill j-proj">{c.company}</span>}
                      <span className={`j-pill ${STATUS_PILL[c.status]}`}>{c.status}</span>
                    </div>
                    <p className="j-card-sub">
                      {c.projectCount} project{c.projectCount === 1 ? "" : "s"} ·{" "}
                      {c.activeScheduleCount} active service{c.activeScheduleCount === 1 ? "" : "s"}
                      {c.nextServiceDate && (
                        <> · next <span className={`j-pill ${dueClass(c.nextServiceDate)}`}>{c.nextServiceDate}</span></>
                      )}
                    </p>
                  </div>
                  <div className="j-row" style={{ gap: 6 }}>
                    <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => openDetail(c.id)} aria-label={`${expanded === c.id ? "Close" : "Open"} ${c.name}`} aria-expanded={expanded === c.id}>
                      <Icon name={expanded === c.id ? "chevR" : "list"} size={14} />
                    </button>
                    <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}>
                      <Icon name="cog" size={14} />
                    </button>
                    <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => removeClient(c)} aria-label={`Delete ${c.name}`}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                </div>

                {expanded === c.id && (
                  <div className="j-col" style={{ gap: 12, marginTop: 12, borderTop: "1px solid var(--j-ring)", paddingTop: 12 }}>
                    {detailLoading || !detail ? (
                      <span className="j-muted">Loading client workspace…</span>
                    ) : (
                      <>
                        {/* Linked projects */}
                        <div className="j-col" style={{ gap: 6 }}>
                          <p className="j-card-sub" style={{ fontWeight: 600 }}>Projects</p>
                          {detail.projects.length === 0 ? (
                            <span className="j-muted" style={{ fontSize: 12.5 }}>
                              No projects linked. Set a project&apos;s client from the project view.
                            </span>
                          ) : (
                            <div className="j-row j-wrap" style={{ gap: 6 }}>
                              {detail.projects.map(p => (
                                <a key={p.id} href={`/project/${p.id}`} className="j-pill j-proj">
                                  {p.name} · {p.status}{p.phase ? ` · ${p.phase}` : ""}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Service schedules */}
                        <div className="j-col" style={{ gap: 6 }}>
                          <div className="j-row j-between">
                            <p className="j-card-sub" style={{ fontWeight: 600 }}>Recurring services</p>
                            <button className="j-btn j-btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }}
                              onClick={() => { setShowSched(s => !s); setSchedForm(emptySchedule()) }}>
                              <Icon name="plus" size={12} /> Add service
                            </button>
                          </div>

                          {showSched && (
                            <div className="j-card" style={{ background: "var(--opx-soft)" }}>
                              <div className="j-col" style={{ gap: 8 }}>
                                <input className="j-search" aria-label="Service title" placeholder="Service title * (e.g. Monthly site upkeep)"
                                  value={schedForm.title}
                                  onChange={e => setSchedForm(f => ({ ...f, title: e.target.value }))} />
                                <div className="j-row" style={{ gap: 8 }}>
                                  <select className="j-search" value={schedForm.frequency}
                                    onChange={e => setSchedForm(f => ({ ...f, frequency: e.target.value }))}>
                                    {FREQUENCIES.map(fr => <option key={fr} value={fr}>{fr}</option>)}
                                  </select>
                                  <input className="j-search" type="date" value={schedForm.nextOccurrence}
                                    onChange={e => setSchedForm(f => ({ ...f, nextOccurrence: e.target.value }))} />
                                  <input className="j-search" style={{ width: 110 }} aria-label="Fee" placeholder="Fee"
                                    value={schedForm.amount}
                                    onChange={e => setSchedForm(f => ({ ...f, amount: e.target.value }))} />
                                </div>
                                <div className="j-row" style={{ gap: 8 }}>
                                  <select className="j-search" style={{ flex: 1 }} value={schedForm.projectId}
                                    onChange={e => setSchedForm(f => ({ ...f, projectId: e.target.value }))}>
                                    <option value="">— Project (optional) —</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </select>
                                  <select className="j-search" style={{ flex: 1 }} value={schedForm.sopId}
                                    onChange={e => setSchedForm(f => ({ ...f, sopId: e.target.value }))}>
                                    <option value="">— Runbook / SOP (optional) —</option>
                                    {sops.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                                  </select>
                                </div>
                                <div className="j-row" style={{ gap: 8 }}>
                                  <button className="j-btn j-btn-primary" onClick={addSchedule}>Add service</button>
                                  <button className="j-btn j-btn-ghost" onClick={() => setShowSched(false)}>Cancel</button>
                                </div>
                              </div>
                            </div>
                          )}

                          {detail.schedules.length === 0 ? (
                            <span className="j-muted" style={{ fontSize: 12.5 }}>No recurring services yet.</span>
                          ) : (
                            <div className="j-col" style={{ gap: 6 }}>
                              {detail.schedules.map(s => (
                                <div key={s.id} className="j-row j-between j-wrap"
                                  style={{ gap: 8, padding: "8px 10px", boxShadow: "0 0 0 1px var(--j-ring)", borderRadius: 8 }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div className="j-row" style={{ gap: 6 }}>
                                      <b style={{ fontSize: 13 }}>{s.title}</b>
                                      <span className="j-pill j-ghost">{s.frequency}</span>
                                      {!s.isActive && <span className="j-pill j-muted">ended</span>}
                                      {s.sopTitle && <span className="j-pill j-proj">SOP: {s.sopTitle}</span>}
                                    </div>
                                    <span className="j-card-sub">
                                      next <span className={`j-pill ${dueClass(s.nextOccurrence)}`}>{s.nextOccurrence}</span>
                                      {s.amount != null && <> · {s.currency} {s.amount.toLocaleString()}</>}
                                      {s.lastPerformedAt && <> · last {new Date(s.lastPerformedAt).toLocaleDateString()}</>}
                                    </span>
                                  </div>
                                  <div className="j-row" style={{ gap: 6 }}>
                                    <button className="j-btn j-btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }}
                                      onClick={() => performSchedule(s)} disabled={!s.isActive}>
                                      <Icon name="check" size={12} /> Mark done
                                    </button>
                                    <button className="j-btn j-btn-icon j-btn-ghost"
                                      onClick={() => removeSchedule(s)} aria-label="Delete service">
                                      <Icon name="x" size={12} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
