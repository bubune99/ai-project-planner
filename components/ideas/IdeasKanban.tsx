"use client"

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { KanbanBoard, type KanbanTask } from "@/components/views/kanban/KanbanBoard"
import { toIdeaColumns, type IdeaColumnDef } from "@/components/views/kanban/adaptIdeas"
import { Tag, Search, ChevronDown, X } from "lucide-react"
import type { Idea, IdeaLifecycle } from "@/lib/types"

// ── Column config ──────────────────────────────────────────────────────────

/*
  The lifecycle columns. The board renders the dot from `color` directly, so
  the j-* custom properties carry straight through and the Ideas board keeps
  the same palette it had — it is only the chrome around them that changes.
*/
const COLUMNS: IdeaColumnDef[] = [
  { id: "seed", label: "Seed", color: "var(--j-idea)" },
  { id: "exploring", label: "Exploring", color: "var(--j-info)" },
  { id: "refined", label: "Refined", color: "var(--j-pos)" },
  { id: "promoted", label: "Promoted", color: "var(--j-biz)" },
  { id: "archived", label: "Archived", color: "oklch(0.556 0 0)" },
]

// ── Main kanban component ──────────────────────────────────────────────────

export interface IdeasKanbanProps {
  ideas: Idea[]
  isLoading: boolean
  onLifecycleChange: (id: string, lifecycle: IdeaLifecycle) => Promise<void>
  onCreate: () => void
}

export function IdeasKanban({
  ideas,
  isLoading,
  onLifecycleChange,
  onCreate,
}: IdeasKanbanProps) {
  const router = useRouter()

  // ── Filters state ────────────────────────────────────────────────────────
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [tagMenuOpen, setTagMenuOpen] = useState(false)


  // ── Derived data ─────────────────────────────────────────────────────────
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    ideas.forEach((i) => {
      if (i.category) cats.add(i.category)
    })
    return Array.from(cats).sort()
  }, [ideas])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    ideas.forEach((i) => i.tags?.forEach((t) => tags.add(t)))
    return Array.from(tags).sort()
  }, [ideas])

  /*
    `filteredIdeas` and a `byColumn` map used to be computed here. Nothing read
    either: displayFiltered/displayByColumn below do the same filtering over
    the optimistic list and are what the board renders. Two dead passes over
    every idea on every keystroke of the search box. Removed.
  */

  // ── Optimistic DnD ───────────────────────────────────────────────────────
  const [optimisticIdeas, setOptimisticIdeas] = useState<Idea[] | null>(null)
  const displayIdeas = optimisticIdeas ?? ideas

  const displayFiltered = useMemo(() => {
    const q = search.toLowerCase()
    return displayIdeas.filter((idea) => {
      if (q && !idea.title.toLowerCase().includes(q) && !idea.description?.toLowerCase().includes(q)) {
        return false
      }
      if (categoryFilter && idea.category !== categoryFilter) return false
      if (tagFilter.length > 0 && !tagFilter.every((t) => idea.tags?.includes(t))) {
        return false
      }
      return true
    })
  }, [displayIdeas, search, categoryFilter, tagFilter])

  const displayByColumn = useMemo(() => {
    const map: Record<IdeaLifecycle, Idea[]> = {
      seed: [],
      exploring: [],
      refined: [],
      promoted: [],
      archived: [],
    }
    displayFiltered.forEach((idea) => {
      map[idea.lifecycle].push(idea)
    })
    return map
  }, [displayFiltered])

  /*
    Ideas have no manual order — only which lifecycle column they sit in. So a
    same-column move is a no-op rather than a reorder to persist, and the board
    is told to put the card back by bumping the nonce (it applies a move to its
    own state first and reports it afterwards).
  */
  const [boardNonce, setBoardNonce] = useState(0)

  const handleTaskMove = useCallback(
    async (ideaId: string, from: { col: string }, to: { col: string }) => {
      if (from.col === to.col) {
        setBoardNonce((n) => n + 1)
        return
      }

      const newLifecycle = to.col as IdeaLifecycle

      // Optimistic update
      const base = optimisticIdeas ?? ideas
      const updated = base.map((idea) =>
        idea.id === ideaId ? { ...idea, lifecycle: newLifecycle } : idea
      )
      setOptimisticIdeas(updated)

      try {
        await onLifecycleChange(ideaId, newLifecycle)
        setOptimisticIdeas(null)
      } catch {
        // Rollback on failure
        setOptimisticIdeas(null)
        setBoardNonce((n) => n + 1)
      }
    },
    [ideas, optimisticIdeas, onLifecycleChange]
  )

  const boardColumns = useMemo(
    () => toIdeaColumns(COLUMNS, (lc) => displayByColumn[lc] ?? []),
    // boardNonce is deliberate — it is how a refused or failed move is undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayByColumn, boardNonce]
  )

  // ── Tag filter toggle ────────────────────────────────────────────────────
  const toggleTag = (tag: string) => {
    setTagFilter((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleCardClick = (id: string) => {
    router.push(`/ideas/${id}`)
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="j-col j-gap-4">
        <div className="j-row j-gap-3" style={{ height: 36 }}>
          {[200, 160, 120].map((w) => (
            <div
              key={w}
              style={{
                width: w,
                height: 36,
                borderRadius: 8,
                background: "oklch(1 0 0 / 0.05)",
                animation: "j-pulse 1.4s ease-in-out infinite",
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            overflowX: "auto",
            paddingBottom: 8,
          }}
        >
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              style={{
                minWidth: 240,
                flex: "1 1 0",
                height: 360,
                borderRadius: 12,
                background: "oklch(1 0 0 / 0.03)",
                animation: "j-pulse 1.4s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="j-col j-gap-4">
      {/* ── Filters bar ──────────────────────────────────────────────── */}
      <div
        className="j-row j-wrap j-gap-3"
        style={{ alignItems: "flex-start" }}
      >
        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "oklch(1 0 0 / 0.04)",
            boxShadow: "0 0 0 1px var(--j-ring)",
            borderRadius: 8,
            padding: "6px 10px",
            minWidth: 220,
            flex: "1 1 220px",
            maxWidth: 340,
          }}
        >
          <Search size={13} style={{ color: "oklch(0.556 0 0)", flexShrink: 0 }} />
          <input
          aria-label="Search ideas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ideas…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 13,
              color: "oklch(0.860 0 0)",
              fontFamily: "inherit",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color: "oklch(0.556 0 0)",
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Category */}
        <select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            background: "oklch(1 0 0 / 0.04)",
            boxShadow: "0 0 0 1px var(--j-ring)",
            border: "none",
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 13,
            color: categoryFilter ? "oklch(0.860 0 0)" : "oklch(0.556 0 0)",
            fontFamily: "inherit",
            outline: "none",
            cursor: "pointer",
            minWidth: 130,
          }}
        >
          <option value="">All categories</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Tags multi-select */}
        {allTags.length > 0 && (
          <div style={{ position: "relative" }}>
            <button
              className="j-btn j-btn-ghost"
              onClick={() => setTagMenuOpen((v) => !v)}
              style={{ gap: 6, fontSize: 12 }}
            >
              <Tag size={12} />
              Tags
              {tagFilter.length > 0 && (
                <span className="j-pill j-proj" style={{ padding: "1px 6px", fontSize: 10 }}>
                  {tagFilter.length}
                </span>
              )}
              <ChevronDown size={12} />
            </button>
            {tagMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 50,
                  background: "var(--j-surface-2)",
                  boxShadow: "0 0 0 1px var(--j-ring-strong), 0 12px 32px oklch(0 0 0 / 0.4)",
                  borderRadius: 10,
                  padding: "8px 6px",
                  minWidth: 180,
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      background: tagFilter.includes(tag)
                        ? "oklch(0.870 0.045 252 / 0.14)"
                        : "transparent",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 12,
                      color: tagFilter.includes(tag)
                        ? "var(--j-accent)"
                        : "oklch(0.860 0 0)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        border: "1px solid var(--j-ring-strong)",
                        background: tagFilter.includes(tag)
                          ? "var(--j-accent)"
                          : "transparent",
                        flexShrink: 0,
                      }}
                    />
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active tag chips */}
        {tagFilter.map((t) => (
          <span
            key={t}
            className="j-pill j-proj"
            style={{ cursor: "pointer", gap: 4 }}
            onClick={() => toggleTag(t)}
          >
            {t}
            <X size={9} />
          </span>
        ))}
      </div>

      {/* Close tag menu on outside click */}
      {tagMenuOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40 }}
          onClick={() => setTagMenuOpen(false)}
        />
      )}

      {/*
        One board, not a desktop tree plus a hidden mobile tree. Rendering
        both put TWO droppables with the same id inside one DragDropContext,
        and doubled the drag bookkeeping for a subtree nobody could see. The
        board scrolls horizontally on its own and draws its own rail, so the
        mobile column tabs are no longer needed either.
      */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 16 }}>
        <KanbanBoard
          columns={boardColumns}
          label="Ideas board"
          onTaskMove={handleTaskMove}
          onTaskOpen={(task: KanbanTask) => handleCardClick(task.id)}
        />
      </div>
    </div>
  )
}
