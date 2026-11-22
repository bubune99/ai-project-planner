/**
 * Launch readiness: what comes in from outside, checked before it is stored.
 *
 * Everything here is a rule about input: a launch profile, evidence attached
 * to a decision, a scanner's results, who is acting, and when an owner's pass
 * counts as an override of a failing check. No React, no database, no clock.
 * Checks: lib/readiness/input.assert.ts.
 */

import { LAUNCH_TYPES, TRAITS, type ActorKind, type Evidence, type LaunchType, type Profile, type ValidationState } from "./model"

export type Source = "manual" | "mcp" | "extension" | "api"
export interface Actor { id: string; kind: ActorKind; source: Source }

export const MAX_EVIDENCE = 20
export const MAX_SYNC_RESULTS = 300

export function validateProfileInput(input: unknown): { ok: true; value: Profile } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, error: "profile must be an object" }
  const i = input as Record<string, unknown>
  if (typeof i.launchType !== "string" || !LAUNCH_TYPES.includes(i.launchType as LaunchType)) return { ok: false, error: `launchType must be one of ${LAUNCH_TYPES.join(", ")}` }
  const list = (v: unknown, name: string): string[] | string => {
    if (v === undefined) return []
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && x.length <= 40)) return `${name} must be an array of short strings`
    return [...new Set(v as string[])].slice(0, 30)
  }
  const regions = list(i.regions, "regions")
  if (typeof regions === "string") return { ok: false, error: regions }
  const traits = list(i.traits, "traits")
  if (typeof traits === "string") return { ok: false, error: traits }
  const unknown = traits.filter((t) => !(TRAITS as readonly string[]).includes(t))
  if (unknown.length) return { ok: false, error: `unknown trait(s): ${unknown.join(", ")}` }
  const domain = typeof i.domain === "string" && i.domain.trim() ? i.domain.trim().toLowerCase() : null
  if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { ok: false, error: "domain must look like example.com" }
  let siteUrl: string | null = null
  if (typeof i.siteUrl === "string" && i.siteUrl.trim()) {
    let u: URL
    try { u = new URL(i.siteUrl.trim()) } catch { return { ok: false, error: "siteUrl must be a URL" } }
    if (u.protocol !== "https:") return { ok: false, error: "siteUrl must be https" }
    siteUrl = u.toString()
  }
  return { ok: true, value: { launchType: i.launchType as LaunchType, regions: regions.length ? regions : ["US"], traits, domain, siteUrl } }
}

const EVIDENCE_KINDS = new Set(["check", "scan", "link", "document", "signoff", "note"])

/** The evidence as it will be stored, or a sentence saying what is wrong with it. */
export function cleanEvidence(input: unknown): Evidence[] | string {
  if (input === undefined) return []
  if (!Array.isArray(input)) return "evidence must be an array"
  const out: Evidence[] = []
  for (const e of input.slice(0, MAX_EVIDENCE)) {
    if (typeof e !== "object" || e === null) return "each evidence entry must be an object"
    const x = e as Record<string, unknown>
    if (typeof x.kind !== "string" || !EVIDENCE_KINDS.has(x.kind)) return "evidence kind must be check, scan, link, document, signoff or note"
    if (typeof x.summary !== "string" || !x.summary.trim()) return "evidence needs a summary"
    out.push({
      kind: x.kind as Evidence["kind"],
      summary: x.summary.slice(0, 1000),
      ...(typeof x.ref === "string" ? { ref: x.ref.slice(0, 500) } : {}),
      ...(typeof x.at === "string" ? { at: x.at.slice(0, 40) } : {}),
      ...(typeof x.by === "string" ? { by: x.by.slice(0, 120) } : {}),
    })
  }
  return out
}

export interface SyncFinding { path: string; line: number; message: string }
export interface SyncResult { itemId: string; status: "pass" | "fail" | "warn" | "n/a"; summary: string; findings: SyncFinding[] }

const SYNC_STATUSES = new Set(["pass", "fail", "warn", "n/a"])

/** A scanner's results with the malformed rows dropped. null when it is not a list at all. */
export function cleanSyncResults(input: unknown): SyncResult[] | null {
  if (!Array.isArray(input)) return null
  const out: SyncResult[] = []
  for (const r of input.slice(0, MAX_SYNC_RESULTS)) {
    if (typeof r !== "object" || r === null) continue
    const x = r as Record<string, unknown>
    if (typeof x.itemId !== "string" || typeof x.status !== "string" || !SYNC_STATUSES.has(x.status) || typeof x.summary !== "string") continue
    const findings = (Array.isArray(x.findings) ? x.findings : [])
      .filter((f): f is SyncFinding => typeof f === "object" && f !== null && typeof (f as SyncFinding).path === "string" && typeof (f as SyncFinding).line === "number" && typeof (f as SyncFinding).message === "string")
      .slice(0, 5)
      .map((f) => ({ path: f.path.slice(0, 300), line: f.line, message: f.message.slice(0, 300) }))
    out.push({ itemId: x.itemId.slice(0, 80), status: x.status as SyncResult["status"], summary: x.summary.slice(0, 500), findings })
  }
  return out
}

/** An owner passing something whose latest machine check failed is an override, and is logged as one. */
export function isOverride(actor: ActorKind, stored: ValidationState, prev: { state: string; evidence?: Evidence[] | null } | undefined): boolean {
  if (actor !== "user" || stored !== "passed" || prev?.state !== "failed") return false
  return (prev.evidence ?? []).some((e) => e.kind === "check" || e.kind === "scan")
}

/**
 * Who is acting. Only the project's owner, signed in at the planner, decides
 * as the owner ("user"). An API key is an agent, and so is an agent saving
 * through the owner's signed-in tab that says so (agent: true). A signed-in
 * collaborator is a person but not the owner: they get an agent's limits, and
 * the id says what they are.
 */
export function whoIsActing(
  auth: { authType: "session" | "api-key"; userId: string; apiKeyId?: string },
  o: { isOwner: boolean; saysAgent: boolean; source?: Source },
): { role: "owner" | "agent" | "collaborator"; actor: Actor } {
  if (auth.authType === "api-key") return { role: "agent", actor: { id: `api-key:${auth.apiKeyId ?? "unknown"}`, kind: "agent", source: o.source ?? "api" } }
  if (o.saysAgent) return { role: "agent", actor: { id: `agent-in-session:${auth.userId}`, kind: "agent", source: o.source ?? "api" } }
  if (!o.isOwner) return { role: "collaborator", actor: { id: `collaborator:${auth.userId}`, kind: "agent", source: "manual" } }
  return { role: "owner", actor: { id: auth.userId, kind: "user", source: "manual" } }
}
