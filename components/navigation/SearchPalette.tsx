"use client"

/*
 * The top search: pages, then projects, tasks, documents, ideas and decisions that match, then one row that asks the
 * assistant. Walk 2026-11-16: finding a card took the board's own search plus the assistant; this box only jumped to
 * pages. Rows are built by lib/search/rows.ts. Closes three ways: choosing a row, pressing outside, Esc.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "@/components/jarvis/icons"
import { ASK_EVENT, SHEET_EVENT, emit } from "@/lib/chat/events"
import { searchRows, type Results, type Row } from "@/lib/search/rows"

type Page = [string, { title: string; sub: string }]

export function SearchPalette({ onClose, pagesFor }: { onClose: () => void; pagesFor: (typed: string) => Page[] }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Results | null>(null)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(0)
  const seq = useRef(0)

  // Search once typing pauses; a slower earlier answer never replaces a later one.
  useEffect(() => {
    const typed = q.trim()
    if (typed.length < 2) { setResults(null); setBusy(false); return }
    const mine = ++seq.current
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(typed)}&domains=projects,tasks,documents,ideas,decisions&limit=5`, { credentials: "include" })
        const j = await r.json().catch(() => null)
        if (mine === seq.current) setResults(r.ok ? (j?.data?.results ?? null) : null)
      } finally {
        if (mine === seq.current) setBusy(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  const rows = useMemo(() => searchRows(q, pagesFor(q), results), [q, results, pagesFor])
  useEffect(() => setSel(0), [rows.length])

  const choose = (row: Row | undefined) => {
    if (!row) return
    onClose()
    if ("ask" in row) {
      emit(location.pathname.startsWith("/chat") || document.body.classList.contains("ade-open") ? ASK_EVENT : SHEET_EVENT, row.ask)
    } else {
      window.location.assign(row.href)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose() }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(rows.length - 1, s + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === "Enter") { e.preventDefault(); choose(rows[sel]) }
  }

  let lastGroup = ""
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgb(0 0 0 / 0.55)", zIndex: 50,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh",
      }}
    >
      <div
        className="j-cmdk"
        role="dialog"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(600px, 94vw)", background: "var(--opx-card)", color: "var(--opx-ink)", borderRadius: 14,
          border: "1px solid var(--opx-line)", boxShadow: "0 24px 48px -12px rgb(0 0 0 / 0.5)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--opx-line)" }}>
          <Icon name="search" size={16} />
          <input
            autoFocus
            placeholder="Find a page, project, task or document…"
            aria-label="Search the planner"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            style={{ flex: 1, minHeight: 32, background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: 15, fontFamily: "inherit" }}
          />
          {busy && <span style={{ fontSize: 12, color: "var(--opx-muted)" }}>Searching</span>}
        </div>
        <div role="listbox" aria-label="Results" style={{ padding: 8, maxHeight: "60vh", overflowY: "auto" }}>
          {rows.length === 0 && (
            <div style={{ padding: "12px 10px", color: "var(--opx-muted)", fontSize: 13 }}>Type a word: pages, projects, tasks and documents that match appear here.</div>
          )}
          {rows.map((row, i) => {
            const head = row.group !== lastGroup ? row.group : null
            lastGroup = row.group
            return (
              <div key={row.key}>
                {head && <div style={{ padding: "8px 10px 4px", fontSize: 12, fontWeight: 600, color: "var(--opx-muted)" }}>{head}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  data-search-row={row.key}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => choose(row)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: "8px 10px",
                    borderRadius: 8, border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                    background: i === sel ? "var(--opx-soft)" : "transparent", color: "inherit", fontSize: 14,
                  }}
                >
                  <Icon name={"ask" in row ? "sparkle" : "arrow"} size={14} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</span>
                  {row.sub && <span style={{ fontSize: 12, color: "var(--opx-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "40%" }}>{row.sub}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
