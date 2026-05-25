"use client"

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { formatDistanceToNow } from "date-fns"
import {
  Sparkles,
  Compass,
  CheckCircle2,
  Rocket,
  Archive,
  Tag,
  Search,
  ChevronDown,
  X,
} from "lucide-react"
import type { Idea, IdeaLifecycle } from "@/lib/types"

// ── Column config ──────────────────────────────────────────────────────────

type ColumnDef = {
  id: IdeaLifecycle
  label: string
  icon: typeof Sparkles
  color: string       // CSS color token or class segment
  pillClass: string   // j-pill modifier
  accentVar: string   // CSS var for header rule
}

const COLUMNS: ColumnDef[] = [
  {
    id: "seed",
    label: "Seed",
    icon: Sparkles,
    color: "var(--j-idea)",
    pillClass: "j-idea",
    accentVar: "--j-idea",
  },
  {
    id: "exploring",
    label: "Exploring",
    icon: Compass,
    color: "var(--j-info)",
    pillClass: "j-info",
    accentVar: "--j-info",
  },
  {
    id: "refined",
    label: "Refined",
    icon: CheckCircle2,
    color: "var(--j-pos)",
    pillClass: "j-pos",
    accentVar: "--j-pos",
  },
  {
    id: "promoted",
    label: "Promoted",
    icon: Rocket,
    color: "var(--j-biz)",
    pillClass: "j-biz",
    accentVar: "--j-biz",
  },
  {
    id: "archived",
    label: "Archived",
    icon: Archive,
    color: "oklch(0.556 0 0)",
    pillClass: "j-muted",
    accentVar: "--j-ring",
  },
]

// ── Kanban card ────────────────────────────────────────────────────────────

interface KanbanCardProps {
  idea: Idea
  index: number
  onClick: (id: string) => void
}

function KanbanCard({ idea, index, onClick }: KanbanCardProps) {
  const relativeTime = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(idea.updatedAt), { addSuffix: true })
    } catch {
      return ""
    }
  }, [idea.updatedAt])

  return (
    <Draggable draggableId={idea.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(idea.id)}
          style={{
            ...provided.draggableProps.style,
            background: snapshot.isDragging
              ? "var(--j-surface-2)"
              : "var(--j-surface)",
            border: "1px solid var(--j-ring)",
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 8,
            cursor: "pointer",
            boxShadow: snapshot.isDragging
              ? "0 8px 24px oklch(0 0 0 / 0.45), 0 0 0 1px var(--j-ring-strong)"
              : "none",
            transform: snapshot.isDragging
              ? `${provided.draggableProps.style?.transform ?? ""} rotate(1.5deg)`
              : provided.draggableProps.style?.transform,
            transition: snapshot.isDragging ? "none" : "box-shadow 0.15s ease",
            userSelect: "none",
          }}
        >
          {/* Title */}
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 500,
              color: "oklch(0.985 0 0)",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {idea.title}
          </p>

          {/* Description */}
          {idea.description && (
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12,
                color: "oklch(0.556 0 0)",
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {idea.description}
            </p>
          )}

          {/* Tags */}
          {idea.tags && idea.tags.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginTop: 8,
              }}
            >
              {idea.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "oklch(1 0 0 / 0.05)",
                    color: "oklch(0.708 0 0)",
                    boxShadow: "inset 0 0 0 1px var(--j-ring)",
                  }}
                >
                  <Tag size={9} />
                  {tag}
                </span>
              ))}
              {idea.tags.length > 3 && (
                <span
                  style={{
                    fontSize: 10,
                    color: "oklch(0.556 0 0)",
                    padding: "2px 4px",
                  }}
                >
                  +{idea.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Footer: category + time */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 10,
              gap: 6,
            }}
          >
            {idea.category ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "oklch(0.556 0 0)",
                  background: "oklch(1 0 0 / 0.04)",
                  padding: "2px 6px",
                  borderRadius: 5,
                  boxShadow: "inset 0 0 0 1px var(--j-hairline)",
                }}
              >
                {idea.category}
              </span>
            ) : (
              <span />
            )}
            <span style={{ fontSize: 10, color: "oklch(0.420 0 0)" }}>
              {relativeTime}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  )
}

// ── Column ─────────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  col: ColumnDef
  ideas: Idea[]
  onCardClick: (id: string) => void
}

function KanbanColumn({ col, ideas, onCardClick }: KanbanColumnProps) {
  const Icon = col.icon

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 240,
        flex: "1 1 0",
        maxWidth: 320,
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 2px 10px",
          borderBottom: `2px solid var(${col.accentVar})`,
          marginBottom: 10,
        }}
      >
        <Icon size={14} style={{ color: col.color, flexShrink: 0 }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "oklch(0.860 0 0)",
          }}
        >
          {col.label}
        </span>
        <span
          className={`j-pill ${col.pillClass}`}
          style={{ marginLeft: "auto", minWidth: 22, justifyContent: "center" }}
        >
          {ideas.length}
        </span>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={col.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              flex: 1,
              minHeight: 120,
              borderRadius: 10,
              padding: snapshot.isDraggingOver ? "6px" : "0",
              background: snapshot.isDraggingOver
                ? "oklch(1 0 0 / 0.025)"
                : "transparent",
              border: snapshot.isDraggingOver
                ? `1px dashed var(${col.accentVar})`
                : "1px solid transparent",
              transition: "background 0.15s, border 0.15s",
            }}
          >
            {ideas.length === 0 && !snapshot.isDraggingOver ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "28px 12px",
                  color: "oklch(0.420 0 0)",
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px dashed var(--j-hairline)",
                }}
              >
                No ideas in {col.label}
              </div>
            ) : (
              ideas.map((idea, index) => (
                <KanbanCard
                  key={idea.id}
                  idea={idea}
                  index={index}
                  onClick={onCardClick}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

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

  // Mobile column selector
  const [mobileCol, setMobileCol] = useState<IdeaLifecycle>("seed")

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

  const filteredIdeas = useMemo(() => {
    const q = search.toLowerCase()
    return ideas.filter((idea) => {
      if (q && !idea.title.toLowerCase().includes(q) && !idea.description?.toLowerCase().includes(q)) {
        return false
      }
      if (categoryFilter && idea.category !== categoryFilter) return false
      if (tagFilter.length > 0 && !tagFilter.every((t) => idea.tags?.includes(t))) {
        return false
      }
      return true
    })
  }, [ideas, search, categoryFilter, tagFilter])

  const byColumn = useMemo(() => {
    const map: Record<IdeaLifecycle, Idea[]> = {
      seed: [],
      exploring: [],
      refined: [],
      promoted: [],
      archived: [],
    }
    filteredIdeas.forEach((idea) => {
      map[idea.lifecycle].push(idea)
    })
    return map
  }, [filteredIdeas])

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

  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      const { source, destination, draggableId } = result
      if (!destination) return
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return
      }

      const newLifecycle = destination.droppableId as IdeaLifecycle

      // Optimistic update
      const base = optimisticIdeas ?? ideas
      const updated = base.map((idea) =>
        idea.id === draggableId ? { ...idea, lifecycle: newLifecycle } : idea
      )
      setOptimisticIdeas(updated)

      try {
        await onLifecycleChange(draggableId, newLifecycle)
        setOptimisticIdeas(null)
      } catch {
        // Rollback on failure
        setOptimisticIdeas(null)
      }
    },
    [ideas, optimisticIdeas, onLifecycleChange]
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

      {/* ── Mobile column tabs ────────────────────────────────────────── */}
      <div
        className="j-tabs"
        style={{ display: "none" }}
        // shown in CSS at ≤768px via kanban-mobile-tabs class
        id="kanban-mobile-tabs"
      >
        {COLUMNS.map((col) => {
          const Icon = col.icon
          return (
            <button
              key={col.id}
              className={`j-tab${mobileCol === col.id ? " j-active" : ""}`}
              onClick={() => setMobileCol(col.id)}
            >
              <Icon size={12} />
              {col.label}
              <span
                className={`j-pill ${col.pillClass}`}
                style={{ fontSize: 10, padding: "1px 5px" }}
              >
                {displayByColumn[col.id].length}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Board ────────────────────────────────────────────────────── */}
      {/* Close tag menu on outside click */}
      {tagMenuOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
          }}
          onClick={() => setTagMenuOpen(false)}
        />
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        {/* Desktop: all 5 columns */}
        <div
          id="kanban-desktop"
          style={{
            display: "flex",
            gap: 16,
            overflowX: "auto",
            paddingBottom: 16,
            alignItems: "flex-start",
          }}
        >
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              ideas={displayByColumn[col.id]}
              onCardClick={handleCardClick}
            />
          ))}
        </div>

        {/* Mobile: single visible column */}
        <div id="kanban-mobile" style={{ display: "none" }}>
          {COLUMNS.filter((c) => c.id === mobileCol).map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              ideas={displayByColumn[col.id]}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  )
}
