/**
 * A feature an agent proposes for the owner to approve.
 *
 * Owner, 2026-11-16: "do we have a loop or workflow that really engages the agent to generate their own logic for
 * features to be included? At this point, I really want to focus on the user flow or the users goals, and then the agent
 * comes up with the details in between. Or at the very least proposes features to me clearly and i can approve them."
 *
 * The owner gives the goal (a use case, a person's goal). The agent works out what is missing between the steps, by
 * walking it or reading the code, and files each feature as a card in Requests saying the goal it serves, what it does,
 * what is delivered and how it will be proved. The owner approves (moves it to Up next, which sends it to an agent) or
 * says not now, with why. Pure; checked in proposal.assert.ts.
 */
export type FoundBy = "walk" | "reading" | "discussion" | "scan"
export interface Proposal { title: string; goal: string; useCase?: string; what: string; deliverable: string; proof: string; why: string; foundBy: FoundBy }

const LIMIT = 1200
export function readProposal(raw: Record<string, unknown>): { proposal: Proposal | null; errors: string[] } {
  const errors: string[] = []
  const text = (k: keyof Proposal, required: boolean, max = LIMIT) => {
    const v = typeof raw[k] === "string" ? (raw[k] as string).replace(/\s+/g, " ").trim() : ""
    if (required && !v) errors.push(`${k} is required`)
    if (v.length > max) errors.push(`${k} is longer than ${max} characters`)
    return v.slice(0, max)
  }
  const p = {
    title: text("title", true, 160), goal: text("goal", true), what: text("what", true), deliverable: text("deliverable", true),
    proof: text("proof", true), why: text("why", true), useCase: text("useCase", false, 120),
    foundBy: (["walk", "reading", "discussion", "scan"].includes(String(raw.foundBy)) ? raw.foundBy : "reading") as FoundBy,
  }
  // A proof must be something seen or run, not an intention.
  if (p.proof && /^(it works|tested|verified|done)\.?$/i.test(p.proof)) errors.push("proof must say what will be seen or run, and where")
  if (p.title && /^(improve|enhance|better|fix stuff|update)\b/i.test(p.title) && p.title.split(" ").length < 4) errors.push("title must say what the feature does, not that something gets better")
  return errors.length ? { proposal: null, errors } : { proposal: { ...p, ...(p.useCase ? {} : { useCase: undefined }) }, errors }
}

const FOUND: Record<FoundBy, string> = { walk: "found by walking the goal", reading: "found by reading the code", discussion: "from a discussion", scan: "found by a scan" }
/** The card's description: what the owner reads to approve it. */
export function proposalText(p: Proposal): string {
  return [
    `Goal it serves: ${p.goal}${p.useCase ? ` (use case: ${p.useCase})` : ""}`,
    `What it does: ${p.what}`,
    `Delivered: ${p.deliverable}`,
    `Proved by: ${p.proof}`,
    `Why: ${p.why} (${FOUND[p.foundBy]})`,
  ].join("\n")
}
