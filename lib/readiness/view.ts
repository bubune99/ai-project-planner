/**
 * Launch readiness: what the Launch tab says and how it arranges things.
 *
 * Words for each state, health in words, the items grouped by gate and then
 * by domain, what still needs doing, which decisions the owner is offered,
 * whether the last decision can be put back, and the body the profile form
 * sends. No React, no DOM, no clock, and only types from model.ts, so the
 * catalog is never bundled into the page: items reach the screen through the
 * route. Checks: lib/readiness/view.assert.ts.
 */

import type { Domain, GateHealth, LaunchType, Readiness, TRAITS, ValidationState, ValidationView } from "./model"

export type Trait = (typeof TRAITS)[number]
export type Tone = "ok" | "warn" | "bad" | ""

/* Keyed by the model's own types, so a launch type or trait added there fails the type-check here until it has words. */
export const LAUNCH_TYPE_WORD: Record<LaunchType, string> = {
  product: "Product",
  extension: "Extension",
  store: "Store",
  "client-site": "Client site",
  "invite-only": "Invite-only",
}
export const TRAIT_WORD: Record<Trait, string> = {
  ai: "AI",
  payments: "Payments",
  email: "Email",
  accounts: "Accounts",
  minors: "Minors",
  mcp: "MCP",
  "browser-extension": "Browser extension",
  "public-site": "Public site",
  uploads: "Uploads",
  subscriptions: "Subscriptions",
  "sensitive-data": "Sensitive data",
  "financial-data": "Financial data",
  ugc: "User-generated content",
  vps: "VPS",
  sms: "SMS",
  "physical-goods": "Physical goods",
}
export const STATE_WORD: Record<ValidationState, string> = {
  unvalidated: "Not started",
  proposed: "Proposed",
  passed: "Passed",
  failed: "Failed",
  waived: "Waived",
  stale: "Due for re-check",
}
/** The dot beside the word. The word always carries the meaning; the dot only repeats it. */
export const STATE_TONE: Record<ValidationState, Tone> = { unvalidated: "", proposed: "warn", passed: "ok", failed: "bad", waived: "", stale: "bad" }
export const DOMAIN_WORD: Record<Domain, string> = { code: "Code", market: "Market", business: "Business", legal: "Legal" }
export const PROOF_WORD: Record<"automated" | "evidence" | "signoff", string> = {
  automated: "Proved by an automated check",
  evidence: "Proved by evidence",
  signoff: "Proved by sign-off",
}
/** The line the export carries (readinessMarkdown in model.ts), word for word; the check file holds the two together. */
export const ADVICE_LINE = "Not legal or tax advice. Legal, business and market items need the owner's or a professional's sign-off; agents can only propose them."
const DOMAIN_ORDER: Domain[] = ["code", "market", "business", "legal"]

/** Still to do: everything that is not passed and not waived (the model's own meaning of done). */
export const needsDoing = (s: ValidationState) => s !== "passed" && s !== "waived"
export const todoCount = (validations: ValidationView[]) => validations.filter((v) => needsDoing(v.state)).length

export type Show = "todo" | "all"
export interface DomainGroup { domain: Domain; total: number; done: number; items: ValidationView[] }
export interface GateGroup { gate: GateHealth; shown: number; domains: DomainGroup[] }

/** Every gate that has items, in order; under each, its items by domain. `todo` leaves out what is done but keeps the gate. */
export function groupItems(validations: ValidationView[], gates: GateHealth[], show: Show): GateGroup[] {
  return gates.filter((g) => g.total > 0).map((gate) => {
    const mine = validations.filter((v) => v.item.gate === gate.gate && (show === "all" || needsDoing(v.state)))
    const domains = DOMAIN_ORDER.map((domain) => ({
      domain,
      total: gate.byDomain[domain]?.total ?? 0,
      done: gate.byDomain[domain]?.passed ?? 0,
      items: mine.filter((v) => v.item.domain === domain),
    })).filter((d) => d.items.length > 0)
    return { gate, shown: mine.length, domains }
  })
}

export function gateLine(g: GateHealth): string {
  const parts = [`${g.passed} of ${g.total} passed or waived`]
  if (g.failed) parts.push(`${g.failed} failed or due for re-check`)
  if (g.open) parts.push(`${g.open} still open`)
  return parts.join(" · ")
}

/** The whole checklist's counts. A count that was not loaded reads "–", never 0. */
export function countsLine(counts: Record<ValidationState, number> | null | undefined): string {
  const order: ValidationState[] = ["passed", "failed", "stale", "proposed", "unvalidated", "waived"]
  return order.map((s) => `${STATE_WORD[s]} ${typeof counts?.[s] === "number" ? counts[s] : "–"}`).join(" · ")
}

const gateName = (gates: GateHealth[], n: number) => `Gate ${n} · ${gates.find((g) => g.gate === n)?.name ?? "–"}`

/** Health as the model computed it, in words. The reasons are the model's rules, not a new judgment. */
export function healthWords(r: Pick<Readiness, "health" | "currentGate" | "phase" | "gates">): { tone: Tone; head: string; gate: string; cleared: string } {
  const head =
    r.health === "red" ? "Blocked: an item at the current gate, or a P0 item at any gate, failed or is due for a re-check"
    : r.health === "amber" ? "In progress: items at the current gate are still open"
    : "Clear: every gate is passed or waived"
  return {
    tone: r.health === "red" ? "bad" : r.health === "amber" ? "warn" : "ok",
    head,
    gate: r.currentGate === null ? "All gates clear" : gateName(r.gates, r.currentGate),
    cleared: r.phase < 0 ? "No gate fully passed yet" : `Last gate fully passed: ${gateName(r.gates, r.phase)}`,
  }
}

export type Decision = "passed" | "failed" | "waived"
/** The decisions offered on an item: all three, less the one it already has. A re-check that is due can be passed again. */
export function ownerActions(state: ValidationState): Decision[] {
  return (["passed", "failed", "waived"] as Decision[]).filter((d) => d !== state)
}

/** A row of project_validation_events as the routes send it. */
export interface HistoryRow { item_id: string; from_state: string | null; to_state: string; reason: string | null; actor: string | null; actor_kind: string; source: string; override: boolean; created_at: string }

const SETTABLE = new Set(["proposed", "passed", "failed", "waived"])
const stateWord = (s: string | null) => (s === null ? STATE_WORD.unvalidated : (STATE_WORD as Record<string, string>)[s] ?? s)

/**
 * Can the last decision be put back? `history` is one item's rows, newest first.
 * The route has no undo of its own: putting back means setting the earlier state
 * again, so it works only for a state the route can set, and only for the owner's
 * own last decision. A waiver goes back only with the reason it was given.
 */
export function undoOf(history: HistoryRow[]): { ok: true; state: Decision | "proposed"; reason: string | null } | { ok: false; why: string } {
  const last = history[0]
  if (!last) return { ok: false, why: "Nothing has been decided on this item yet." }
  if (last.actor_kind !== "user") return { ok: false, why: "The last change was not yours, so there is nothing of yours to put back." }
  const from = last.from_state
  if (from === null || !SETTABLE.has(from)) return { ok: false, why: "Before your decision this item was not started, and a decision cannot be cleared back to not started." }
  const reason = history.slice(1).find((h) => h.to_state === from)?.reason ?? null
  if (from === "waived" && !reason?.trim()) return { ok: false, why: "It was waived before, and the reason for that waiver is not in this history, so it cannot be put back from here." }
  return { ok: true, state: from as Decision | "proposed", reason }
}

/** Who and what, in words. The stored actor is an id; it is never shown. */
export function historyLine(h: HistoryRow): { who: string; change: string; override: boolean } {
  const actor = h.actor ?? ""
  const who =
    h.actor_kind === "user" ? "The owner"
    : actor.startsWith("api-key:") ? "An agent (API key)"
    : actor.startsWith("agent-in-session:") ? "An agent in the owner's tab"
    : actor.startsWith("collaborator:") ? "A collaborator"
    : h.source === "extension" ? "A scanner upload"
    : "An agent"
  return { who, change: `${stateWord(h.from_state)} to ${stateWord(h.to_state)}`, override: h.override === true }
}

export interface ProfileForm { launchType: LaunchType; traits: string[]; regions: string; domain: string; siteUrl: string }
/** What the profile form sends to PUT /readiness. Regions are typed as a comma-separated list; the route checks the rest. */
export function profileBody(f: ProfileForm): { launchType: LaunchType; traits: string[]; regions: string[]; domain: string | null; siteUrl: string | null } {
  return {
    launchType: f.launchType,
    traits: f.traits,
    regions: [...new Set(f.regions.split(",").map((x) => x.trim()).filter(Boolean))],
    domain: f.domain.trim() || null,
    siteUrl: f.siteUrl.trim() || null,
  }
}
