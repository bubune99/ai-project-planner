"use client"

/*
 * AgentWidgets — compact cards under the agent's text, built from tool results
 * (lib/agents/widgets.ts). One renderer per widget kind in WIDGETS: a new tool
 * gets a card by adding a builder there and a renderer here. Every action is a
 * visible button; nothing irreversible happens from a card (Done is a normal,
 * undoable todo update).
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { point } from "@/lib/ade/ui/attention-events"
import type { AgentSpan } from "@/lib/agents/trace"
import type { Widget } from "@/lib/agents/widgets"

const card: React.CSSProperties = {
  border: "1px solid var(--j-ring)", borderRadius: 12, background: "oklch(1 0 0 / 0.03)", overflow: "hidden",
}
const head: React.CSSProperties = {
  padding: "8px 12px", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.6 0 0)",
  borderBottom: "1px solid var(--j-hairline)",
}
const row: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", minHeight: 48,
  borderBottom: "1px solid var(--j-hairline)",
}
const btn: React.CSSProperties = {
  background: "oklch(0.870 0.045 252 / 0.15)", border: "1px solid oklch(0.870 0.045 252 / 0.3)", borderRadius: 8,
  padding: "6px 12px", minHeight: 36, fontSize: 12, color: "var(--j-accent)", cursor: "pointer", fontFamily: "inherit",
  textDecoration: "none", display: "inline-flex", alignItems: "center", touchAction: "manipulation", whiteSpace: "nowrap",
}
const sub: React.CSSProperties = { fontSize: 11.5, color: "oklch(0.6 0 0)", marginTop: 2 }

function fmtDue(d?: string | null): string | null {
  if (!d) return null
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function TodoRow({ item }: { item: Extract<Widget, { kind: "todos" }>["items"][number] }) {
  const [state, setState] = useState<"open" | "saving" | "done" | "error">("open")
  const complete = async (status: "completed" | "pending") => {
    setState("saving")
    try {
      const res = await fetch(`/api/todos/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      })
      setState(res.ok ? (status === "completed" ? "done" : "open") : "error")
    } catch {
      setState("error")
    }
  }
  const due = fmtDue(item.due)
  return (
    <div style={row} data-ui={`widget.todo.${item.id}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, textDecoration: state === "done" ? "line-through" : undefined, opacity: state === "done" ? 0.55 : 1 }}>
          {item.title}
        </div>
        <div style={sub}>
          {[item.project, due && (item.overdue ? `${due} · overdue` : due), item.priority].filter(Boolean).join(" · ")}
          {state === "error" ? <span style={{ color: "var(--j-neg)" }}> Could not save</span> : null}
        </div>
      </div>
      {state === "done" ? (
        <button type="button" style={{ ...btn, background: "none" }} onClick={() => complete("pending")}>Undo</button>
      ) : (
        <button type="button" style={btn} disabled={state === "saving"} onClick={() => complete("completed")}>
          {state === "saving" ? "…" : "Done"}
        </button>
      )}
    </div>
  )
}

const more = (n: number) => n > 0 ? <div style={{ ...sub, padding: "8px 12px" }}>+{n} more. Ask me for the rest.</div> : null

function Card({ w }: { w: Widget }) {
  switch (w.kind) {
    case "todos":
      return <div style={card} data-ui="widget.todos"><div style={head}>{w.title}</div>{w.items.map((i) => <TodoRow key={i.id} item={i} />)}{more(w.more)}</div>
    case "steps":
      return (
        <div style={card} data-ui="widget.steps"><div style={head}>{w.title}</div>
          {w.items.map((i) => (
            <div style={row} key={i.id}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14 }}>{i.title}</div><div style={sub}>{i.project}</div></div>
              <Link href={`/project/${i.projectId}`} style={btn}>Open</Link>
            </div>
          ))}{more(w.more)}
        </div>
      )
    case "catchup":
      return (
        <div style={card} data-ui="widget.catchup"><div style={head}>{w.title}</div>
          {w.items.map((i) => (
            <div style={{ ...row, alignItems: "flex-start" }} key={i.projectId}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{i.name}</div>
                <div style={sub}>{i.summary}</div>
                {i.highlights.map((h, n) => <div key={n} style={{ fontSize: 12.5, color: "oklch(0.78 0 0)", marginTop: 3 }}>• {h}</div>)}
              </div>
              <Link href={`/project/${i.projectId}`} style={btn}>Show me</Link>
            </div>
          ))}
          {w.quiet ? <div style={{ ...sub, padding: "8px 12px" }}>{w.quiet} other project{w.quiet === 1 ? "" : "s"} quiet.</div> : null}
        </div>
      )
    case "point":
      return (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }} data-ui="widget.point">
          <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
            Pointed at <strong>{w.label}</strong>
            {w.caption ? <div style={sub}>{w.caption}</div> : null}
          </div>
          <button type="button" style={btn} onClick={() => point({ key: w.key, ask: w.ask, mode: w.mode, caption: w.caption })}>Show again</button>
        </div>
      )
    case "navigate":
      return (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }} data-ui="widget.navigate">
          <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>Opened <strong>{w.label}</strong></div>
          <Link href={w.path} style={btn}>Open again</Link>
        </div>
      )
    case "projects":
      return (
        <div style={card} data-ui="widget.projects"><div style={head}>{w.title}</div>
          {w.items.map((i) => (
            <div style={row} key={i.id}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14 }}>{i.name}</div>{i.status ? <div style={sub}>{i.status}</div> : null}</div>
              <Link href={`/project/${i.id}`} style={btn}>Open</Link>
            </div>
          ))}{more(w.more)}
        </div>
      )
  }
}

/** Cards for the finished tool calls in one reply, newest result per kind. */
export function AgentWidgets({ spans, fresh = false }: { spans: AgentSpan[]; fresh?: boolean }) {
  // Point once, and only for a reply that streamed in during this visit (never when an old chat is reopened).
  const fired = useRef(new Set<string>())
  const router = useRouter()
  useEffect(() => {
    if (!fresh) return
    for (const s of spans) {
      const w = s.widget
      if (s.status === "ok" && w?.kind === "point" && !fired.current.has(s.id)) {
        fired.current.add(s.id)
        point({ key: w.key, ask: w.ask, mode: w.mode, caption: w.caption })
      }
      if (s.status === "ok" && w?.kind === "navigate" && !fired.current.has(s.id)) {
        fired.current.add(s.id)
        router.push(w.path)
      }
    }
  }, [spans, fresh, router])

  const seen = new Set<string>()
  const widgets = spans
    .filter((s) => s.status === "ok" && s.widget)
    .reverse()
    .filter((s) => (seen.has(s.widget!.kind) ? false : (seen.add(s.widget!.kind), true)))
    .reverse()
  if (!widgets.length) return null
  return (
    <div style={{ display: "grid", gap: 8, margin: "4px 0 8px", maxWidth: 520 }} data-slot="agent-widgets">
      {widgets.map((s) => <Card key={s.id} w={s.widget!} />)}
    </div>
  )
}
