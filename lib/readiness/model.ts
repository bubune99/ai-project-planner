/**
 * Launch readiness: the pure rules.
 *
 * From the plans-and-evidence spec (agent-com, 2026-09-30):
 *   - a project's launch type decides which validations it needs
 *   - validations move unvalidated → proposed → passed | failed | waived, and a
 *     passed one turns stale when its evidence expires
 *   - an agent may pass a validation on its own only in the code domain and only
 *     with machine-checkable evidence; market, business and legal/tax need the
 *     owner (or a professional) — agents can only propose
 *   - health is computed, never set by hand: phase = the last gate whose
 *     validations all passed or were waived; red when a current-gate item
 *     failed or went stale, amber when proposals wait on the owner
 *
 * The checklist itself is catalog.json, generated from the Comprehension
 * extension's catalog so the editor and the planner can't drift.
 *
 * No React, no DB, `now` injected. Assertions: lib/readiness/model.assert.ts.
 */

import catalogJson from "./catalog.json"

export type Domain = "code" | "market" | "business" | "legal"
export type LaunchType = "product" | "extension" | "store" | "client-site" | "invite-only"
export type Tier = "P0" | "P1" | "P2"
export type ValidationState = "unvalidated" | "proposed" | "passed" | "failed" | "waived" | "stale"
export type ActorKind = "user" | "agent"

export interface Source { title: string; url: string; quality: string }
export interface CatalogItem {
  id: string
  title: string
  claim: string
  domain: Domain
  gate: number
  tier: Tier
  types: LaunchType[] | "all"
  when?: string[]
  proof: "automated" | "evidence" | "signoff"
  check?: string
  sources: Source[]
  practice?: boolean
  cadence?: string
  beyondResearch?: boolean
}
export interface OpenItem { id: string; item: string; why: string; resolveWith: string; blocks?: string[] }

interface CatalogFile {
  gates: Record<string, string>
  agentCanPass: Domain[]
  recheckMonths: Record<Domain, number>
  cadenceDays: Record<string, number>
  openItems: OpenItem[]
  items: CatalogItem[]
  generatedAt: string
}
const catalog = catalogJson as unknown as CatalogFile

export const ITEMS: CatalogItem[] = catalog.items
export const OPEN_ITEMS: OpenItem[] = catalog.openItems
export const GATES: Record<string, string> = catalog.gates
export const LAUNCH_TYPES: LaunchType[] = ["product", "extension", "store", "client-site", "invite-only"]
export const STATES: ValidationState[] = ["unvalidated", "proposed", "passed", "failed", "waived", "stale"]
export const TRAITS = ["ai", "payments", "email", "accounts", "minors", "mcp", "browser-extension", "public-site", "uploads", "subscriptions", "sensitive-data", "financial-data", "ugc", "vps", "sms", "physical-goods"] as const

export interface Profile { launchType: LaunchType; regions: string[]; traits: string[]; domain?: string | null; siteUrl?: string | null }

/** A stored validation row (project_validations), as the model needs it. */
export interface ValidationRow {
  itemId: string
  state: ValidationState
  reason?: string | null
  decidedBy?: string | null
  actorKind?: ActorKind | null
  decidedAt?: string | null
  evidence?: Evidence[]
}
export interface Evidence { kind: "check" | "scan" | "link" | "document" | "signoff" | "note"; ref?: string; summary: string; at?: string; by?: string }

export const itemById = (id: string) => ITEMS.find((i) => i.id === id)

export function applies(item: CatalogItem, p: Profile): boolean {
  if (item.types !== "all" && !item.types.includes(p.launchType)) return false
  return !item.when || item.when.every((t) => p.traits.includes(t))
}

/** When a passed validation goes stale: its cadence, else its domain's re-check window. null = only on change. */
export function staleAfter(item: CatalogItem, decidedAt: string): string | null {
  const t = Date.parse(decidedAt)
  if (Number.isNaN(t)) return null
  if (item.cadence && catalog.cadenceDays[item.cadence]) return new Date(t + catalog.cadenceDays[item.cadence] * 86_400_000).toISOString()
  const months = catalog.recheckMonths[item.domain]
  if (!months) return null
  const d = new Date(t)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

/** The state as of `now`: a stored pass past its window reads as stale. */
export function effectiveState(item: CatalogItem, row: ValidationRow | undefined, now: string): ValidationState {
  if (!row) return "unvalidated"
  if (row.state === "passed" && row.decidedAt) {
    const due = staleAfter(item, row.decidedAt)
    if (due && due < now) return "stale"
  }
  return row.state
}

const MACHINE_EVIDENCE = new Set<Evidence["kind"]>(["check", "scan"])

/**
 * Who may set what. Owners may set anything (waived needs a reason).
 * Agents may pass only code items with machine evidence; any other pass is
 * downgraded to proposed. Agents may always record a failure — a failing check
 * is a fact, not a judgement.
 */
export function authorize(
  item: CatalogItem,
  wanted: ValidationState,
  actor: ActorKind,
  input: { reason?: string | null; evidence?: Evidence[] },
): { ok: true; state: ValidationState; note?: string } | { ok: false; error: string } {
  if (wanted === "stale" || wanted === "unvalidated") return { ok: false, error: `"${wanted}" is computed, not set` }
  if (wanted === "waived" && !input.reason?.trim()) return { ok: false, error: "a waiver needs a reason" }
  if (actor === "user") return { ok: true, state: wanted }
  if (wanted === "waived") return { ok: false, error: "only the owner can waive a validation" }
  if (wanted === "passed") {
    const machine = (input.evidence ?? []).some((e) => MACHINE_EVIDENCE.has(e.kind))
    if (catalog.agentCanPass.includes(item.domain) && machine) return { ok: true, state: "passed" }
    return {
      ok: true,
      state: "proposed",
      note: catalog.agentCanPass.includes(item.domain)
        ? "Recorded as proposed: an agent pass needs machine evidence (a check or scan result)."
        : `Recorded as proposed: ${item.domain} items need the owner's sign-off.`,
    }
  }
  return { ok: true, state: wanted }
}

export interface ValidationView {
  item: CatalogItem
  state: ValidationState
  reason: string | null
  decidedBy: string | null
  actorKind: ActorKind | null
  decidedAt: string | null
  evidence: Evidence[]
  dueAt: string | null
}
export interface GateHealth { gate: number; name: string; total: number; passed: number; failed: number; open: number; byDomain: Record<string, { total: number; passed: number }> }
export interface Readiness {
  profile: Profile
  validations: ValidationView[]
  gates: GateHealth[]
  /** Last gate whose applicable validations are all passed or waived; -1 = none. */
  phase: number
  /** The first gate that isn't complete — where the work is now. */
  currentGate: number | null
  health: "red" | "amber" | "green"
  counts: Record<ValidationState, number>
  openItems: OpenItem[]
}

const TIER_RANK: Record<Tier, number> = { P0: 0, P1: 1, P2: 2 }
const done = (s: ValidationState) => s === "passed" || s === "waived"

export function computeReadiness(profile: Profile, rows: ValidationRow[], now: string): Readiness {
  const byId = new Map(rows.map((r) => [r.itemId, r]))
  const validations: ValidationView[] = ITEMS.filter((i) => applies(i, profile))
    .map((item) => {
      const row = byId.get(item.id)
      const state = effectiveState(item, row, now)
      return {
        item,
        state,
        reason: state === "stale" ? `Due for re-check since ${staleAfter(item, row!.decidedAt!)!.slice(0, 10)}${item.cadence ? ` (${item.cadence})` : ""}.` : (row?.reason ?? null),
        decidedBy: row?.decidedBy ?? null,
        actorKind: row?.actorKind ?? null,
        decidedAt: row?.decidedAt ?? null,
        evidence: row?.evidence ?? [],
        dueAt: row?.state === "passed" && row.decidedAt ? staleAfter(item, row.decidedAt) : null,
      }
    })
    .sort((a, b) => a.item.gate - b.item.gate || TIER_RANK[a.item.tier] - TIER_RANK[b.item.tier] || a.item.id.localeCompare(b.item.id))

  const gates: GateHealth[] = [0, 1, 2, 3, 4, 5].map((g) => {
    const vs = validations.filter((v) => v.item.gate === g)
    const byDomain: GateHealth["byDomain"] = {}
    for (const v of vs) {
      const d = (byDomain[v.item.domain] ??= { total: 0, passed: 0 })
      d.total++
      if (done(v.state)) d.passed++
    }
    const passed = vs.filter((v) => done(v.state)).length
    const failed = vs.filter((v) => v.state === "failed" || v.state === "stale").length
    return { gate: g, name: GATES[String(g)] ?? `Gate ${g}`, total: vs.length, passed, failed, open: vs.length - passed - failed, byDomain }
  })

  let phase = -1
  for (const g of gates) {
    if (g.total && g.passed < g.total) break
    phase = g.gate
  }
  const current = gates.find((g) => g.total && g.passed < g.total)
  const currentGate = current ? current.gate : null
  const atCurrent = validations.filter((v) => v.item.gate === currentGate)

  const counts = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<ValidationState, number>
  for (const v of validations) counts[v.state]++

  // Spec: red when a current-gate validation failed or went stale; amber when
  // proposals wait on the owner (or work remains); green when the current gate is clear.
  // A failed or stale P0 anywhere also reads red — a broken baseline isn't "amber".
  const red = atCurrent.some((v) => v.state === "failed" || v.state === "stale") ||
    validations.some((v) => v.item.tier === "P0" && (v.state === "failed" || v.state === "stale"))
  const health = red ? "red" : currentGate === null ? "green" : "amber"

  return { profile, validations, gates, phase, currentGate, health, counts, openItems: OPEN_ITEMS }
}

/**
 * Map an extension run (static + live check results) onto validation updates.
 * Machine results are evidence: a pass on a code item passes it; a pass on a
 * legal/business item is only proposed; a fail is failed; n/a changes nothing.
 * Owner decisions are never overwritten by a pass — only a failing check
 * reopens them (the code changed since).
 */
export function planSync(
  results: { itemId: string; status: "pass" | "fail" | "warn" | "n/a"; summary: string; findings?: { path: string; line: number; message: string }[] }[],
  existing: ValidationRow[],
  ranAt: string,
): { itemId: string; state: ValidationState; reason: string; evidence: Evidence }[] {
  const prev = new Map(existing.map((r) => [r.itemId, r]))
  const out: { itemId: string; state: ValidationState; reason: string; evidence: Evidence }[] = []
  for (const r of results) {
    const item = itemById(r.itemId)
    if (!item) continue
    const old = prev.get(r.itemId)
    if (r.status === "n/a") {
      // The check no longer applies (code removed, or a false positive fixed in the checker). A
      // machine-set result is cleared back to unchecked; an owner's decision is left alone.
      if (old && old.actorKind === "agent") out.push({ itemId: r.itemId, state: "unvalidated", reason: `No longer applies: ${r.summary}`, evidence: { kind: "check", summary: r.summary, at: ranAt, by: "comprehension-extension" } })
      continue
    }
    const evidence: Evidence = {
      kind: "check",
      ref: r.findings?.[0] ? `${r.findings[0].path}:${r.findings[0].line}` : undefined,
      summary: r.summary + (r.findings?.length ? ` (${r.findings.length} finding${r.findings.length === 1 ? "" : "s"})` : ""),
      at: ranAt,
      by: "comprehension-extension",
    }
    const ownerDecided = old?.actorKind === "user" && (old.state === "passed" || old.state === "waived" || old.state === "failed")
    if (r.status === "fail") {
      if (old?.state === "waived") continue // the owner accepted this risk with a reason
      out.push({ itemId: r.itemId, state: "failed", reason: r.summary, evidence })
      continue
    }
    if (ownerDecided) continue
    const auth = authorize(item, r.status === "pass" ? "passed" : "proposed", "agent", { evidence: [evidence] })
    if (auth.ok) out.push({ itemId: r.itemId, state: auth.state, reason: r.summary, evidence })
  }
  return out
}

/** The "launch readiness report" export (Markdown). */
export function readinessMarkdown(projectName: string, r: Readiness, today: string): string {
  // Words, not emoji: the owner's rule for anything a person reads.
  const label: Record<ValidationState, string> = { passed: "Passed", failed: "Failed", proposed: "Proposed", unvalidated: "Not checked", waived: "Waived", stale: "Due for re-check" }
  const lines = [
    `# Launch readiness — ${projectName}`,
    ``,
    `${today} · type **${r.profile.launchType}** · regions ${r.profile.regions.join(", ") || "—"} · traits ${r.profile.traits.join(", ") || "none"}`,
    ``,
    `**Health: ${r.health.toUpperCase()}** · last fully passed gate: ${r.phase < 0 ? "none" : `${r.phase} (${GATES[String(r.phase)]})`} · current gate: ${r.currentGate === null ? "all clear" : `${r.currentGate} (${GATES[String(r.currentGate)]})`}`,
    `Passed ${r.counts.passed} · failed ${r.counts.failed} · stale ${r.counts.stale} · proposed ${r.counts.proposed} · unvalidated ${r.counts.unvalidated} · waived ${r.counts.waived}`,
    ``,
    `> Not legal or tax advice. Legal, business and market items need the owner's or a professional's sign-off; agents can only propose them.`,
    ``,
  ]
  for (const g of r.gates.filter((x) => x.total)) {
    const domains = Object.entries(g.byDomain).map(([d, v]) => `${d} ${v.passed}/${v.total}`).join(" · ")
    lines.push(`## Gate ${g.gate} · ${g.name} — ${g.passed}/${g.total} passed${g.failed ? `, ${g.failed} failed or stale` : ""}`, ``, `_${domains}_`, ``)
    for (const v of r.validations.filter((x) => x.item.gate === g.gate)) {
      const who = v.decidedBy ? ` — ${v.state} by ${v.decidedBy}${v.actorKind === "agent" ? " (agent)" : ""}${v.decidedAt ? ` on ${v.decidedAt.slice(0, 10)}` : ""}` : ""
      lines.push(`- [${label[v.state]}] **${v.item.id}** ${v.item.title} _(${v.item.tier}, ${v.item.domain})_${who}`)
      if (v.reason) lines.push(`  ${v.reason}`)
      for (const e of v.evidence.slice(-2)) lines.push(`  - evidence (${e.kind}): ${e.summary}${e.ref ? ` — ${e.ref}` : ""}`)
    }
    lines.push(``)
  }
  lines.push(`## Verify before relying on these`, ``)
  for (const o of r.openItems) lines.push(`- **${o.item}** — ${o.why} _Resolve with: ${o.resolveWith}._`)
  lines.push(``, `## Sources`, ``)
  const seen = new Map<string, string>()
  for (const v of r.validations) for (const s of v.item.sources) seen.set(s.url, `${s.title} (${s.quality})`)
  for (const [url, title] of seen) lines.push(`- ${title} — ${url}`)
  return lines.join("\n")
}
