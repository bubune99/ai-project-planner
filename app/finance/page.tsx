"use client"

/*
 * Finance — the money on every project, in one place (owner 2026-11-13).
 * It totals what was entered on each project's Money tab: budget, monthly
 * running cost, money put in and money brought in. Rules and totals are in
 * lib/project-views/money.ts; nothing here is estimated, and a number nobody
 * entered shows as "—".
 */

import Link from "next/link"
import { DashboardLayout } from "@/components/navigation"
import { Failed, Loading, Section, unwrap, useJson } from "@/components/project/opx/shared"
import { formatMoney, moneyRollup, type MoneyRollup, type ProjectMoney } from "@/lib/project-views/money"

interface ProjectRow { id: string; name: string; status?: string | null; money?: ProjectMoney | null }

function Rollup({ r, many }: { r: MoneyRollup; many: boolean }) {
  const f = (n: number | null | undefined) => formatMoney(n, r.currency)
  const used = r.budgetUsed != null ? Math.round(r.budgetUsed * 100) : null
  return (
    <>
      {many && <h2 className="opx-muted" style={{ fontSize: 13, fontWeight: 600, margin: "6px 4px -4px" }}>In {r.currency}</h2>}
      <div className="opx-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", display: "grid" }}>
        <div className="opx-stat"><b>{f(r.monthly)}</b><span>Costs to run, per month</span></div>
        <div className={`opx-stat${used != null && used >= 100 ? " hot" : ""}`}><b>{f(r.monthlyBudget)}</b><span>Monthly budgets{used != null ? ` · ${used}% used` : ""}</span></div>
        <div className="opx-stat"><b>{f(r.putIn)}</b><span>Put in so far</span></div>
        <div className="opx-stat"><b>{f(r.broughtIn)}</b><span>Brought in so far</span></div>
        <div className={`opx-stat${r.net != null && r.net < 0 ? " hot" : ""}`}><b>{f(r.net)}</b><span>Brought in minus put in</span></div>
      </div>
      <div className="opx-2col">
        <Section title="By project" count={r.rows.length}>
          <div className="opx-mt opx-mth"><span>Project</span><span>Budget</span><span>Per month</span><span>Put in</span><span>Brought in</span></div>
          {r.rows.map((p) => (
            <Link key={p.id} href={`/project/${p.id}?tab=finance`} className="opx-mt">
              <b>{p.name}</b>
              <span>{p.budget != null ? `${f(p.budget)}${p.budgetPeriod === "total" ? " total" : " / mo"}` : "—"}</span>
              <span style={p.warn ? { color: "var(--opx-hot)", fontWeight: 600 } : undefined}>{f(p.monthly)}{p.budgetUsed != null ? ` · ${Math.round(p.budgetUsed * 100)}%` : ""}</span>
              <span>{f(p.putIn)}</span>
              <span>{f(p.broughtIn)}</span>
            </Link>
          ))}
        </Section>
        <Section title="What you pay each month, by service" count={r.services.length || undefined}>
          {r.services.length === 0 && <p className="opx-muted" style={{ margin: 0 }}>No running costs with an amount yet. Add them on a project's Money tab.</p>}
          {r.services.map((s) => (
            <div key={s.service} className="opx-agr" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) auto" }}>
              <span>{s.service}<small className="opx-muted" style={{ marginLeft: 6 }}>{s.projects} project{s.projects === 1 ? "" : "s"}</small></span>
              <span className="opx-pg" style={{ height: 9 }}><i style={{ width: `${r.monthly ? (s.monthly / r.monthly) * 100 : 0}%`, background: "var(--opx-accent)" }} /></span>
              <b>{f(s.monthly)}</b>
            </div>
          ))}
        </Section>
      </div>
    </>
  )
}

export default function FinancePage() {
  const { data, loading, error, reload } = useJson("/api/projects")
  const projects = unwrap<ProjectRow[]>(data) || []
  const rollups = moneyRollup(projects)
  const without = projects.filter((p) => !rollups.some((r) => r.rows.some((x) => x.id === p.id)))

  return (
    <DashboardLayout>
      <div className="opx-page">
        {loading && !data && <Loading what="your projects' money" />}
        {error && <Failed what="your projects' money" error={error} retry={reload} />}
        {!loading && !error && rollups.length === 0 && (
          <div className="opx-empty" style={{ textAlign: "left" }}>
            <b style={{ color: "var(--opx-ink)" }}>No money recorded on any project yet.</b> Open a project, go to its Money tab, and add a budget, what it costs to run, or what you've put in. This page totals those across projects.
          </div>
        )}
        {rollups.map((r) => <Rollup key={r.currency} r={r} many={rollups.length > 1} />)}
        {!error && data != null && without.length > 0 && (
          <Section title="Projects with no money entered" count={without.length}>
            {/* A scrolling list, not a wall of chips (owner 2026-11-13). */}
            <div className="opx-plain-list">
              {without.map((p) => (
                <Link key={p.id} href={`/project/${p.id}?tab=finance`}><span>{p.name}</span><small>Add money ›</small></Link>
              ))}
            </div>
          </Section>
        )}
      </div>
    </DashboardLayout>
  )
}
