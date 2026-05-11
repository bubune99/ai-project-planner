"use client"

import { useState } from "react"
import Link from "next/link"
import { Icon } from "./icons"
import { BUSINESSES, PROJECTS, TODAY_TODOS, ACTIVITY, AGENTS } from "./data"

function SparkRail({ data }: { data: number[] }) {
  const max = Math.max(...data)
  return (
    <div className="j-spark-rail">
      {data.map((v, i) => (
        <span
          key={i}
          className={v === max ? "j-hi" : ""}
          style={{ height: `${Math.round((v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function VitalSigns() {
  const active       = PROJECTS.filter(p => p.status === "active")
  const totalARR     = BUSINESSES.reduce((s, b) => s + b.arr, 0)
  const mrr          = Math.round(totalARR / 12)
  const openIdeas    = ACTIVITY.filter(a => a.type === "idea").length + 4
  const momentum     = active.length ? Math.round(active.reduce((s, p) => s + p.progress, 0) / active.length) : 0

  const tiles = [
    { l: "Active projects",  v: active.length,                   s: `${PROJECTS.length} total`,             spark: active.map(p => p.progress) },
    { l: "Open ideas",       v: openIdeas,                       s: "in incubator",                         spark: [4,6,5,8,7,9,8,7,9,10,8,9,10,10] },
    { l: "Momentum index",   v: `${momentum}/100`,               s: "avg project progress",                 spark: [40,45,42,50,55,58,60,62,65,68,70,72,74,momentum] },
    { l: "MRR",              v: `$${(mrr/1000).toFixed(1)}K`,    s: `$${(totalARR/1000).toFixed(1)}K ARR`, spark: BUSINESSES.map(b => b.arr / 1000) },
  ]

  return (
    <div className="j-grid j-cols-4">
      {tiles.map(t => (
        <div key={t.l} className="j-card j-tight">
          <div className="j-eyebrow">{t.l}</div>
          <div className="j-row j-between" style={{ marginTop: 8, alignItems: "flex-end" }}>
            <div className="j-amount-lg j-num">{t.v}</div>
            <SparkRail data={t.spark} />
          </div>
          <div className="j-muted" style={{ fontSize: 12, marginTop: 4 }}>{t.s}</div>
        </div>
      ))}
    </div>
  )
}

function FocusMode() {
  const urgent = TODAY_TODOS.filter(t => !t.done && t.priority === "high")
  const done = TODAY_TODOS.filter(t => t.done).length
  const pct = Math.round((done / TODAY_TODOS.length) * 100)

  return (
    <div className="j-focus-mode">
      <div className="j-row j-between" style={{ marginBottom: 20 }}>
        <div>
          <div className="j-eyebrow">Today&apos;s Focus</div>
          <h2 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em" }}>
            {done}/{TODAY_TODOS.length} tasks complete
          </h2>
        </div>
        <div className="j-col" style={{ alignItems: "flex-end", gap: 4 }}>
          <span className="j-pill j-pos"><span className="j-pill-dot" />{pct}%</span>
          <span className="j-muted" style={{ fontSize: 12 }}>daily progress</span>
        </div>
      </div>
      <div className="j-progress j-thick" style={{ marginBottom: 20 }}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="j-col j-gap-2">
        {urgent.map(t => (
          <div key={t.id} className="j-row" style={{ gap: 10, padding: "8px 12px", background: "oklch(1 0 0 / 0.04)", borderRadius: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--j-neg)", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13 }}>{t.title}</span>
            {t.project && <span className="j-pill j-proj">{t.project}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function GanttStrip() {
  const active = PROJECTS.filter(p => p.status === "active").slice(0, 5)
  const today = new Date()
  const start = new Date("2026-05-01")
  const end = new Date("2026-09-30")
  const totalDays = (end.getTime() - start.getTime()) / 86400000
  const todayOffset = Math.min(Math.max(((today.getTime() - start.getTime()) / 86400000) / totalDays, 0), 1)

  return (
    <div className="j-card">
      <div className="j-card-head">
        <div>
          <p className="j-card-title">Portfolio Timeline</p>
          <p className="j-card-sub">60-day Gantt view</p>
        </div>
      </div>
      {active.map(p => {
        const due = new Date(p.dueDate)
        const projStart = new Date(p.dueDate)
        projStart.setDate(projStart.getDate() - 60)
        const left = Math.max(((projStart.getTime() - start.getTime()) / 86400000) / totalDays, 0) * 100
        const width = Math.min(((due.getTime() - Math.max(projStart.getTime(), start.getTime())) / 86400000) / totalDays * 100, 100 - left)
        const isLate = due < today && p.status === "active"

        return (
          <div key={p.id} className="j-gantt-row">
            <div className="j-gantt-name">
              <span className="j-pill j-muted" style={{ flexShrink: 0 }}>{p.phase}</span>
              <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            </div>
            <div className="j-gantt-track">
              <div
                className={`j-gantt-bar${isLate ? " j-late" : ""}`}
                style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }}
              >
                {p.name}
              </div>
              <div className="j-gantt-today" style={{ left: `${todayOffset * 100}%` }} />
            </div>
            <span className="j-muted" style={{ fontSize: 11, textAlign: "right" }}>{p.progress}%</span>
          </div>
        )
      })}
    </div>
  )
}

function ConstellationGraph() {
  const nodeColors: Record<string, string> = {
    biz: "var(--j-biz)",
    proj: "var(--j-accent)",
    idea: "var(--j-idea)",
    finance: "var(--j-pos)",
  }

  const nodes = [
    { id: "b1", label: "StackDive", type: "biz", x: 18, y: 28 },
    { id: "b2", label: "OpEx", type: "biz", x: 18, y: 55 },
    { id: "b3", label: "Sassy Dame", type: "biz", x: 18, y: 80 },
    { id: "p1", label: "AI Builder", type: "proj", x: 44, y: 18 },
    { id: "p2", label: "Mobile v2", type: "proj", x: 44, y: 38 },
    { id: "p3", label: "Instructor", type: "proj", x: 44, y: 54 },
    { id: "p4", label: "Analyzer", type: "proj", x: 44, y: 66 },
    { id: "p6", label: "Theme v3", type: "proj", x: 44, y: 80 },
    { id: "i1", label: "Bulk Export", type: "idea", x: 72, y: 25 },
    { id: "i2", label: "RTL", type: "idea", x: 72, y: 50 },
    { id: "i3", label: "Quiz Gen", type: "idea", x: 72, y: 72 },
    { id: "f1", label: "$42K ARR", type: "finance", x: 88, y: 35 },
    { id: "f2", label: "$18.5K", type: "finance", x: 88, y: 62 },
  ]

  const edges = [
    ["b1","p1"],["b1","p2"],["b1","p3"],
    ["b2","p4"], ["b3","p6"],
    ["p1","i1"],["p1","i3"],["p6","i2"],
    ["b1","f1"],["b2","f2"],
  ]

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))

  return (
    <div className="j-card">
      <div className="j-card-head">
        <div>
          <p className="j-card-title">Constellation</p>
          <p className="j-card-sub">Businesses → Projects → Ideas</p>
        </div>
      </div>
      <div className="j-graph-canvas">
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {edges.map(([from, to], i) => {
            const a = nodeMap[from]
            const b = nodeMap[to]
            if (!a || !b) return null
            return (
              <line
                key={i}
                x1={`${a.x}%`} y1={`${a.y}%`}
                x2={`${b.x}%`} y2={`${b.y}%`}
                stroke="oklch(1 0 0 / 0.07)" strokeWidth="1"
              />
            )
          })}
        </svg>
        {nodes.map(n => (
          <div
            key={n.id}
            className="j-graph-node"
            style={{ left: `${n.x}%`, top: `${n.y}%`, color: nodeColors[n.type] || "white" }}
          >
            <div className={`j-graph-dot${n.type === "biz" ? " j-big" : ""}`} />
            <div className="j-graph-label">{n.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectMomentum() {
  const active = PROJECTS.filter(p => p.status === "active").slice(0, 4)
  return (
    <div className="j-card">
      <div className="j-card-head">
        <p className="j-card-title">Momentum</p>
        <Link href="/projects" style={{ fontSize: 12, color: "var(--j-accent)", textDecoration: "none" }}>
          View all <Icon name="arrow" size={12} />
        </Link>
      </div>
      <div className="j-col j-gap-3">
        {active.map(p => (
          <div key={p.id} className="j-row j-between">
            <div className="j-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <div className="j-progress" style={{ marginTop: 2 }}>
                <span style={{ width: `${p.progress}%` }} />
              </div>
            </div>
            <div style={{ marginLeft: 12, flexShrink: 0 }}>
              <SparkRail data={p.momentum} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarMini() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)

  const monthName = today.toLocaleString("default", { month: "long" })

  return (
    <div className="j-card j-tight">
      <div className="j-card-head" style={{ marginBottom: 10 }}>
        <p className="j-card-title">{monthName} {year}</p>
        <Link href="/calendar" style={{ fontSize: 12, color: "var(--j-accent)", textDecoration: "none" }}>
          <Icon name="cal" size={14} />
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} className="j-eyebrow" style={{ textAlign: "center", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div className="j-cal-grid">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`j-cal-day${!day ? " j-outside" : ""}${day === today.getDate() ? " j-today" : ""}`}
          >
            {day || ""}
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityRail() {
  const iconMap: Record<string, "bolt" | "play" | "check" | "bulb" | "book"> = {
    commit: "bolt", deploy: "play", task: "check", idea: "bulb", note: "book",
  }
  const colorMap: Record<string, string> = {
    commit: "var(--j-accent)", deploy: "var(--j-pos)", task: "var(--j-pos)", idea: "var(--j-idea)", note: "var(--j-muted)",
  }

  return (
    <div className="j-card">
      <div className="j-card-head">
        <p className="j-card-title">Recent Activity</p>
      </div>
      <div className="j-col j-gap-2">
        {ACTIVITY.map(a => (
          <div key={a.id} className="j-row" style={{ gap: 10, alignItems: "flex-start" }}>
            <div style={{ color: colorMap[a.type] || "white", flexShrink: 0, marginTop: 1 }}>
              <Icon name={iconMap[a.type] || "bolt"} size={14} />
            </div>
            <div className="j-col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13 }}>{a.message}</span>
              <span className="j-muted" style={{ fontSize: 11 }}>{a.project} · {a.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentRail() {
  const statusColor: Record<string, string> = {
    running: "var(--j-pos)", completed: "var(--j-info)", failed: "var(--j-neg)", queued: "var(--j-warn)",
  }
  return (
    <div className="j-card j-tight">
      <div className="j-card-head">
        <p className="j-card-title">Agents</p>
        <Link href="/agents" style={{ fontSize: 12, color: "var(--j-accent)", textDecoration: "none" }}>All</Link>
      </div>
      <div className="j-col j-gap-2">
        {AGENTS.map(a => (
          <div key={a.id} className="j-row j-between">
            <div className="j-row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
              {a.status === "running" && <div className="j-dot-pulse" />}
              {a.status !== "running" && (
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor[a.status] }} />
              )}
              <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
            </div>
            <span className="j-pill j-muted">{a.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuickCapture() {
  return (
    <div className="j-card" style={{ padding: 16 }}>
      <textarea
        placeholder="/idea · /todo · /note · /decision — capture instantly"
        style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 13, lineHeight: 1.5, height: 44, color: "oklch(0.860 0 0)", fontFamily: "inherit" }}
      />
      <div className="j-row j-between" style={{ marginTop: 8 }}>
        <div className="j-row j-gap-2">
          {["/idea","/todo","/note","/decision"].map(c => (
            <span key={c} className="j-pill j-ghost" style={{ fontSize: 10 }}>{c}</span>
          ))}
        </div>
        <button className="j-btn j-btn-primary">Capture ↵</button>
      </div>
    </div>
  )
}

export function JarvisDashboard() {
  return (
    <div className="j-content">
      <VitalSigns />
      <FocusMode />
      <div className="j-split">
        <div className="j-col j-gap-4">
          <GanttStrip />
          <ConstellationGraph />
        </div>
        <div className="j-col j-gap-4">
          <ProjectMomentum />
          <CalendarMini />
          <AgentRail />
          <ActivityRail />
        </div>
      </div>
      <QuickCapture />
    </div>
  )
}
