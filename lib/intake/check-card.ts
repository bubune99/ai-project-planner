/**
 * Bugs found during checks go straight to Up next (owner, 2026-11-16: "I think that bugs found actually during checks
 * should be directly placed in up next"). A check recorded as failed, or a walk finding of kind "error", becomes one
 * card in its project's Up next, found again by the marker line in its description so it is never made twice. A check
 * that later passes closes its card. Errors are agents' to fix; they are never put to the owner. Pure; checked in
 * check-card.assert.ts. The SQL is in check-card-store.ts.
 */
export const checkMarker = (checklistId: string, key: string) => `check: ${checklistId}#${key}`
/** The same line walk findings already use (lib/walks/store.ts findingMarker), so a finding never gets two cards. */
export const walkMarker = (key: string) => `walk-finding: ${key}`

export interface CardDraft { title: string; description: string; tags: string[]; marker: string; metadata: Record<string, unknown> }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function failedCheckCard(a: { checklistId: string; route: string; key: string; note: string; actor: string; build?: string | null }): CardDraft {
  const marker = checkMarker(a.checklistId, a.key)
  return {
    title: clip(`Fix: ${a.note.trim().split(/\n/)[0] || a.key}`, 180),
    description: [
      `**A check failed** on ${a.route}${a.build ? ` (build ${a.build.slice(0, 7)})` : ""}, recorded by the ${a.actor}. Errors are agents' to fix.`,
      "",
      `- The check: ${a.key}`,
      `- What was seen: ${a.note.trim()}`,
      "",
      "Fix it, prove it on staging, and record the check again: a pass closes this card.",
      "",
      marker,
    ].join("\n"),
    tags: ["check", "fix"],
    marker,
    metadata: { source: "check", checklistId: a.checklistId, key: a.key },
  }
}

export function walkErrorCard(a: { key: string; what: string; goal: string; suggest?: string | null; route?: string | null }): CardDraft {
  const marker = walkMarker(a.key)
  return {
    title: clip(`Fix: ${a.what}`, 180),
    description: [
      `**A walk found this broken.** Goal: "${a.goal}"${a.route ? ` (from ${a.route})` : ""}. Errors are agents' to fix.`,
      "",
      `- What was found: ${a.what}`,
      ...(a.suggest ? [`- What would help: ${a.suggest}`] : []),
      "",
      marker,
    ].join("\n"),
    tags: ["from-walk", "fix"],
    marker,
    metadata: { source: "walk-finding", key: a.key },
  }
}
