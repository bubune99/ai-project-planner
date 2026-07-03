"use client"

/**
 * WorkOrdersFacet — the owner-facing view of agent work.
 *
 * Work orders → steps → check-in timeline. The timeline is the "what did the
 * agent actually do" story: every claim / progress / blocker / completion event
 * in order. Also surfaces attempted_solutions (prior art) recorded against the
 * work order or its steps.
 *
 * Data:
 *   GET /api/work-orders?projectId=X            → list (with step counts)
 *   GET /api/work-orders/[id]                   → steps
 *   GET /api/work-orders/[id]/timeline          → check-ins + attempts
 */

import { useCallback, useEffect, useState } from "react"

// ─── Tone maps (match the j-* pill vocabulary used across the app) ────────────

const WO_TONE: Record<string, string> = {
  proposed: "j-muted", approved: "j-info", in_progress: "j-proj",
  paused: "j-warn", completed: "j-pos", cancelled: "j-muted", failed: "j-neg",
}
const STEP_TONE: Record<string, string> = {
  pending: "j-muted", ready: "j-info", claimed: "j-info", in_progress: "j-proj",
  completed: "j-pos", failed: "j-neg", skipped: "j-muted", blocked: "j-warn",
}
const EVENT_TONE: Record<string, string> = {
  claim: "j-info", progress: "j-proj", blocker: "j-warn",
  protocol_violation: "j-neg", retry: "j-warn", completion: "j-pos",
  failure: "j-neg", release: "j-muted",
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkOrder {
  id: string
  title: string
  description?: string | null
  status: string
  createdAt?: string | null
  completedAt?: string | null
  createdById?: string | null
  totalSteps?: number
  completedSteps?: number
}
interface Step {
  id: string
  stepOrder: number
  level: number
  title: string
  description?: string | null
  status: string
  stepType?: string
  claimedById?: string | null
  claimedByType?: string | null
  outcomeSummary?: string | null
  blockedReason?: string | null
  checkInCount?: number
}
interface CheckIn {
  id: string
  stepId: string
  eventType: string
  message?: string | null
  byType?: string | null
  byId?: string | null
  createdAt?: string | null
}
interface Attempt {
  id: string
  entityType: string
  entityId: string
  approach: string
  outcome: string
  failureMode?: string | null
  rootCause?: string | null
  lessonsLearned: string
  attemptedById?: string | null
  triedAt?: string | null
}
interface Detail {
  steps: Step[]
  checkIns: CheckIn[]
  attempts: Attempt[]
  loading: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString()
}
function fmtTime(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

async function getData(url: string): Promise<any> {
  const r = await fetch(url, { credentials: "include" })
  const j = await r.json().catch(() => null)
  return j?.data ?? null
}

// ─── Check-in timeline for one step ───────────────────────────────────────────

function StepTimeline({ checkIns, attempts }: { checkIns: CheckIn[]; attempts: Attempt[] }) {
  if (checkIns.length === 0 && attempts.length === 0) {
    return (
      <div className="j-muted" style={{ fontSize: 12, padding: "8px 0 8px 22px" }}>
        No check-ins recorded for this step yet.
      </div>
    )
  }
  return (
    <div style={{ padding: "4px 0 6px 8px" }}>
      {checkIns.map((ci) => (
        <div
          key={ci.id}
          data-testid="checkin-event"
          className="j-row"
          style={{ gap: 10, padding: "6px 0", alignItems: "flex-start" }}
        >
          <span
            style={{
              width: 7, height: 7, borderRadius: "50%", marginTop: 5, flexShrink: 0,
              background: "var(--j-accent)",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="j-row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`j-pill ${EVENT_TONE[ci.eventType] || "j-ghost"}`} style={{ fontSize: 10 }}>
                {ci.eventType.replace("_", " ")}
              </span>
              {ci.byId && <span className="j-muted" style={{ fontSize: 11 }}>{ci.byId}</span>}
              <span className="j-muted" style={{ fontSize: 11 }}>{fmtTime(ci.createdAt)}</span>
            </div>
            {ci.message && (
              <div data-testid="checkin-message" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
                {ci.message}
              </div>
            )}
          </div>
        </div>
      ))}
      {attempts.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {attempts.map((a) => (
            <div key={a.id} className="j-card j-tight" style={{ padding: 10, marginTop: 6, borderLeft: "2px solid var(--j-warn, #d97706)" }}>
              <div className="j-row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="j-pill j-warn" style={{ fontSize: 10 }}>attempt · {a.outcome}</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{a.approach}</span>
              </div>
              {a.failureMode && <div className="j-muted" style={{ fontSize: 11, marginTop: 3 }}>Failure: {a.failureMode}</div>}
              <div className="j-muted" style={{ fontSize: 11, marginTop: 3 }}>Lesson: {a.lessonsLearned}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── One step row (expandable to its timeline) ────────────────────────────────

function StepRow({ step, checkIns, attempts }: { step: Step; checkIns: CheckIn[]; attempts: Attempt[] }) {
  const [open, setOpen] = useState(false)
  const stepCheckIns = checkIns.filter((c) => c.stepId === step.id)
  const stepAttempts = attempts.filter((a) => a.entityType === "work_order_step" && a.entityId === step.id)
  const hasTimeline = stepCheckIns.length > 0 || stepAttempts.length > 0

  return (
    <div data-testid="step-row" style={{ borderTop: "1px solid var(--j-hairline)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="j-row j-between"
        style={{
          width: "100%", background: "transparent", border: "none", cursor: "pointer",
          padding: "10px 14px", textAlign: "left", color: "inherit", gap: 10,
        }}
      >
        <div className="j-row" style={{ gap: 10, minWidth: 0, alignItems: "center" }}>
          <span className="j-muted" style={{ fontSize: 11, width: 22, flexShrink: 0 }}>
            {hasTimeline ? (open ? "▾" : "▸") : "·"}
          </span>
          <span className={`j-pill ${STEP_TONE[step.status] || "j-muted"}`} style={{ fontSize: 10, flexShrink: 0 }}>
            {step.status.replace("_", " ")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {step.title}
          </span>
        </div>
        <div className="j-row j-muted" style={{ gap: 10, fontSize: 11, flexShrink: 0 }}>
          <span>L{step.level} · #{step.stepOrder + 1}</span>
          {step.claimedById && <span>{step.claimedById}</span>}
          {typeof step.checkInCount === "number" && step.checkInCount > 0 && <span>{step.checkInCount} check-ins</span>}
        </div>
      </button>
      {(step.blockedReason || step.outcomeSummary) && (
        <div style={{ padding: "0 14px 8px 46px" }}>
          {step.blockedReason && (
            <div className="j-muted" style={{ fontSize: 11.5, color: "var(--j-warn, #d97706)" }}>Blocked: {step.blockedReason}</div>
          )}
          {step.outcomeSummary && (
            <div className="j-muted" style={{ fontSize: 11.5 }}>Outcome: {step.outcomeSummary}</div>
          )}
        </div>
      )}
      {open && (
        <div style={{ padding: "0 14px 8px 40px" }}>
          <StepTimeline checkIns={stepCheckIns} attempts={stepAttempts} />
        </div>
      )}
    </div>
  )
}

// ─── One work-order card (expandable to steps) ────────────────────────────────

function WorkOrderCard({ wo }: { wo: WorkOrder }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)

  const load = useCallback(async () => {
    setDetail({ steps: [], checkIns: [], attempts: [], loading: true })
    const [woDetail, timeline] = await Promise.all([
      getData(`/api/work-orders/${wo.id}`),
      getData(`/api/work-orders/${wo.id}/timeline`),
    ])
    setDetail({
      steps: Array.isArray(woDetail?.steps) ? woDetail.steps : [],
      checkIns: Array.isArray(timeline?.checkIns) ? timeline.checkIns : [],
      attempts: Array.isArray(timeline?.attempts) ? timeline.attempts : [],
      loading: false,
    })
  }, [wo.id])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !detail) load()
  }

  const total = wo.totalSteps ?? 0
  const done = wo.completedSteps ?? 0
  const woAttempts = (detail?.attempts ?? []).filter((a) => a.entityType === "work_order" && a.entityId === wo.id)

  return (
    <div className="j-card" data-testid="work-order-card" data-wo-title={wo.title} style={{ padding: 0 }}>
      <button
        onClick={toggle}
        className="j-row j-between"
        style={{
          width: "100%", background: "transparent", border: "none", cursor: "pointer",
          padding: 16, textAlign: "left", color: "inherit", gap: 12,
        }}
      >
        <div className="j-row" style={{ gap: 12, minWidth: 0, alignItems: "center" }}>
          <span className="j-muted" style={{ fontSize: 12 }}>{open ? "▾" : "▸"}</span>
          <div style={{ minWidth: 0 }}>
            <div className="j-row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`j-pill ${WO_TONE[wo.status] || "j-muted"}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {wo.status === "in_progress" && <span className="j-dot-pulse" style={{ width: 6, height: 6 }} />}
                {wo.status.replace("_", " ")}
              </span>
              <h4 className="j-card-title" style={{ margin: 0, fontSize: 14 }}>{wo.title}</h4>
            </div>
            {wo.description && (
              <p className="j-muted" style={{ fontSize: 12, margin: "4px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 560 }}>
                {wo.description}
              </p>
            )}
          </div>
        </div>
        <div className="j-row" style={{ gap: 16, flexShrink: 0, alignItems: "center" }}>
          {total > 0 && (
            <span className="j-pill j-ghost" style={{ fontSize: 11 }}>{done}/{total} steps</span>
          )}
          <div className="j-col j-muted" style={{ fontSize: 11, alignItems: "flex-end", gap: 1 }}>
            <span>created {fmtDate(wo.createdAt)}</span>
            {wo.completedAt && <span>done {fmtDate(wo.completedAt)}</span>}
          </div>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--j-hairline)" }}>
          {detail?.loading ? (
            <div style={{ padding: 20, textAlign: "center" }}>
              <span className="j-muted" style={{ fontSize: 12 }}>Loading steps…</span>
            </div>
          ) : (detail?.steps.length ?? 0) === 0 ? (
            <div style={{ padding: 20, textAlign: "center" }}>
              <span className="j-muted" style={{ fontSize: 12 }}>No steps in this work order.</span>
            </div>
          ) : (
            <>
              {detail!.steps.map((s) => (
                <StepRow key={s.id} step={s} checkIns={detail!.checkIns} attempts={detail!.attempts} />
              ))}
              {woAttempts.length > 0 && (
                <div style={{ padding: "10px 14px 14px 40px", borderTop: "1px solid var(--j-hairline)" }}>
                  <div className="j-eyebrow" style={{ marginBottom: 6 }}>Prior art (work-order level)</div>
                  {woAttempts.map((a) => (
                    <div key={a.id} className="j-muted" style={{ fontSize: 12, marginTop: 4 }}>
                      <span className="j-pill j-warn" style={{ fontSize: 10, marginRight: 6 }}>{a.outcome}</span>
                      {a.approach} — {a.lessonsLearned}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Facet ────────────────────────────────────────────────────────────────────

export function WorkOrdersFacet({ projectId }: { projectId: string }) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWorkOrders = useCallback(() => {
    setLoading(true)
    fetch(`/api/work-orders?projectId=${projectId}&limit=100`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => { setWorkOrders(Array.isArray(j?.data) ? j.data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectId])

  useEffect(() => { fetchWorkOrders() }, [fetchWorkOrders])

  const active = workOrders.filter((w) => w.status === "in_progress" || w.status === "approved").length
  const completed = workOrders.filter((w) => w.status === "completed").length

  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {[
          ["Work orders", workOrders.length, "j-info"],
          ["Active", active, "j-proj"],
          ["Completed", completed, "j-pos"],
          ["Failed", workOrders.filter((w) => w.status === "failed").length, "j-neg"],
        ].map(([l, v]) => (
          <div key={l as string} className="j-card j-tight" style={{ padding: 14 }}>
            <div className="j-eyebrow">{l}</div>
            <div className="j-amount-lg" style={{ marginTop: 6 }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="j-row j-between">
        <h3 className="j-card-title">Work orders</h3>
        <button className="j-btn j-btn-ghost" onClick={fetchWorkOrders}>↺ Refresh</button>
      </div>

      {loading ? (
        <div className="j-card" style={{ padding: 32, textAlign: "center" }}>
          <span className="j-muted" style={{ fontSize: 13 }}>Loading work orders…</span>
        </div>
      ) : workOrders.length === 0 ? (
        <div className="j-card" style={{ padding: 40, textAlign: "center" }}>
          <p className="j-muted" style={{ fontSize: 13, margin: 0 }}>
            No work orders yet. Agents compose work orders here as they take on tasks.
          </p>
        </div>
      ) : (
        <div className="j-col j-gap-3">
          {workOrders.map((wo) => <WorkOrderCard key={wo.id} wo={wo} />)}
        </div>
      )}
    </div>
  )
}
