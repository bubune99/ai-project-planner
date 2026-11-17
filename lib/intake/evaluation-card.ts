/**
 * Every report asks why our checks missed it (owner, 2026-11-16: "when a feature or bug report is made, that becomes a
 * point of evaluation for do we need better questions or better rulings for our verifications? Because it seems as
 * though it passed our checks system."). A report's card gets one evaluation card under it: which check should have
 * caught this, and the new question, rule or check that will. Pure; checked in evaluation-card.assert.ts.
 */
export interface EvaluationIn { reportId: string; kind: "wrong" | "wish"; title: string; route?: string | null; comment: string }
export interface EvaluationOut { title: string; description: string; tags: string[]; marker: string }

export const evaluationMarker = (reportId: string) => `evaluation-of-report: ${reportId}`

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function evaluationCard(r: EvaluationIn): EvaluationOut {
  const marker = evaluationMarker(r.reportId)
  const where = r.route ? ` on ${r.route}` : ""
  const said = clip(r.comment.trim().replace(/\s+/g, " "), 300)
  const wrong = r.kind === "wrong"
  return {
    title: clip(`Why did the checks miss it: ${r.title}`, 180),
    description: [
      wrong
        ? `**A report found something broken${where} that our checks passed.** The owner's words: "${said}"`
        : `**A report asked for something${where} that the plan did not have.** The owner's words: "${said}"`,
      "",
      "Answer each, then close this card:",
      wrong
        ? "1. Which check should have caught it: a scan claim, a workflow step, a statement, a code rule? Name it, or say none exists."
        : "1. Which question in the plan (intent, People and flows, a walk's goal) should have found it? Name it, or say none exists.",
      wrong
        ? "2. The new question, rule or check that will catch this kind of thing next time, and where it now lives (plugin scan, a statement, a rule file)."
        : "2. The new question the plan or a walk will ask, and where it now lives.",
      `3. Rescan${where || " the page"} with it, and record what it found.`,
      "",
      marker,
    ].join("\n"),
    tags: ["evaluation", "check"],
    marker,
  }
}
