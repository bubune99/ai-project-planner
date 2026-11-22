/**
 * Guides: what the owner's stack and taste ask of the work, written once and
 * turned into checks. Pure: no database, no React.
 *
 * Two kinds. A STACK entry is a tool we build with (Next.js, Stripe, ...): it
 * points to the skill that says how to use it and names the checks its use
 * brings. A STATEMENT is a preference on how something should be built or
 * look: it says what it applies to and what shows it was followed. Statements
 * are expected to change as taste is refined and researched, so each carries
 * where it came from and whether it is settled (active) or still a draft.
 *
 * A statement that is a rule is either PERMANENT or ON TRIAL until a review
 * date. Both are enforced the same; the trial is only marked, and shows as due
 * for review once its date has passed. Every saved version is kept with who
 * saved it and when, and an earlier one can be restored (migration 085).
 *
 * The planner stores guides. The plugin pulls them as rules and applies them
 * to each file as it is written (far-gates: lib-code.mjs).
 */
import type { Issue } from "./gate-model"

export interface GuideCheck {
  id: string
  /** What must be true, in words. */
  say: string
  /**
   * A check the hook can run itself on the file's text:
   *   mentions:<regex>  the text must match
   *   forbids:<regex>   the text must not match
   *   max-lines:<n>, no-secrets, no-emoji, has-check-file
   * Without it, the agent performs the check and records what it saw.
   */
  auto?: string
}

export interface Guide {
  id: string
  kind: "stack" | "statement"
  name: string
  summary: string
  /** The skill that holds the how-to. */
  skill?: string
  applies: {
    /** File globs: ** any folders, * within a name, {a,b} alternatives. */
    files?: string[]
    /** Only files that import one of these packages (a prefix: "@radix-ui" matches "@radix-ui/react-dialog"). */
    imports?: string[]
  }
  checks: GuideCheck[]
  status: "active" | "draft"
  source: "owner" | "research" | "agent"
  /** Where it came from: the owner's words and date, or the research behind it. */
  basis: string
  /** On trial until this day (YYYY-MM-DD), when it is due for review. Missing or null: permanent. */
  trialUntil?: string | null
}

/** Everything about a guide that a version keeps: all of it but the id. */
export type GuideContent = Omit<Guide, "id" | "trialUntil"> & { trialUntil: string | null }

/** Who saved a version. "before" is the state a guide was in when history started being kept. */
export type Saver = { kind: "owner" } | { kind: "agent"; name: string } | { kind: "before" }
export type VersionChange = "saved" | "status" | "trial" | "permanent" | "restored" | "before"

export interface GuideVersion {
  version: number
  /** When it was saved (ISO). */
  at: string
  by: Saver
  change: VersionChange
  restoredFrom?: number
  content: GuideContent
}

/** One line of the History list. */
export interface HistoryEntry {
  version: number
  at: string
  who: string
  /** What this version changed from the one before it, in plain words. */
  changes: string[]
  /** The version the guide is at now. */
  current: boolean
}

/** The shape the plugin applies: one rule per check. */
export interface Rule {
  id: string
  match: string
  imports?: string[]
  auto?: string
  say?: string
  manual?: string
  /** The guide it came from, shown to the agent with the skill to load. */
  from: string
  skill?: string
}

const AUTO = /^(mentions:.+|forbids:.+|max-lines:\d+|no-secrets|no-emoji|has-check-file)$/

export function validateGuide(g: Guide): Issue[] {
  const issues: Issue[] = []
  const say = (where: string, message: string) => issues.push({ where, message })
  if (!g.name?.trim()) say("name", "A guide needs a name")
  if (!g.summary?.trim()) say("summary", "Say in a sentence what it asks for")
  if (!["stack", "statement"].includes(g.kind)) say("kind", "kind is stack or statement")
  if (!g.basis?.trim()) say("basis", "Say where it comes from: the owner's words, or the research behind it")
  if (!g.applies?.files?.length && !g.applies?.imports?.length) say("applies", "Say which files it applies to, by path or by what they import")
  if (!g.checks?.length) say("checks", "A guide needs at least one check, or nothing verifies it")
  const ids = new Set<string>()
  for (const c of g.checks ?? []) {
    if (!/^[a-z0-9-]{2,40}$/.test(c.id ?? "")) say(`check ${c.id}`, "A check id is lowercase letters, digits and dashes")
    if (ids.has(c.id)) say(`check ${c.id}`, "Two checks share this id")
    ids.add(c.id)
    if (!c.say?.trim()) say(`check ${c.id}`, "Say what must be true")
    if (c.auto !== undefined && !AUTO.test(c.auto)) say(`check ${c.id}`, "auto must be mentions:, forbids:, max-lines:, no-secrets, no-emoji or has-check-file")
    if (c.auto && /^(mentions|forbids):/.test(c.auto)) { try { new RegExp(c.auto.replace(/^\w+:/, "")) } catch { say(`check ${c.id}`, "The pattern is not a valid regular expression") } }
  }
  return issues
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

/** The rules a set of guides compiles to. Drafts are left out: a preference still being worked out holds nobody up. */
export function toRules(guides: Guide[]): Rule[] {
  const rules: Rule[] = []
  for (const g of guides) {
    if (g.status !== "active") continue
    const globs = g.applies.files?.length ? g.applies.files : ["**/*.{ts,tsx,js,jsx,mjs}"]
    for (const c of g.checks) for (const match of globs) {
      rules.push({
        id: `${slug(g.name)}-${c.id}`, match, from: g.name,
        ...(g.applies.imports?.length ? { imports: g.applies.imports } : {}),
        ...(c.auto ? { auto: c.auto, say: c.say } : { manual: c.say }),
        ...(g.skill ? { skill: g.skill } : {}),
      })
    }
  }
  return rules
}

// ── Trial or permanent ──────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayNumber = (day: string) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86_400_000 }

/** A real calendar day written YYYY-MM-DD. */
export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split("-").map(Number)
  const x = new Date(Date.UTC(y, m - 1, d))
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d
}

/** "Nov 30, 2026". No locale and no clock: the day is shown as it was written. */
export function fmtDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/**
 * The day the person is in. The browser sends its own day because the server's (UTC) is already tomorrow for an
 * evening in the US; it is believed only when it is within a day of the server's.
 */
export function clientDay(sent: unknown, serverDay: string): string {
  return isDay(sent) && Math.abs(dayNumber(sent) - dayNumber(serverDay)) <= 1 ? sent : serverDay
}

/**
 * A guide as it was stored, read into the shape versions keep. Anything stored before trials existed has no
 * trialUntil and reads as permanent; a value that is not a real day reads as permanent too.
 */
export function storedContent(raw: unknown): GuideContent {
  const r = (raw ?? {}) as Record<string, unknown>
  const applies = (r.applies ?? {}) as Guide["applies"]
  return {
    kind: r.kind as Guide["kind"], name: r.name as string, summary: r.summary as string,
    skill: typeof r.skill === "string" && r.skill ? r.skill : undefined,
    applies: { ...(Array.isArray(applies.files) ? { files: [...applies.files] } : {}), ...(Array.isArray(applies.imports) ? { imports: [...applies.imports] } : {}) },
    checks: Array.isArray(r.checks) ? (r.checks as GuideCheck[]).map((c) => ({ ...c })) : [],
    status: r.status as Guide["status"], source: r.source as Guide["source"], basis: r.basis as string,
    trialUntil: isDay(r.trialUntil) ? r.trialUntil : null,
  }
}

/** A guide without its id, as a version keeps it. */
export const contentOf = (g: Guide): GuideContent => storedContent(g)

export type TrialState = { state: "permanent" } | { state: "trial"; until: string; due: boolean }

/** Permanent, or on trial until a day. Due for review once that day has passed; `today` is passed in. */
export function trialOf(g: { trialUntil?: string | null }, today: string): TrialState {
  if (!isDay(g.trialUntil)) return { state: "permanent" }
  return { state: "trial", until: g.trialUntil, due: today > g.trialUntil }
}

export function trialLabel(g: { trialUntil?: string | null }, today: string): string {
  const t = trialOf(g, today)
  if (t.state === "permanent") return "Permanent"
  return t.due ? `On trial: due for review since ${fmtDay(t.until)}` : `On trial until ${fmtDay(t.until)}`
}

/** Puts a statement on trial until a day, or (null) makes it permanent. Returns the new content; the one given is not changed. */
export function withTrial(g: GuideContent, until: string | null, today: string): GuideContent | { error: string } {
  if (until === null) return { ...g, trialUntil: null }
  if (g.kind !== "statement") return { error: "Only a statement can be on trial" }
  if (!isDay(until)) return { error: "Give the review date as a real date (YYYY-MM-DD)" }
  if (until < today) return { error: "That review date has already passed" }
  return { ...g, trialUntil: until }
}

// ── Who may do what, and versions ───────────────────────────────────────────

/** Why this person may not make this change, or null when they may. Trial, permanent and restore are the owner's. */
export function refusal(by: Saver, change: VersionChange): string | null {
  if (change === "saved" || change === "status") return null
  return by.kind === "owner" ? null : "Only the owner can put a statement on trial, make it permanent or restore a version"
}

export function whoSaved(by: Saver): string {
  if (by.kind === "owner") return "You"
  if (by.kind === "before") return "Before history was kept"
  return by.name.trim() ? `Agent ${by.name.trim()}` : "An agent"
}

const canon = (c: GuideContent) => JSON.stringify([
  c.kind, c.name.trim(), c.summary.trim(), c.skill ?? null, c.applies.files ?? [], c.applies.imports ?? [],
  c.checks.map((k) => [k.id, k.say, k.auto ?? null]), c.status, c.source, c.basis.trim(), c.trialUntil ?? null,
])

/** Whether two saves hold the same thing: a save that changes nothing is not a new version. */
export const sameContent = (a: GuideContent, b: GuideContent) => canon(a) === canon(b)

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const count = (n: number, word: string) => (n ? [`${n} ${word}`] : [])

/** What one version changed from the one before it, in plain words. */
export function changedInWords(prev: GuideContent | null, next: GuideContent): string[] {
  if (!prev) return ["First version kept"]
  const out: string[] = []
  if (prev.name.trim() !== next.name.trim()) out.push("Name changed")
  if (prev.summary.trim() !== next.summary.trim()) out.push("Summary changed")
  if (prev.status !== next.status) out.push(next.status === "active" ? "Made a rule" : "Set aside as a draft")
  const was = prev.trialUntil ?? null, now = next.trialUntil ?? null
  if (was !== now) out.push(!now ? "Made permanent" : was ? `Review date moved to ${fmtDay(now)}` : `Put on trial until ${fmtDay(now)}`)
  const before = new Map(prev.checks.map((c) => [c.id, c]))
  const after = new Set(next.checks.map((c) => c.id))
  const added = next.checks.filter((c) => !before.has(c.id)).length
  const removed = prev.checks.filter((c) => !after.has(c.id)).length
  const reworded = next.checks.filter((c) => before.has(c.id) && !same([c.say, c.auto], [before.get(c.id)!.say, before.get(c.id)!.auto])).length
  const checks = [...count(added, "added"), ...count(removed, "removed"), ...count(reworded, "reworded")]
  if (checks.length) out.push(`Checks: ${checks.join(", ")}`)
  if (!same([prev.applies.files ?? [], prev.applies.imports ?? []], [next.applies.files ?? [], next.applies.imports ?? []])) out.push("Files it applies to changed")
  if (prev.basis.trim() !== next.basis.trim() || prev.source !== next.source) out.push("Where it comes from changed")
  if ((prev.skill ?? null) !== (next.skill ?? null)) out.push("How-to skill changed")
  if (prev.kind !== next.kind) out.push("Kind changed")
  return out.length ? out : ["Nothing changed"]
}

/** The History list: every version, newest first, with who saved it, when, and what it changed. */
export function historyOf(versions: GuideVersion[]): HistoryEntry[] {
  const asc = [...versions].sort((a, b) => a.version - b.version)
  const latest = asc.length ? asc[asc.length - 1].version : 0
  return asc.map((v, i): HistoryEntry => {
    const diff = changedInWords(i ? asc[i - 1].content : null, v.content)
    const changes = v.change === "before" ? ["As it stood before history was kept"]
      : v.change === "restored" ? [`Restored version ${v.restoredFrom ?? "?"}`, ...diff.filter((d) => d !== "Nothing changed")]
      : diff
    return { version: v.version, at: v.at, who: whoSaved(v.by), changes, current: v.version === latest }
  }).reverse()
}

/** The content an earlier version restores to. Restoring writes it as a NEW version; nothing is taken out of the history. */
export function versionToRestore(versions: GuideVersion[], version: number): { content: GuideContent } | { error: string } {
  const v = versions.find((x) => x.version === version)
  if (!v) return { error: `There is no version ${version}` }
  if (version === Math.max(...versions.map((x) => x.version))) return { error: "That is already the current version" }
  return { content: storedContent(v.content) }
}
