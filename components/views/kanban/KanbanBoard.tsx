"use client";

import * as React from "react";
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  FileText,
  Flag,
  LayoutDashboard,
  type LucideIcon,
  Monitor,
  MoreHorizontal,
  Palette,
  Plus,
  Server,
  Smartphone,
} from "lucide-react";

/* ==========================================================================
   KanbanBoard

   A horizontally scrolling board of columns you can drag cards between.

   The drag is built on raw pointer events rather than a drag-and-drop
   library, so the whole gesture is ours to shape: the card lifts out of the
   list into an overlay that tracks the cursor, the gap it left collapses,
   a gap springs open wherever it would land, and every other card slides
   into its new place instead of jumping there.

   The insert position is worked out in a coordinate space that pretends the
   placeholder is not there. Without that the placeholder pushes cards past
   the pointer, which flips the decision back, which moves the placeholder,
   which flips it again. The card would sit and flicker between two slots.

   Everything also works from the keyboard: focus a card, press space to pick
   it up, move it with the arrow keys, space again to drop, escape to put it
   back. Each move is announced to screen readers.
   ========================================================================== */

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** iOS style continuous corners, degrading to a plain radius. */
const SQUIRCLE = "[corner-shape:squircle]";

/*
 * Upstream pinned the board to Inter via a --kanban-font custom property.
 * Removed: this app loads Geist Sans at the root and the board should wear
 * whatever the page is wearing. Everything else about the type scale is kept.
 */

/** One chip. Fixed height and no line box, so the icon and label sit dead centre. */
const CHIP =
  "inline-flex h-[22px] items-center gap-1 rounded-[7px] px-2 text-[11px] leading-none";

/** Vertical space between cards, in px. Needed in maths, not just in CSS. */
const GAP = 8;

const LIFT_SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;
const FLOW_SPRING = { type: "spring", stiffness: 420, damping: 36, mass: 0.9 } as const;

export type Priority = "urgent" | "high" | "normal" | "low";

const PRIORITY_STYLES: Record<Priority, string> = {
  urgent:
    "bg-rose-50 text-rose-600 dark:bg-rose-500/12 dark:text-rose-300",
  high: "bg-amber-50 text-amber-700 dark:bg-amber-500/12 dark:text-amber-300",
  normal: "bg-blue-50 text-blue-600 dark:bg-blue-500/12 dark:text-blue-300",
  low: "bg-neutral-100 text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-400",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

/** Accent used by a column's status dot. */
export type Accent = "slate" | "violet" | "blue" | "amber" | "emerald";

const ACCENT_DOT: Record<Accent, string> = {
  slate: "bg-neutral-400",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
};

export interface KanbanAssignee {
  name: string;
  /** Portrait URL. Falls back to initials on a colour picked from the name. */
  avatar?: string;
}

export interface KanbanTask {
  id: string;
  title: string;
  /** One supporting line under the title. */
  note?: string;
  priority?: Priority;
  /** Short label with an icon, e.g. "Web app". */
  category?: string;
  /** Icon key, or your own node. */
  icon?: IconKey | React.ReactNode;
  assignees?: KanbanAssignee[];
  /** Free text, e.g. "25 Apr" or "Tomorrow". */
  due?: string;
  /** Paints the due date amber. Use it for today, tomorrow and overdue. */
  dueSoon?: boolean;
  /** 0 to 100. Drawn as a ring next to the date. */
  progress?: number;

  /* ---- added to the fork ---- */

  /**
   * Coloured pills under the title. `category` is the one chip that sits up
   * top with the priority; these are the rest. Kept separate so the head of
   * the card stays two chips wide however many tags a step carries.
   */
  tags?: Array<{ label: string; color: string }>;
  /**
   * Small muted counters in the footer — estimate, subtasks, checklist,
   * dependencies. A generic list rather than a field each, so adding another
   * counter never means touching this component again.
   */
  footnotes?: Array<{ label: string; title?: string }>;
  /** Strikes the title through and mutes the card. */
  done?: boolean;
}

export interface KanbanColumn {
  id: string;
  name: string;
  accent?: Accent;
  /**
   * Added to the fork: project statuses carry an arbitrary hex colour, and
   * mapping those onto the five named accents would quietly discard a colour
   * the user picked. When set this wins over `accent`.
   */
  accentHex?: string;
  tasks: KanbanTask[];
}

export interface KanbanBoardProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag" | "onChange"
  > {
  columns: KanbanColumn[];
  /**
   * Fires after every move with the whole board.
   *
   * NOTE: `columns` is mirrored into internal state and resynced whenever its
   * identity changes, so the parent MUST memoize the array it passes. Handing
   * a freshly built array down on every render resets the board mid-drag.
   */
  onChange?: (columns: KanbanColumn[]) => void;
  /** Accessible name for the scrolling region. */
  label?: string;

  /* ---- added to the fork: upstream has no way to attach app behaviour ---- */

  /** Fires with only the card that moved, so callers can PATCH one row. */
  onTaskMove?: (taskId: string, from: Slot, to: Slot) => void;
  /** Rendered in the column header's trailing slot, in place of the inert dots. */
  renderColumnMenu?: (column: KanbanColumn) => React.ReactNode;
  /** Rendered in a card's trailing slot; shown on hover and on keyboard focus. */
  renderCardMenu?: (task: KanbanTask, columnId: string) => React.ReactNode;
  /** Foot-of-column "Add task". Omit to hide the button entirely. */
  onAddTask?: (columnId: string) => void;
  /** Click (not drag) on a card body. */
  onTaskOpen?: (task: KanbanTask, columnId: string) => void;
}

type DragState = {
  taskId: string;
  fromCol: string;
  width: number;
  height: number;
  /** Where inside the card the pointer grabbed it. */
  offsetX: number;
  offsetY: number;
};

type Slot = { col: string; index: number };

export const KanbanBoard = React.forwardRef<HTMLDivElement, KanbanBoardProps>(
  function KanbanBoard(
    {
      columns,
      onChange,
      label = "Project board",
      className,
      style,
      onTaskMove,
      renderColumnMenu,
      renderCardMenu,
      onAddTask,
      onTaskOpen,
      ...props
    },
    ref,
  ) {
    const [cols, setCols] = React.useState<KanbanColumn[]>(columns);
    const [drag, setDrag] = React.useState<DragState | null>(null);
    const [slot, setSlot] = React.useState<Slot | null>(null);
    const [grabbed, setGrabbed] = React.useState<string | null>(null);
    const [announcement, setAnnouncement] = React.useState("");
    const [atStart, setAtStart] = React.useState(true);
    const [atEnd, setAtEnd] = React.useState(true);
    const reduceMotion = useReducedMotion();

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const trackRef = React.useRef<HTMLDivElement>(null);
    const listRefs = React.useRef(new Map<string, HTMLDivElement>());
    const colRefs = React.useRef(new Map<string, HTMLDivElement>());
    const cardRefs = React.useRef(new Map<string, HTMLDivElement>());
    const dragRef = React.useRef<DragState | null>(null);
    const slotRef = React.useRef<Slot | null>(null);
    const autoScroll = React.useRef(0);
    const rafRef = React.useRef<number | null>(null);
    /*
      Added: the card is both a drag handle and a click target. Without a
      movement threshold every drop also counts as a click and opens the task
      you just moved. Record where the pointer went down and whether it
      travelled far enough to mean "drag".
    */
    const pointerStart = React.useRef({ x: 0, y: 0 });
    const moved = React.useRef(false);

    React.useEffect(() => setCols(columns), [columns]);

    /*
      The track fades into the page background on whichever side still has
      columns hidden past the edge. Each side switches off once you reach it,
      so nothing is ever dimmed for no reason.
    */
    const syncEdges = React.useCallback(() => {
      const el = trackRef.current;
      if (!el) return;
      setAtStart(el.scrollLeft < 8);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
    }, []);

    React.useEffect(() => {
      syncEdges();
      const el = trackRef.current;
      if (!el) return;
      const ro = new ResizeObserver(syncEdges);
      ro.observe(el);
      return () => ro.disconnect();
    }, [syncEdges, cols.length]);

    const fade = "24px";
    const maskStops = [
      `transparent 0%, #000 ${atStart ? "0%" : fade}`,
      `#000 ${atEnd ? "100%" : `calc(100% - ${fade})`}, transparent 100%`,
    ].join(", ");
    const mask =
      atStart && atEnd ? undefined : `linear-gradient(to right, ${maskStops})`;

    /*
      A keyboard move re-mounts the card inside another column, which drops
      focus on the floor and swallows every key after the first. Put it back
      on the card that is still being carried.
    */
    React.useEffect(() => {
      if (!grabbed) return;
      const el = cardRefs.current.get(grabbed);
      if (el && document.activeElement !== el) el.focus({ preventScroll: true });
    }, [cols, grabbed]);

    /* Upstream also declared a `commit` helper here that nothing called —
       `move` does its own setCols + onChange. Removed. */

    /* ---------------------------------------------------------------- move */

    const locate = React.useCallback(
      (list: KanbanColumn[], taskId: string) => {
        for (const c of list) {
          const i = c.tasks.findIndex((t) => t.id === taskId);
          if (i > -1) return { col: c.id, index: i, task: c.tasks[i] };
        }
        return null;
      },
      [],
    );

    const move = React.useCallback(
      (taskId: string, to: Slot) => {
        setCols((prev) => {
          const found = locate(prev, taskId);
          if (!found) return prev;
          if (found.col === to.col && found.index === to.index) return prev;

          const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }));
          const from = next.find((c) => c.id === found.col)!;
          from.tasks.splice(found.index, 1);
          const dest = next.find((c) => c.id === to.col)!;
          dest.tasks.splice(Math.min(to.index, dest.tasks.length), 0, found.task);

          onChange?.(next);
          // Added: the whole board is the wrong unit of work for a persistence
          // layer that updates one row. Hand the caller just what moved.
          onTaskMove?.(taskId, { col: found.col, index: found.index }, to);
          return next;
        });
      },
      [locate, onChange, onTaskMove],
    );

    /* -------------------------------------------------------- hit testing */

    /**
     * Card midpoints per column, measured once at drag start and stored as
     * offsets from the top of each list.
     *
     * Measuring live during the drag looks simpler and is wrong twice over.
     * The cards are mid-spring, so their boxes are somewhere between where
     * they were and where they are going; and the placeholder pushes them
     * past the pointer, which flips the decision, which moves the
     * placeholder, which flips it back. A snapshot of the layout without
     * the dragged card in it has neither problem.
     */
    const snapRef = React.useRef(new Map<string, number[]>());

    const snapshot = React.useCallback((taskId: string, fromCol: string) => {
      const map = new Map<string, number[]>();
      listRefs.current.forEach((list, colId) => {
        const listTop = list.getBoundingClientRect().top;
        const cards = Array.from(list.querySelectorAll<HTMLElement>("[data-kanban-card]"));
        let removed = -1;
        let removedH = 0;
        const rows = cards.map((el, i) => {
          const r = el.getBoundingClientRect();
          const isDragged = colId === fromCol && el.dataset.kanbanCard === taskId;
          if (isDragged) {
            removed = i;
            removedH = r.height;
          }
          return { top: r.top - listTop, h: r.height, isDragged };
        });
        const mids = rows
          .filter((row) => !row.isDragged)
          .map((row, i) => {
            // close the gap the dragged card leaves behind
            const shift = removed > -1 && i >= removed ? removedH + GAP : 0;
            return row.top - shift + row.h / 2;
          });
        map.set(colId, mids);
      });
      snapRef.current = map;
    }, []);

    /** Which slot is the pointer over? */
    const slotAt = React.useCallback((clientX: number, clientY: number): Slot | null => {
      const d = dragRef.current;
      if (!d) return null;

      let inside = "";
      let nearestId = "";
      let nearest = Infinity;
      colRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right) inside = id;
        const dx = Math.abs(clientX - (r.left + r.width / 2));
        if (dx < nearest) {
          nearest = dx;
          nearestId = id;
        }
      });
      const colId = inside || nearestId;
      if (!colId) return null;

      const list = listRefs.current.get(colId);
      if (!list) return { col: colId, index: 0 };

      const listTop = list.getBoundingClientRect().top;
      const mids = snapRef.current.get(colId) ?? [];

      let index = mids.length;
      for (let i = 0; i < mids.length; i++) {
        if (clientY < listTop + mids[i]) {
          index = i;
          break;
        }
      }
      return { col: colId, index };
    }, []);

    /* ------------------------------------------------------ pointer drag */

    const endDrag = React.useCallback(() => {
      const d = dragRef.current;
      const s = slotRef.current;
      if (d && s) move(d.taskId, s);
      dragRef.current = null;
      slotRef.current = null;
      autoScroll.current = 0;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setDrag(null);
      setSlot(null);
    }, [move]);

    React.useEffect(() => {
      if (!drag) return;

      const onMove = (e: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        if (
          Math.abs(e.clientX - pointerStart.current.x) > 4 ||
          Math.abs(e.clientY - pointerStart.current.y) > 4
        ) {
          moved.current = true;
        }
        x.set(e.clientX - d.offsetX);
        y.set(e.clientY - d.offsetY);

        const next = slotAt(e.clientX, e.clientY);
        const cur = slotRef.current;
        if (next && (!cur || cur.col !== next.col || cur.index !== next.index)) {
          slotRef.current = next;
          setSlot(next);
        }

        // nudge the track along when you drag near either edge
        const track = trackRef.current;
        if (track) {
          const r = track.getBoundingClientRect();
          const edge = 72;
          autoScroll.current =
            e.clientX < r.left + edge ? -14 : e.clientX > r.right - edge ? 14 : 0;
        }
      };

      const onUp = () => endDrag();

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);

      const tick = () => {
        if (autoScroll.current && trackRef.current) {
          trackRef.current.scrollLeft += autoScroll.current;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [drag, endDrag, slotAt, x, y]);

    const startDrag = (e: React.PointerEvent, task: KanbanTask, colId: string, index: number) => {
      if (e.button !== 0) return;
      // a menu or button living inside the card is not a drag handle
      if ((e.target as HTMLElement).closest?.("[data-kanban-no-drag]")) return;
      pointerStart.current = { x: e.clientX, y: e.clientY };
      moved.current = false;
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      const state: DragState = {
        taskId: task.id,
        fromCol: colId,
        width: r.width,
        height: r.height,
        offsetX: e.clientX - r.left,
        offsetY: e.clientY - r.top,
      };
      x.set(r.left);
      y.set(r.top);
      snapshot(task.id, colId);
      dragRef.current = state;
      slotRef.current = { col: colId, index };
      setDrag(state);
      setSlot({ col: colId, index });
      setGrabbed(null);
    };

    /* ---------------------------------------------------------- keyboard */

    const originRef = React.useRef<Slot | null>(null);

    const onCardKeyDown = (e: React.KeyboardEvent, task: KanbanTask) => {
      const isGrabbed = grabbed === task.id;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (isGrabbed) {
          setGrabbed(null);
          const at = locate(cols, task.id);
          setAnnouncement(
            at ? `Dropped ${task.title} in ${colName(cols, at.col)}, position ${at.index + 1}.` : "",
          );
        } else {
          const at = locate(cols, task.id);
          originRef.current = at ? { col: at.col, index: at.index } : null;
          setGrabbed(task.id);
          setAnnouncement(`Picked up ${task.title}. Use the arrow keys to move it.`);
        }
        return;
      }

      if (e.key === "Escape" && isGrabbed) {
        e.preventDefault();
        if (originRef.current) move(task.id, originRef.current);
        setGrabbed(null);
        setAnnouncement(`Cancelled. ${task.title} is back where it started.`);
        return;
      }

      if (!isGrabbed) return;
      const at = locate(cols, task.id);
      if (!at) return;
      const colIndex = cols.findIndex((c) => c.id === at.col);

      let to: Slot | null = null;
      if (e.key === "ArrowUp") to = { col: at.col, index: Math.max(0, at.index - 1) };
      if (e.key === "ArrowDown")
        to = { col: at.col, index: Math.min(cols[colIndex].tasks.length - 1, at.index + 1) };
      if (e.key === "ArrowLeft" && colIndex > 0)
        to = { col: cols[colIndex - 1].id, index: Math.min(at.index, cols[colIndex - 1].tasks.length) };
      if (e.key === "ArrowRight" && colIndex < cols.length - 1)
        to = { col: cols[colIndex + 1].id, index: Math.min(at.index, cols[colIndex + 1].tasks.length) };

      if (to) {
        e.preventDefault();
        move(task.id, to);
        setAnnouncement(
          `${task.title} moved to ${colName(cols, to.col)}, position ${to.index + 1}.`,
        );
      }
    };

    /* ------------------------------------------------------------ render */

    const dragged = drag ? locate(cols, drag.taskId) : null;

    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          // a board is dragged, not read: stop drags painting text selection
          "w-full select-none text-neutral-950 antialiased dark:text-neutral-50",
          className,
        )}
        {...props}
      >
        <div
          ref={trackRef}
          role="group"
          aria-label={label}
          onScroll={syncEdges}
          style={
            mask
              ? ({ maskImage: mask, WebkitMaskImage: mask } as React.CSSProperties)
              : undefined
          }
          className={cn(
            "flex items-start gap-3 overflow-x-auto pb-1",
            // the native bar is hidden; ScrollRail below draws our own
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          <LayoutGroup>
            {cols.map((col) => {
              const isTarget = slot?.col === col.id && !!drag;
              return (
                <div
                  key={col.id}
                  data-kanban-column={col.id}
                  ref={(el) => {
                    if (el) colRefs.current.set(col.id, el);
                    else colRefs.current.delete(col.id);
                  }}
                  className={cn(
                    "group/col w-[286px] shrink-0 rounded-[16px] p-3 transition-colors duration-200",
                    "bg-neutral-100/70 dark:bg-white/[0.04]",
                    isTarget && "bg-neutral-200/60 dark:bg-white/[0.08]",
                    SQUIRCLE,
                  )}
                >
                  <ColumnHeader
                    col={col}
                    menu={renderColumnMenu?.(col)}
                    /* while a card is in the air the counts show where it
                       would land, not where it came from */
                    count={
                      col.tasks.length -
                      (drag && drag.fromCol === col.id ? 1 : 0) +
                      (drag && slot?.col === col.id ? 1 : 0)
                    }
                  />

                  <div
                    ref={(el) => {
                      if (el) listRefs.current.set(col.id, el);
                      else listRefs.current.delete(col.id);
                    }}
                    className="mt-3 flex flex-col gap-2"
                  >
                    {/*
                      The card in the air is taken out of the list, so the
                      placeholder has to be placed against the list without
                      it. Measuring in one index space and rendering in the
                      other is what makes same-column reordering quietly do
                      nothing.
                    */}
                    {col.tasks
                      .filter((t) => t.id !== drag?.taskId)
                      .map((task, i) => {
                      return (
                        <React.Fragment key={task.id}>
                          {isTarget && slot!.index === i && (
                            <Placeholder height={drag!.height} />
                          )}
                          {(
                            <Card
                              task={task}
                              grabbed={grabbed === task.id}
                              reduceMotion={!!reduceMotion}
                              elRef={(el) => {
                                if (el) cardRefs.current.set(task.id, el);
                                else cardRefs.current.delete(task.id);
                              }}
                              onPointerDown={(e) => startDrag(e, task, col.id, i)}
                              onKeyDown={(e) => onCardKeyDown(e, task)}
                              menu={renderCardMenu?.(task, col.id)}
                              onOpen={
                                onTaskOpen
                                  ? () => {
                                      if (!moved.current) onTaskOpen(task, col.id);
                                    }
                                  : undefined
                              }
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                    {isTarget &&
                      slot!.index >=
                        col.tasks.filter((t) => t.id !== drag?.taskId).length && (
                        <Placeholder height={drag!.height} />
                      )}
                  </div>

                  {/* Added: upstream's button had no handler. Hidden when the
                      caller has nothing for it to do. */}
                  {onAddTask && (
                    <button
                      type="button"
                      onClick={() => onAddTask(col.id)}
                      className={cn(
                        "mt-2 flex w-full items-center gap-1.5 rounded-[10px] px-2 py-2 text-[12.5px] font-medium",
                        "text-neutral-500 transition-colors hover:bg-black/[0.04] hover:text-neutral-800",
                        "dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-100",
                        SQUIRCLE,
                      )}
                    >
                      <Plus aria-hidden className="h-3.5 w-3.5" />
                      Add task
                    </button>
                  )}
                </div>
              );
            })}
          </LayoutGroup>
        </div>

        <ScrollRail trackRef={trackRef} />

        {/* the card riding the cursor */}
        <AnimatePresence>
          {drag && dragged && (
            <motion.div
              style={{ x, y, width: drag.width }}
              initial={{ scale: 1, rotate: 0 }}
              animate={{ scale: reduceMotion ? 1 : 1.03, rotate: reduceMotion ? 0 : 1.6 }}
              exit={{ scale: 1, rotate: 0, opacity: 0 }}
              transition={LIFT_SPRING}
              className="pointer-events-none fixed left-0 top-0 z-50 origin-top-left"
            >
              <CardShell task={dragged.task} floating />
            </motion.div>
          )}
        </AnimatePresence>

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>
    );
  },
);

function colName(cols: KanbanColumn[], id: string) {
  return cols.find((c) => c.id === id)?.name ?? id;
}

/* ------------------------------------------------------------------ parts */

/**
 * Our own horizontal scrollbar.
 *
 * The native one is no help here: on macOS, and in most headless browsers,
 * it is an overlay that stays hidden until you are already scrolling, which
 * is the one moment you no longer need to be told the board scrolls. This
 * one is always visible while there is somewhere to go, and you can drag it.
 */
function ScrollRail({ trackRef }: { trackRef: React.RefObject<HTMLDivElement | null> }) {
  const railRef = React.useRef<HTMLDivElement>(null);
  const [geom, setGeom] = React.useState({ ratio: 1, offset: 0 });
  const [held, setHeld] = React.useState(false);

  const sync = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const ratio = el.clientWidth / el.scrollWidth;
    const max = el.scrollWidth - el.clientWidth;
    setGeom({ ratio, offset: max > 0 ? el.scrollLeft / max : 0 });
  }, [trackRef]);

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync, trackRef]);

  const scrollTo = React.useCallback(
    (clientX: number) => {
      const rail = railRef.current;
      const el = trackRef.current;
      if (!rail || !el) return;
      const r = rail.getBoundingClientRect();
      const thumbW = r.width * geom.ratio;
      const p = (clientX - r.left - thumbW / 2) / (r.width - thumbW);
      el.scrollLeft = Math.max(0, Math.min(1, p)) * (el.scrollWidth - el.clientWidth);
    },
    [geom.ratio, trackRef],
  );

  React.useEffect(() => {
    if (!held) return;
    const onMove = (e: PointerEvent) => scrollTo(e.clientX);
    const onUp = () => setHeld(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [held, scrollTo]);

  if (geom.ratio >= 0.999) return null;

  return (
    <div
      ref={railRef}
      onPointerDown={(e) => {
        setHeld(true);
        scrollTo(e.clientX);
      }}
      className="mt-3 h-[6px] w-full cursor-pointer rounded-full bg-black/[0.05] dark:bg-white/[0.07]"
    >
      <div
        style={{
          width: `${geom.ratio * 100}%`,
          marginLeft: `${geom.offset * (100 - geom.ratio * 100)}%`,
        }}
        className={cn(
          "h-full rounded-full transition-colors",
          held
            ? "bg-black/40 dark:bg-white/50"
            : "bg-black/20 hover:bg-black/30 dark:bg-white/25 dark:hover:bg-white/40",
        )}
      />
    </div>
  );
}

function ColumnHeader({
  col,
  count,
  menu,
}: {
  col: KanbanColumn;
  count: number;
  /** Supplied by renderColumnMenu. Upstream's dots were inert. */
  menu?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span
        style={col.accentHex ? { backgroundColor: col.accentHex } : undefined}
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          !col.accentHex && ACCENT_DOT[col.accent ?? "slate"],
        )}
      />
      <h3 className="m-0 truncate text-[13px] font-medium tracking-[-0.005em]">{col.name}</h3>
      <motion.span
        key={count}
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={FLOW_SPRING}
        className={cn(
          "grid h-[18px] min-w-[18px] place-items-center rounded-[6px] px-1 text-[11px] font-medium tabular-nums",
          "bg-black/[0.06] text-neutral-500 dark:bg-white/[0.09] dark:text-neutral-400",
          SQUIRCLE,
        )}
      >
        {count}
      </motion.span>
      {/* only one way to add a task, and it lives at the foot of the column */}
      <span className="ml-auto flex items-center">
        {menu ?? (
          <IconButton label={`More options for ${col.name}`}>
            <MoreHorizontal aria-hidden className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </span>
    </div>
  );
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        // always there, quiet until you reach for it
        "grid h-6 w-6 place-items-center rounded-[7px] transition-colors duration-150",
        "text-neutral-400 hover:bg-black/[0.06] hover:text-neutral-800 active:bg-black/[0.1]",
        "dark:text-neutral-500 dark:hover:bg-white/[0.1] dark:hover:text-neutral-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/25 dark:focus-visible:ring-white/30",
        SQUIRCLE,
      )}
    >
      {children}
    </button>
  );
}

function Placeholder({ height }: { height: number }) {
  return (
    <motion.div
      layout
      data-kanban-placeholder
      initial={{ opacity: 0, scaleY: 0.7 }}
      animate={{ opacity: 1, scaleY: 1 }}
      exit={{ opacity: 0, scaleY: 0.7 }}
      transition={FLOW_SPRING}
      style={{ height }}
      className={cn(
        "origin-top rounded-[12px] border border-dashed",
        "border-neutral-300 bg-black/[0.02] dark:border-white/15 dark:bg-white/[0.03]",
        SQUIRCLE,
      )}
    />
  );
}

function Card({
  task,
  grabbed,
  reduceMotion,
  elRef,
  onPointerDown,
  onKeyDown,
  menu,
  onOpen,
}: {
  task: KanbanTask;
  grabbed: boolean;
  reduceMotion: boolean;
  elRef: (el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Added: per-card actions, from renderCardMenu. */
  menu?: React.ReactNode;
  /** Added: fires on a click that was not the end of a drag. */
  onOpen?: () => void;
}) {
  return (
    <motion.div
      ref={elRef}
      layout
      data-kanban-card={task.id}
      tabIndex={0}
      role="button"
      aria-roledescription="Draggable card"
      aria-grabbed={grabbed}
      aria-label={`${task.title}. Press space to pick up.`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onClick={onOpen}
      transition={reduceMotion ? { duration: 0 } : FLOW_SPRING}
      whileHover={reduceMotion ? undefined : { y: -1 }}
      className={cn(
        "group/card cursor-grab touch-none active:cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/25 dark:focus-visible:ring-white/30",
        grabbed && "ring-2 ring-neutral-900/40 dark:ring-white/50",
        "rounded-[12px]",
        SQUIRCLE,
      )}
    >
      <CardShell task={task} menu={menu} />
    </motion.div>
  );
}

function CardShell({
  task,
  floating,
  menu,
}: {
  task: KanbanTask;
  floating?: boolean;
  menu?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border p-3",
        "border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-neutral-900",
        floating
          ? "shadow-[0_16px_32px_-12px_rgb(0_0_0/0.28)]"
          : "shadow-[0_1px_2px_rgb(0_0_0/0.05)]",
        SQUIRCLE,
      )}
    >
      {/* Added: the menu shares the chip row, so a card with no chips still
          has somewhere to put it. data-kanban-no-drag keeps a click on the
          trigger from starting a drag. */}
      {menu && (
        <span
          data-kanban-no-drag
          className="float-right -mr-1 -mt-1 ml-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100"
        >
          {menu}
        </span>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {task.priority && (
          <span className={cn(CHIP, "font-medium", PRIORITY_STYLES[task.priority], SQUIRCLE)}>
            <Flag aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.25} />
            <span>{PRIORITY_LABELS[task.priority]}</span>
          </span>
        )}
        {task.category && (
          <span
            className={cn(
              CHIP,
              "font-normal",
              "bg-neutral-100 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300",
              SQUIRCLE,
            )}
          >
            <TaskIcon icon={task.icon} />
            <span>{task.category}</span>
          </span>
        )}
      </div>

      <p
        className={cn(
          "m-0 mt-2.5 text-[14px] font-medium leading-snug tracking-[-0.005em]",
          task.done && "text-neutral-400 line-through dark:text-neutral-500",
        )}
      >
        {task.title}
      </p>

      {task.note && (
        <p className="m-0 mt-1 line-clamp-2 text-[12px] font-normal leading-snug text-neutral-500 dark:text-neutral-400">
          {task.note}
        </p>
      )}

      {/* Added: tags beyond the one shown as the category chip. */}
      {task.tags && task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {task.tags.map((t) => (
            <span
              key={t.label}
              style={{ backgroundColor: `${t.color}26`, color: t.color }}
              className={cn("rounded-full px-1.5 py-px text-[10px] font-medium", SQUIRCLE)}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      {(task.assignees?.length ||
        task.due ||
        task.progress != null ||
        task.footnotes?.length) && (
        <>
          <div className="mt-3 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              {task.due && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11.5px] font-normal tabular-nums",
                    task.dueSoon
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-neutral-500 dark:text-neutral-400",
                  )}
                >
                  <CalendarDays aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                  {task.due}
                </span>
              )}
              {task.progress != null && <ProgressRing value={task.progress} />}
              {/* Added: estimate / subtasks / checklist / dependencies. */}
              {task.footnotes?.map((f) => (
                <span
                  key={f.label}
                  title={f.title}
                  className="inline-flex items-center text-[11.5px] font-normal tabular-nums text-neutral-500 dark:text-neutral-400"
                >
                  {f.label}
                </span>
              ))}
            </div>
            <AvatarStack people={task.assignees ?? []} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A callout that points at whatever it is wrapped around, on hover or focus.
 * The tail is a rotated square sitting half outside the bubble, so it reads
 * as one shape rather than a label floating nearby.
 */
function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const skin = "bg-neutral-900 dark:bg-neutral-100";
  return (
    <span className="group/tip relative flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2",
          "translate-y-1 opacity-0 transition-[opacity,transform] duration-150 ease-out",
          "group-hover/tip:translate-y-0 group-hover/tip:opacity-100",
          "group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100",
        )}
      >
        <span
          className={cn(
            "block whitespace-nowrap rounded-[7px] px-2 py-1 text-[11px] font-medium leading-none",
            "text-white dark:text-neutral-900",
            skin,
            "shadow-[0_6px_16px_-4px_rgb(0_0_0/0.3)]",
            SQUIRCLE,
          )}
        >
          {label}
        </span>
        <span
          aria-hidden
          className={cn(
            "absolute left-1/2 top-full h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1.5px]",
            skin,
          )}
        />
      </span>
    </span>
  );
}

function AvatarStack({ people }: { people: KanbanAssignee[] }) {
  const shown = people.slice(0, 3);
  const rest = people.slice(3);
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <span key={p.name + i} className={cn(i > 0 && "-ml-1.5")}>
          <Tooltip label={p.name}>
            <span
              tabIndex={0}
              aria-label={p.name}
              className={cn(
                "grid h-[22px] w-[22px] place-items-center overflow-hidden rounded-full",
                "ring-2 ring-white dark:ring-neutral-900",
                "focus-visible:outline-none focus-visible:ring-neutral-900 dark:focus-visible:ring-white",
              )}
            >
              {p.avatar ? (
                <img src={p.avatar} alt="" draggable={false} className="h-full w-full object-cover" />
              ) : (
                <Initials name={p.name} />
              )}
            </span>
          </Tooltip>
        </span>
      ))}
      {rest.length > 0 && (
        <span className="-ml-1.5">
          <Tooltip label={rest.map((p) => p.name).join(", ")}>
            <span
              tabIndex={0}
              className={cn(
                "grid h-[22px] w-[22px] place-items-center rounded-full text-[10px] font-medium",
                "bg-neutral-200 text-neutral-600 ring-2 ring-white",
                "dark:bg-white/15 dark:text-neutral-200 dark:ring-neutral-900",
                "focus-visible:outline-none focus-visible:ring-neutral-900 dark:focus-visible:ring-white",
              )}
            >
              +{rest.length}
            </span>
          </Tooltip>
        </span>
      )}
    </div>
  );
}

const INITIAL_TINTS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
];

function Initials({ name }: { name: string }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "grid h-full w-full place-items-center text-[9.5px] font-medium text-white",
        INITIAL_TINTS[h % INITIAL_TINTS.length],
      )}
    >
      {initials}
    </span>
  );
}

function ProgressRing({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 6;
  const c = 2 * Math.PI * r;
  const done = v >= 100;
  return (
    <span className="inline-flex items-center gap-1">
      <svg viewBox="0 0 16 16" aria-hidden className="h-[14px] w-[14px] -rotate-90">
        <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" className="stroke-black/[0.09] dark:stroke-white/15" />
        <motion.circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - (c * v) / 100 }}
          transition={FLOW_SPRING}
          className={done ? "stroke-emerald-500" : "stroke-neutral-900 dark:stroke-neutral-100"}
        />
      </svg>
      <span className="text-[11.5px] font-normal tabular-nums text-neutral-500 dark:text-neutral-400">
        {v}%
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ icons */

export type IconKey = "web" | "dashboard" | "mobile" | "brand" | "infra" | "docs";

/** Category icons, from lucide, each with the tint it wears in the chip. */
const CATEGORY_ICONS: Record<IconKey, { Icon: LucideIcon; tint: string }> = {
  web: { Icon: Monitor, tint: "text-blue-500" },
  dashboard: { Icon: LayoutDashboard, tint: "text-emerald-500" },
  mobile: { Icon: Smartphone, tint: "text-violet-500" },
  brand: { Icon: Palette, tint: "text-rose-500" },
  infra: { Icon: Server, tint: "text-amber-500" },
  docs: { Icon: FileText, tint: "text-teal-500" },
};

function TaskIcon({ icon }: { icon?: IconKey | React.ReactNode }) {
  if (icon && typeof icon !== "string") return <>{icon}</>;
  const { Icon, tint } = CATEGORY_ICONS[(icon as IconKey) ?? "web"] ?? CATEGORY_ICONS.web;
  // lucide strokes are sized for 24px; nudge them up so they hold at 12px
  return <Icon aria-hidden className={cn("h-3 w-3 shrink-0", tint)} strokeWidth={2.25} />;
}

export default KanbanBoard;

export { KanbanBoard as Component };
