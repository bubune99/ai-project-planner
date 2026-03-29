import type { CalendarAgendaItem } from "@/lib/types"

// ---------- date helpers (pure, no mutation) ----------

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

export function formatDateRange(start: string, end: string): string {
  return `${new Date(start).toISOString().split("T")[0]} to ${new Date(end).toISOString().split("T")[0]}`
}

/** Build the 6-week grid that covers a full month view */
export function getMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1)
  const startDay = firstDay.getDay() // 0=Sun
  const gridStart = addDays(firstDay, -startDay)

  const weeks: Date[][] = []
  let cursor = gridStart
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor))
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
  }
  return weeks
}

/** Return start-of-week (Sunday) for a given date */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return startOfDay(d)
}

/** Map agenda items to a date-keyed lookup */
export function groupByDate(items: CalendarAgendaItem[]): Record<string, CalendarAgendaItem[]> {
  const map: Record<string, CalendarAgendaItem[]> = {}
  for (const item of items) {
    const key = new Date(item.startTime).toISOString().split("T")[0]
    if (!map[key]) {
      map[key] = []
    }
    map[key] = [...map[key], item]
  }
  return map
}

/** Hours array for day/week views */
export const HOURS = Array.from({ length: 24 }, (_, i) => i)

/** Colour fallback per item type */
export function getItemColor(item: CalendarAgendaItem): string {
  if (item.color) return item.color
  switch (item.type) {
    case "event":
      return "#3b82f6"
    case "todo":
      return "#f97316"
    case "milestone":
      return "#8b5cf6"
    case "bill":
      return "#ef4444"
    default:
      return "#6b7280"
  }
}

export function getItemLabel(type: CalendarAgendaItem["type"]): string {
  switch (type) {
    case "event":
      return "Event"
    case "todo":
      return "Todo"
    case "milestone":
      return "Milestone"
    case "bill":
      return "Bill"
    default:
      return "Item"
  }
}
