/*
  Intake: every report from the feedback form becomes a card on the product's project.

  Owner, 2026-11-16: "Our intake needs to be very tight all around ... the feedback detail that I mentioned to you being
  updated should go in up next and how that should directly feed the upnext task so that it gets created for you. well I
  either said feature request or up next." Something wrong goes to that project's Up next (errors are agents' to fix);
  something wished for goes to Requests for his approval. The report is about the app it was sent from, so the card
  belongs to that app's project (the planner's own pages report on the planner, whichever project page was open).
*/

export type ReportKind = "wrong" | "wish"

export type ReportIn = {
  id: string
  source?: string | null
  kind?: string | null
  title?: string | null
  comment: string
  url?: string | null
  route?: string | null
  selector?: string | null
  picked?: string | null
  screenshot?: string | null
}

export type CardOut = {
  projectId: string
  status: "pending" | "requested"
  priority: "high" | "medium"
  title: string
  description: string
  tags: string[]
}

/** Which planner project each app's reports belong to. */
export const SOURCE_PROJECTS: Record<string, string> = {
  "ai-project-planner": "53a685c5-cee3-4a28-8552-dc19b4117188",
}

export function reportKind(k: unknown): ReportKind {
  return k === "wish" ? "wish" : "wrong"
}

/** A title from his own words: the given title, else the first sentence, cut at a word under 90 characters. */
export function reportTitle(title: string | null | undefined, comment: string): string {
  const own = String(title || "").replace(/\s+/g, " ").trim()
  if (own) return own.slice(0, 120)
  const said = String(comment || "").replace(/\s+/g, " ").trim()
  const first = said.split(/(?<=[.!?])\s/)[0] || said
  if (first.length <= 90) return first
  const cut = first.slice(0, 90)
  const at = cut.lastIndexOf(" ")
  return (at > 40 ? cut.slice(0, at) : cut) + "…"
}

/** The card for a report, or null when the app is not one the planner tracks (the report stays in the list). */
export function reportCard(r: ReportIn, projects: Record<string, string> = SOURCE_PROJECTS): CardOut | null {
  const projectId = projects[String(r.source || "")]
  if (!projectId) return null
  const said = String(r.comment || "").trim()
  if (!said) return null
  const kind = reportKind(r.kind)
  const lines = [
    `The owner reported${kind === "wish" ? " a wish" : " something wrong"}:`,
    "",
    "> " + said.replace(/\n/g, "\n> "),
    "",
    r.route ? `Page: ${r.route}${r.url ? ` (${r.url})` : ""}` : r.url ? `Page: ${r.url}` : "",
    r.picked ? `He pointed at: ${r.picked}` : "",
    r.screenshot && /^https?:\/\//.test(r.screenshot) ? `Picture: ${r.screenshot}` : r.screenshot ? "Picture: kept with the report" : "",
    r.selector ? `Element: ${r.selector}` : "",
    "",
    kind === "wish"
      ? "In Requests for his approval. Approve sends it to an agent."
      : "In Up next: an agent finds the cause, fixes it, proves it on the page, and the report is marked fixed when this card completes.",
    `Report ${r.id}.`,
  ]
  return {
    projectId,
    status: kind === "wish" ? "requested" : "pending",
    priority: kind === "wish" ? "medium" : "high",
    title: reportTitle(r.title, said),
    description: lines.filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i > 0)).join("\n").trim(),
    tags: ["report", kind === "wish" ? "request" : "fix"],
  }
}
