/**
 * Direction: per project, which decisions an agent takes on its own and which wait for the owner, what the AI would
 * do by best practice for each, and where the AI means to take the build next.
 *
 * Owner, 2026-11-21: "I want a method where I can do a selection in the project on decision steps that can cause a
 * pause or require me to make a decision but I need my preferences on where we should go direction wise because the
 * best practices should be maintained. So a decision tree that shows what ai would do and would want to go in terms
 * of building."
 *
 * One document per project (stored like People and flows: whole-document saves that carry their version). Pure: no
 * React, no DOM, no clock (`at` is passed in). Checked by direction-model.assert.ts.
 */

export type Mode = "ai" | "tell" | "ask"
export const MODES: readonly Mode[] = ["ai", "tell", "ask"]
export const MODE_LABEL: Record<Mode, string> = { ai: "AI decides", tell: "AI decides, tells me", ask: "Ask me first" }

export type Area = "access" | "data" | "money" | "people" | "shipping" | "stack" | "product" | "design"
export const AREAS: { id: Area; title: string }[] = [
  { id: "access", title: "Access and security" },
  { id: "data", title: "Data" },
  { id: "money", title: "Money" },
  { id: "people", title: "Messages to real people" },
  { id: "shipping", title: "Shipping" },
  { id: "stack", title: "Tech stack" },
  { id: "product", title: "Product behavior" },
  { id: "design", title: "Design and taste" },
]

export interface Kind {
  id: string
  area: Area
  title: string
  /** What an agent does when it is left to decide: the best-practice path. */
  aiWould: string
  why: string
  defaultMode: Mode
  /** Fixed: the mode cannot be changed (autonomy level D always asks; errors are always the AI's). Says why. */
  locked?: string
}

const K = (id: string, area: Area, title: string, aiWould: string, why: string, defaultMode: Mode, locked?: string): Kind =>
  ({ id, area, title, aiWould, why, defaultMode, ...(locked ? { locked } : {}) })

/** The tree. Defaults follow the standing autonomy rules (A to D); the owner changes any that is not locked. */
export const KINDS: readonly Kind[] = [
  K("access.stricter", "access", "Tightening who can reach something",
    "Add the repo's own existing guard (the one sibling routes use) to an unguarded route, on a review branch.",
    "Closing a gap with a check the code already trusts cannot lock out anyone who should be in.", "tell"),
  K("access.looser", "access", "Opening something up or declaring a page public",
    "Keep it closed and ask, with the exact route and who would gain access.",
    "Who can see what is a promise to the people using the product.", "ask"),
  K("access.credentials", "access", "Rotating or revoking keys and passwords",
    "Report the exposure and what to rotate; never rotate itself.",
    "Rotating breaks whatever still uses the old key, and only the owner holds the accounts.", "ask",
    "Credentials are the owner's (autonomy level D)."),

  K("data.migration.staging", "data", "Schema changes on the staging database",
    "Write the migration, run the safety check, apply it to staging and run the trigger smoke test.",
    "Staging is sample data and is there to be changed.", "ai"),
  K("data.migration.prod", "data", "Schema changes on the production database",
    "Prove it on staging first, then ask for the go with what it changes.",
    "A broken production migration loses or corrupts real records.", "ask",
    "Production migrations need the owner's go (autonomy level D)."),
  K("data.delete", "data", "Deleting records or files someone made",
    "Leave them and ask, listing what would go and whether it can come back.",
    "Deleted work the owner wanted cannot be rebuilt by an agent.", "ask"),
  K("data.sample", "data", "Sample data on staging",
    "Add what a check needs, mark it as sample, and remove it afterwards.",
    "Checks need realistic data; real data is never touched to make a test pass.", "ai"),

  K("money.payments", "money", "Payments, prices and billing",
    "Leave them as they are and ask, with the amounts involved.",
    "Money moves are hard to undo and are a promise to customers.", "ask",
    "Payments and prices are the owner's (autonomy level C/D)."),
  K("money.spend", "money", "Anything that spends money (plans, domains, paid services)",
    "Find the cheapest option that meets the need and ask before buying.",
    "Spending is the owner's call.", "ask",
    "Spending money needs the owner (autonomy level D)."),

  K("people.send", "people", "Sending email, texts or notices to real people",
    "Build it behind a release switch that stays off; test only on staging with sample people.",
    "A wrong message to real members cannot be taken back.", "ask",
    "Messages to real people need the owner (autonomy level D)."),
  K("people.copy", "people", "Wording that makes a promise (legal, policy, guarantees)",
    "Draft it plainly from facts in the code and ask before it goes live.",
    "A promise on the site binds the owner.", "ask"),

  K("shipping.fix", "shipping", "Shipping a proven fix to production",
    "Fix on a review branch, prove it on staging, ship under the standing go, record it in Checks and Changes.",
    "Owner, 2026-11-20: \"Everything you fix ships to prod, just be sure to update checks and changes accordingly so I can review.\"", "tell"),
  K("shipping.feature", "shipping", "Shipping a new feature",
    "Propose it into Requests with goal, deliverable and proof; build after approval; ship once proven on staging.",
    "Features change what the product is, which is the owner's to decide.", "ask"),
  K("shipping.deps", "shipping", "Dependency upgrades",
    "Take patch and minor upgrades with the lockfile on a review branch; ask before a major version.",
    "Small upgrades close security holes; a major one can change behavior.", "tell"),

  K("stack.library", "stack", "Adding a library or service",
    "Check what the repo already has, prefer a proven package over hand-rolled code, remove what it replaces.",
    "Fewer moving parts; nothing added that is already here.", "tell"),
  K("stack.architecture", "stack", "Changing how a part of the system is built",
    "Follow the repo's pattern (pure rules with a check file, one route per write, thin screens) and say why when it departs.",
    "The pattern is what keeps the code verifiable without a dev server.", "tell"),
  K("stack.provider", "stack", "Switching a provider (auth, database, hosting, AI model)",
    "Stay on the current provider and ask with the cost and what would move.",
    "Switching touches accounts, money and data the owner holds.", "ask"),

  K("product.behavior", "product", "Choosing between two ways the product could behave",
    "Pick the one that matches what the owner already said and what users expect, and ask when nothing settles it.",
    "What the product does is the owner's; an agent only settles what his words or the code already settle.", "ask"),
  K("product.scope", "product", "Removing or hiding a page or feature",
    "Keep it, raise whether it is needed as a talking point.",
    "Owner, 2026-11-15: question the point of each page, but never stop or remove it.", "ask"),
  K("product.errors", "product", "Fixing something broken (dead control, wrong figure, cut-off text)",
    "Find the cause, fix it, prove it on staging, ship it.",
    "Owner: \"I should be deciding on preferences, not deciding on errors.\"", "ai",
    "Errors are never put to the owner: agents find, fix and prove them."),

  K("design.system", "design", "Applying the design rules (fonts, colors, icons, spacing)",
    "Use the project's tokens and shared pieces; Inter, no monospace, no emoji, no colored side stripes.",
    "These are the owner's standing rules; following them is not a decision.", "ai"),
  K("design.layout", "design", "A visible change to how a screen looks",
    "Mock it on the live page first, ship once it works, and send the before and after to the Changes tab.",
    "How it looks is taste, which the owner judges after seeing it.", "tell"),
  K("design.redesign", "design", "Redesigning a whole screen",
    "Audit what the screen does first, mock the direction, and ask before building.",
    "A redesign changes how the owner works every day.", "ask"),
]

export const KIND_BY_ID: ReadonlyMap<string, Kind> = new Map(KINDS.map((k) => [k.id, k]))

export interface Choice { mode?: Mode; note?: string }

export type UpcomingStatus = "waiting" | "taken" | "approved" | "redirected"
export interface Upcoming {
  id: string
  kindId: string
  title: string
  /** The path the AI wants to take. */
  aiPath: string
  why: string
  alternatives: string[]
  status: UpcomingStatus
  /** The owner's words when he redirects (or adds to an approval). */
  ownerNote?: string
  by: "agent" | "owner"
  at: string
  answeredAt?: string
}

export interface DirectionDoc { choices: Record<string, Choice>; upcoming: Upcoming[] }

export const emptyDoc = (): DirectionDoc => ({ choices: {}, upcoming: [] })

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as readonly string[]).includes(v)
const STATUSES: readonly UpcomingStatus[] = ["waiting", "taken", "approved", "redirected"]

/** Reads a stored or sent document. Unknown kinds and fields are dropped; a locked kind keeps no mode of its own. */
export function parseDoc(raw: unknown): { doc: DirectionDoc; errors: string[] } {
  const errors: string[] = []
  const doc = emptyDoc()
  if (!raw || typeof raw !== "object") return { doc, errors: raw == null ? [] : ["The direction must be an object"] }
  const r = raw as Record<string, unknown>
  const choices = r.choices && typeof r.choices === "object" ? (r.choices as Record<string, unknown>) : {}
  for (const [id, c] of Object.entries(choices)) {
    const kind = KIND_BY_ID.get(id)
    if (!kind || !c || typeof c !== "object") continue
    const cc = c as Record<string, unknown>
    const out: Choice = {}
    if (cc.mode !== undefined) {
      if (!isMode(cc.mode)) errors.push(`"${kind.title}": the mode must be ai, tell or ask`)
      else if (kind.locked && cc.mode !== kind.defaultMode) errors.push(lockedMessage(kind))
      else if (cc.mode !== kind.defaultMode) out.mode = cc.mode
    }
    const note = str(cc.note, 1000)
    if (note) out.note = note
    if (out.mode || out.note) doc.choices[id] = out
  }
  const ups = Array.isArray(r.upcoming) ? r.upcoming : []
  const seen = new Set<string>()
  for (const u of ups.slice(0, 200)) {
    if (!u || typeof u !== "object") continue
    const x = u as Record<string, unknown>
    const id = str(x.id, 64), title = str(x.title, 200), aiPath = str(x.aiPath, 2000)
    if (!id || seen.has(id)) continue
    if (!title || !aiPath) { errors.push("Each upcoming decision needs a title and the path the AI would take"); continue }
    if (!KIND_BY_ID.has(str(x.kindId, 64))) { errors.push(`"${title}": unknown kind of decision`); continue }
    const status = STATUSES.includes(x.status as UpcomingStatus) ? (x.status as UpcomingStatus) : "waiting"
    const ownerNote = str(x.ownerNote, 1000)
    if (status === "redirected" && !ownerNote) { errors.push(`"${title}": a redirect needs the direction to take`); continue }
    seen.add(id)
    doc.upcoming.push({
      id, kindId: str(x.kindId, 64), title, aiPath, why: str(x.why, 1000),
      alternatives: Array.isArray(x.alternatives) ? x.alternatives.map((a) => str(a, 300)).filter(Boolean).slice(0, 6) : [],
      status, ...(ownerNote ? { ownerNote } : {}), by: x.by === "owner" ? "owner" : "agent", at: str(x.at, 40),
      ...(str(x.answeredAt, 40) ? { answeredAt: str(x.answeredAt, 40) } : {}),
    })
  }
  return { doc, errors }
}

export const modeOf = (doc: DirectionDoc, kind: Kind): Mode => (kind.locked ? kind.defaultMode : doc.choices[kind.id]?.mode ?? kind.defaultMode)

const lockedMessage = (kind: Kind) => `"${kind.title}" is fixed at ${MODE_LABEL[kind.defaultMode]}: ${kind.locked}`

export interface KindView extends Kind { mode: Mode; changed: boolean; note?: string }

/** The tree as the tab draws it: areas in order, each kind with its mode in force and the owner's note. */
export function tree(doc: DirectionDoc): { area: Area; title: string; kinds: KindView[]; asks: number }[] {
  return AREAS.map((a) => {
    const kinds = KINDS.filter((k) => k.area === a.id).map((k) => {
      const mode = modeOf(doc, k)
      return { ...k, mode, changed: mode !== k.defaultMode, ...(doc.choices[k.id]?.note ? { note: doc.choices[k.id].note } : {}) }
    })
    return { area: a.id, title: a.title, kinds, asks: kinds.filter((k) => k.mode === "ask").length }
  })
}

// ── Edits: each returns a new document ──

export function setMode(doc: DirectionDoc, kindId: string, mode: Mode): DirectionDoc {
  const kind = KIND_BY_ID.get(kindId)
  if (!kind) throw new Error("Unknown kind of decision")
  if (kind.locked && mode !== kind.defaultMode) throw new Error(lockedMessage(kind))
  const { mode: _old, ...rest } = doc.choices[kindId] ?? {}
  const next: Choice = mode === kind.defaultMode ? rest : { ...rest, mode }
  return withChoice(doc, kindId, next)
}

export function setNote(doc: DirectionDoc, kindId: string, note: string): DirectionDoc {
  if (!KIND_BY_ID.has(kindId)) throw new Error("Unknown kind of decision")
  const { note: _old, ...rest } = doc.choices[kindId] ?? {}
  const n = note.trim().slice(0, 1000)
  return withChoice(doc, kindId, n ? { ...rest, note: n } : rest)
}

function withChoice(doc: DirectionDoc, kindId: string, c: Choice): DirectionDoc {
  const { [kindId]: _drop, ...others } = doc.choices
  return { ...doc, choices: c.mode || c.note ? { ...others, [kindId]: c } : others }
}

/**
 * An agent records a build decision. Where the kind is "ask", it waits for the owner; otherwise the agent has taken
 * it and the entry is the telling (shown in the tab for "tell", kept quietly for "ai").
 */
export function propose(doc: DirectionDoc, p: { id: string; kindId: string; title: string; aiPath: string; why?: string; alternatives?: string[]; at: string; by?: "agent" | "owner" }): { doc: DirectionDoc; entry: Upcoming } {
  const kind = KIND_BY_ID.get(p.kindId)
  if (!kind) throw new Error("Unknown kind of decision")
  if (!p.title.trim() || !p.aiPath.trim()) throw new Error("A decision needs a title and the path the AI would take")
  const entry: Upcoming = {
    id: p.id, kindId: kind.id, title: p.title.trim().slice(0, 200), aiPath: p.aiPath.trim().slice(0, 2000), why: (p.why ?? "").trim().slice(0, 1000),
    alternatives: (p.alternatives ?? []).map((a) => a.trim()).filter(Boolean).slice(0, 6),
    status: modeOf(doc, kind) === "ask" ? "waiting" : "taken", by: p.by ?? "agent", at: p.at,
  }
  return { doc: { ...doc, upcoming: [entry, ...doc.upcoming.filter((u) => u.id !== p.id)].slice(0, 200) }, entry }
}

/** The owner approves the AI's path, or redirects it with the direction to take. */
export function answer(doc: DirectionDoc, id: string, a: { approve: boolean; note?: string; at: string }): DirectionDoc {
  const u = doc.upcoming.find((x) => x.id === id)
  if (!u) throw new Error("That decision is no longer listed")
  const note = (a.note ?? "").trim().slice(0, 1000)
  if (!a.approve && !note) throw new Error("Say which way to go instead")
  const done: Upcoming = { ...u, status: a.approve ? "approved" : "redirected", answeredAt: a.at, ...(note ? { ownerNote: note } : {}) }
  return { ...doc, upcoming: doc.upcoming.map((x) => (x.id === id ? done : x)) }
}

export function removeUpcoming(doc: DirectionDoc, id: string): DirectionDoc {
  return { ...doc, upcoming: doc.upcoming.filter((x) => x.id !== id) }
}

// ── What an agent reads before it acts ──

export interface Guidance {
  kindId: string
  title: string
  mode: Mode
  /** True when the agent must not act until the owner answers. */
  mustAsk: boolean
  aiWould: string
  why: string
  ownerDirection?: string
  locked?: string
  /** Earlier answers on the same kind of decision: the owner's direction to follow. */
  precedents: { title: string; status: UpcomingStatus; ownerNote?: string }[]
  next: string
}

export function guidanceFor(doc: DirectionDoc, kindId: string): Guidance {
  const kind = KIND_BY_ID.get(kindId)
  if (!kind) throw new Error(`Unknown kind of decision. Known: ${KINDS.map((k) => k.id).join(", ")}`)
  const mode = modeOf(doc, kind)
  const note = doc.choices[kind.id]?.note
  const precedents = doc.upcoming.filter((u) => u.kindId === kind.id && (u.status === "approved" || u.status === "redirected")).slice(0, 5)
    .map((u) => ({ title: u.title, status: u.status, ...(u.ownerNote ? { ownerNote: u.ownerNote } : {}) }))
  const next = mode === "ask"
    ? "Do not act on this yet. Record the decision with direction_propose (it waits in the owner's Direction tab), mark the card waiting, and take the next card."
    : mode === "tell"
      ? "Go ahead on the path above (and the owner's direction, if any), then record what you decided with direction_propose so it shows in the Direction tab."
      : "Go ahead on the path above (and the owner's direction, if any). No need to record it."
  return { kindId: kind.id, title: kind.title, mode, mustAsk: mode === "ask", aiWould: kind.aiWould, why: kind.why, ...(note ? { ownerDirection: note } : {}), ...(kind.locked ? { locked: kind.locked } : {}), precedents, next }
}

/** Lines for the record of changes, in plain words. */
export function describeChanges(a: DirectionDoc, b: DirectionDoc): string[] {
  const lines: string[] = []
  for (const k of KINDS) {
    const ma = modeOf(a, k), mb = modeOf(b, k)
    if (ma !== mb) lines.push(`"${k.title}": ${MODE_LABEL[ma]} to ${MODE_LABEL[mb]}`)
    const na = a.choices[k.id]?.note ?? "", nb = b.choices[k.id]?.note ?? ""
    if (na !== nb) lines.push(nb ? `"${k.title}": direction set to "${nb.slice(0, 120)}"` : `"${k.title}": direction removed`)
  }
  const byId = new Map(a.upcoming.map((u) => [u.id, u]))
  for (const u of b.upcoming) {
    const old = byId.get(u.id)
    if (!old) lines.push(u.status === "waiting" ? `Waiting for you: "${u.title}"` : `AI decided: "${u.title}"`)
    else if (old.status !== u.status) lines.push(u.status === "approved" ? `Approved: "${u.title}"` : u.status === "redirected" ? `Redirected: "${u.title}": ${u.ownerNote ?? ""}` : `"${u.title}" is ${u.status}`)
  }
  const ids = new Set(b.upcoming.map((u) => u.id))
  for (const u of a.upcoming) if (!ids.has(u.id)) lines.push(`Removed: "${u.title}"`)
  return lines
}

/** How many build decisions wait on the owner: the tab's count. */
export const waitingCount = (doc: DirectionDoc) => doc.upcoming.filter((u) => u.status === "waiting").length

/**
 * What an agent may not change: the modes and directions are the owner's preferences, and an answer is his to give.
 * An agent may add decisions (proposed or taken) and remove its own unanswered ones. Returns why a save is refused.
 */
export function agentRefusals(a: DirectionDoc, b: DirectionDoc): string[] {
  const out: string[] = []
  for (const k of KINDS) {
    if (modeOf(a, k) !== modeOf(b, k)) out.push(`"${k.title}": only the owner sets how a decision is made`)
    if ((a.choices[k.id]?.note ?? "") !== (b.choices[k.id]?.note ?? "")) out.push(`"${k.title}": only the owner sets the direction`)
  }
  const after = new Map(b.upcoming.map((u) => [u.id, u]))
  for (const u of a.upcoming) {
    const v = after.get(u.id)
    if (!v) { if (u.status === "approved" || u.status === "redirected" || u.by === "owner") out.push(`"${u.title}": an answered decision stays on the record`); continue }
    if (v.status !== u.status || (v.ownerNote ?? "") !== (u.ownerNote ?? "")) out.push(`"${u.title}": only the owner answers a decision`)
  }
  for (const v of b.upcoming) if (!a.upcoming.some((u) => u.id === v.id) && (v.status === "approved" || v.status === "redirected" || v.by === "owner")) out.push(`"${v.title}": an agent cannot add an answered decision`)
  return out
}
