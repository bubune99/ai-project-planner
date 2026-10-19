/** The assistant's one-line briefing from the counts. Pure so it can be asserted. */
export interface BriefingCounts { dueToday: number; overdue: number; open: number }

export function briefingLine(c: BriefingCounts | null | undefined): string | null {
  if (!c || ![c.dueToday, c.overdue, c.open].every((n) => Number.isFinite(n))) return null
  const bits = [
    c.dueToday ? `${c.dueToday} due today` : null,
    c.overdue ? `${c.overdue} overdue` : null,
    c.open ? `${c.open} open` : null,
  ].filter((x): x is string => !!x)
  return bits.length ? bits.join(" · ") : "Nothing open. A clear day."
}
