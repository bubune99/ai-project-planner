"use client"

import { useState } from "react"
import Link from "next/link"
import { Icon } from "./icons"
import { PROJECTS, BUSINESSES } from "./data"
import type { Project, ProjectStatus } from "./data"

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  "on-hold": "On Hold",
  completed: "Done",
  planning: "Planning",
}

const STATUS_CLASS: Record<ProjectStatus, string> = {
  active: "j-pos",
  "on-hold": "j-warn",
  completed: "j-info",
  planning: "j-muted",
}

function ProjectCard({ p }: { p: Project }) {
  const business = BUSINESSES.find(b => b.name === p.business)
  const budgetPct = Math.round((p.spent / p.budget) * 100)

  return (
    <div className="j-card">
      <div className="j-card-head">
        <div className="j-col" style={{ gap: 4 }}>
          <div className="j-row" style={{ gap: 6 }}>
            <span className={`j-pill ${STATUS_CLASS[p.status]}`}>
              <span className="j-pill-dot" />
              {STATUS_LABEL[p.status]}
            </span>
            {business && <span className="j-pill j-biz">{business.name}</span>}
          </div>
          <h3 className="j-card-title" style={{ marginTop: 6 }}>{p.name}</h3>
        </div>
      </div>

      <div className="j-col j-gap-2">
        <div className="j-row j-between">
          <span className="j-muted" style={{ fontSize: 12 }}>Progress</span>
          <span className="j-num" style={{ fontSize: 12 }}>{p.progress}%</span>
        </div>
        <div className="j-progress"><span style={{ width: `${p.progress}%` }} /></div>
      </div>

      <div className="j-row j-between" style={{ marginTop: 14 }}>
        <div className="j-col" style={{ gap: 2 }}>
          <span className="j-eyebrow">Budget Used</span>
          <span className="j-num" style={{ fontSize: 13 }}>${p.spent.toLocaleString()} / ${p.budget.toLocaleString()}</span>
        </div>
        <div className="j-col" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="j-eyebrow">Due</span>
          <span style={{ fontSize: 13 }}>{new Date(p.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>
      </div>

      <div className="j-progress" style={{ marginTop: 8 }}>
        <span style={{ width: `${budgetPct}%`, background: budgetPct > 90 ? "var(--j-neg)" : "var(--j-info)" }} />
      </div>
    </div>
  )
}

function ProjectsTable({ projects }: { projects: Project[] }) {
  return (
    <div className="j-card j-flat">
      <table className="j-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Business</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Budget</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id}>
              <td style={{ fontWeight: 500 }}>{p.name}</td>
              <td className="j-muted" style={{ fontSize: 12 }}>{p.business}</td>
              <td>
                <span className={`j-pill ${STATUS_CLASS[p.status]}`}>
                  <span className="j-pill-dot" />
                  {STATUS_LABEL[p.status]}
                </span>
              </td>
              <td>
                <div className="j-row" style={{ gap: 8 }}>
                  <div className="j-progress" style={{ flex: 1 }}>
                    <span style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="j-num" style={{ fontSize: 11, width: 28, textAlign: "right" }}>{p.progress}%</span>
                </div>
              </td>
              <td>
                <span className={p.spent / p.budget > 0.9 ? "j-pill j-neg" : "j-pill j-muted"}>
                  ${p.spent.toLocaleString()}
                </span>
              </td>
              <td className="j-muted" style={{ fontSize: 12 }}>
                {new Date(p.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const STATUSES: (ProjectStatus | "all")[] = ["all", "active", "planning", "on-hold", "completed"]

export function JarvisProjectsView() {
  const [view, setView] = useState<"grid" | "table">("grid")
  const [filter, setFilter] = useState<ProjectStatus | "all">("all")

  const filtered = filter === "all" ? PROJECTS : PROJECTS.filter(p => p.status === filter)

  return (
    <div className="j-content">
      <div className="j-row j-between" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>Projects</h1>
          <p className="j-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{PROJECTS.length} projects across {BUSINESSES.length} ventures</p>
        </div>
        <div className="j-row" style={{ gap: 8 }}>
          <div className="j-tabs">
            <button className={`j-tab${view === "grid" ? " j-active" : ""}`} onClick={() => setView("grid")}>
              <Icon name="grid" size={13} /> Grid
            </button>
            <button className={`j-tab${view === "table" ? " j-active" : ""}`} onClick={() => setView("table")}>
              <Icon name="list" size={13} /> Table
            </button>
          </div>
          <Link href="/projects/new" className="j-btn j-btn-primary" style={{ textDecoration: "none" }}>
            <Icon name="plus" size={14} /> New Project
          </Link>
        </div>
      </div>

      <div className="j-row j-wrap" style={{ gap: 6 }}>
        {STATUSES.map(s => (
          <button
            key={s}
            className={`j-pill j-ghost${filter === s ? " j-active" : ""}`}
            onClick={() => setFilter(s)}
            style={filter === s ? { background: "oklch(0.870 0.045 252 / 0.18)", color: "oklch(0.985 0 0)", boxShadow: "none" } : {}}
          >
            {s === "all" ? "All" : STATUS_LABEL[s]}
            <span className="j-muted" style={{ fontSize: 10 }}>
              {s === "all" ? PROJECTS.length : PROJECTS.filter(p => p.status === s).length}
            </span>
          </button>
        ))}
      </div>

      {view === "grid" ? (
        <div className="j-grid j-cols-3">
          {filtered.map(p => <ProjectCard key={p.id} p={p} />)}
        </div>
      ) : (
        <ProjectsTable projects={filtered} />
      )}
    </div>
  )
}
