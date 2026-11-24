/**
 * What a project's People and flows still lacks, and who fills each gap.
 *
 * Owner, 2026-11-24, after finding two projects' People and flows half filled with nothing in his inbox: "we should
 * also be creating the people and flows as options so that we create goals based on feature requests or options/
 * criteria. Then when we make file chnages or feature changes, we should be able to flag that something has changed and
 * actually go back and update and verify". Until then only "walked or not" was checked, so a list with blank fields,
 * steps pointing at nothing and pages nobody reaches counted as done.
 *
 * A gap is the agent's to fill unless only the owner can settle it (reviewing what agents proposed). An agent may not
 * finish a session in a project while one of its gaps is open; an owner gap must have a question in his inbox.
 *
 * Pure: no database, no clock. Checked in gaps.assert.ts.
 */
import { everyStep, isReviewed, type FlowDoc, type Person, type UseCase } from "./people-model"
import { routeCovers, type Ship } from "@/lib/gates/fresh-model"

export type GapKind =
  | "no-people" | "person-field" | "person-no-use-case" | "person-no-habit"
  | "use-case-short" | "step-blank" | "step-no-control"
  | "page-unreached" | "request-no-use-case"
  | "never-walked" | "changed-since-walk" | "stopped-short"
  | "not-reviewed"

export interface Gap {
  kind: GapKind
  /** The thing it is about: a person's or use case's name, a route, a card title. */
  where: string
  /** One plain sentence: what is missing. */
  what: string
  who: "agent" | "owner"
  personId?: string; flowId?: string; route?: string; cardId?: string
}

export interface GapInput {
  doc: FlowDoc
  /** The routes of the project's scanned pages. */
  pages: string[]
  /** Walks, newest or oldest first: only the latest per use case counts. */
  walks: { useCase?: string; at: string; outcome: string }[]
  ships: Ship[]
  /** Open feature requests (proposals) and the use case each names, if any. */
  requests: { id: string; title: string; useCase?: string | null }[]
}

const PERSON_FIELDS: [keyof Person, string][] = [
  ["background", "who they are"], ["wants", "what they want"], ["context", "when and where they use it"],
  ["frustrations", "what gets in their way"], ["may", "what they may do"], ["mayNot", "what they may not do"],
]
/** Fewer steps than this is not a goal walked through, only its start and end. */
export const MIN_STEPS = 3
const blank = (v: unknown) => typeof v !== "string" || !v.trim()
const norm = (s: string) => s.trim().toLowerCase()

/** The routes a use case's steps are on (its main line and every other way). */
export function flowRoutes(flow: Pick<UseCase, "steps">): string[] {
  return [...new Set(everyStep(flow).map((s) => s.ref?.route).filter((r): r is string => !!r))]
}

/** Ships since the use case was last walked that touched a page it goes through. */
export function changesSinceWalk(flow: Pick<UseCase, "steps">, walkedAt: string, ships: Ship[]): Ship[] {
  const routes = flowRoutes(flow), t = new Date(walkedAt).getTime()
  return ships.filter((s) => new Date(s.at).getTime() > t && s.env !== "report" && (s.everywhere || s.routes.some((r) => routes.some((fr) => routeCovers(r, fr)))))
}

function personGaps(doc: FlowDoc): Gap[] {
  const out: Gap[] = []
  for (const p of doc.people) {
    const missing = PERSON_FIELDS.filter(([k]) => blank(p[k])).map(([, word]) => word)
    if (missing.length) out.push({ kind: "person-field", where: p.name, personId: p.id, who: "agent", what: `${p.name}: ${missing.join(", ")} not written.` })
    if (!doc.flows.some((f) => f.who === p.id)) out.push({ kind: "person-no-use-case", where: p.name, personId: p.id, who: "agent", what: `${p.name} has no use case: nothing says what they come to do.` })
    if (!doc.personas.some((x) => x.who === p.id)) out.push({ kind: "person-no-habit", where: p.name, personId: p.id, who: "agent", what: `${p.name} has no persona: no habit or where they start and stop.` })
  }
  return out
}

function flowGaps(flow: UseCase, input: GapInput): Gap[] {
  const out: Gap[] = [], at = { where: flow.name, flowId: flow.id }
  if (flow.steps.length < MIN_STEPS) out.push({ ...at, kind: "use-case-short", who: "agent", what: `${flow.name}: ${flow.steps.length} ${flow.steps.length === 1 ? "step" : "steps"}; a goal walked through has at least ${MIN_STEPS}.` })
  const steps = everyStep(flow)
  const blankSteps = steps.filter((s) => blank(s.does) || blank(s.expects)).length
  if (blankSteps) out.push({ ...at, kind: "step-blank", who: "agent", what: `${flow.name}: ${blankSteps} ${blankSteps === 1 ? "step does not say" : "steps do not say"} what the person does and expects.` })
  const unlinked = steps.filter((s) => !s.ref).length
  if (unlinked) out.push({ ...at, kind: "step-no-control", who: "agent", what: `${flow.name}: ${unlinked} of ${steps.length} steps point at no control, so whether they work cannot be read from the checks.` })
  const last = input.walks.filter((w) => w.useCase === flow.id).sort((a, b) => b.at.localeCompare(a.at))[0]
  if (!last) out.push({ ...at, kind: "never-walked", who: "agent", what: `${flow.name} has never been walked.` })
  else {
    // A commit shipped to staging and production is one change.
    const shas = [...new Set(changesSinceWalk(flow, last.at, input.ships).map((s) => s.sha.slice(0, 7)))]
    if (shas.length) out.push({ ...at, kind: "changed-since-walk", who: "agent", what: `${flow.name}: ${shas.length} ${shas.length === 1 ? "change has" : "changes have"} shipped to its pages since it was last walked (${shas.slice(0, 3).join(", ")}${shas.length > 3 ? ` and ${shas.length - 3} more` : ""}); walk it again and update its steps.` })
    else if (last.outcome !== "reached") out.push({ ...at, kind: "stopped-short", who: "agent", what: `${flow.name}: its last walk stopped short and nothing has fixed it since.` })
  }
  if (!isReviewed(flow)) out.push({ ...at, kind: "not-reviewed", who: "owner", what: `${flow.name} was proposed by ${flow.proposedBy ?? "an agent"} and waits for the owner's review.` })
  return out
}

/** Scanned pages that no use case goes through and no area describes. */
export function unreachedPages(doc: FlowDoc, pages: string[]): string[] {
  const reached = [...doc.flows.flatMap(flowRoutes), ...doc.areas.map((a) => a.route)]
  return [...new Set(pages)].filter((p) => !reached.some((r) => routeCovers(r, p) || routeCovers(p, r))).sort()
}

export function peopleGaps(input: GapInput): Gap[] {
  const { doc } = input
  if (!doc.people.length) return [{ kind: "no-people", where: "People and flows", who: "agent", what: "No people are written: nothing says who the product is for." }]
  const names = new Set(doc.flows.map((f) => norm(f.name)))
  return [
    ...personGaps(doc),
    ...doc.flows.flatMap((f) => flowGaps(f, input)),
    ...unreachedPages(doc, input.pages).map((route): Gap => ({ kind: "page-unreached", where: route, route, who: "agent", what: `${route}: no use case goes through it and no area says what it is for.` })),
    ...input.requests.filter((r) => !r.useCase || !names.has(norm(r.useCase))).map((r): Gap => ({ kind: "request-no-use-case", where: r.title, cardId: r.id, who: "agent", what: `The request "${r.title}" names no use case in People and flows: propose the person and goal it serves.` })),
  ]
}

/** Counts for a one-line summary. */
export function gapSummary(gaps: Gap[]): { agent: number; owner: number; line: string } {
  const agent = gaps.filter((g) => g.who === "agent").length, owner = gaps.length - agent
  const line = !gaps.length ? "Nothing is missing." : [agent ? `${agent} for agents to fill` : "", owner ? `${owner} waiting on the owner's review` : ""].filter(Boolean).join(", ") + "."
  return { agent, owner, line }
}
