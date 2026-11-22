/**
 * "Export my data": what goes in the file, and what never does.
 *
 * Pure: no database, no clock, no React. The route (app/api/settings/export/route.ts) reads each group's rows
 * for the signed-in person and hands them here; the time is passed in. Checks: export-model.assert.ts.
 *
 * Three promises this file keeps:
 *   1. The file lists every group, in a fixed order, and says of each whether it was read in full, cut at its
 *      limit, or could not be read. A group that failed is never shown as empty.
 *   2. A field whose name marks it as a secret is dropped wherever it sits, and a planner key pasted into text
 *      is blanked. The file says how many were dropped.
 *   3. What is left out is said in words, in the file and on the page.
 */

export const EXPORT_FORMAT = "ai-project-planner-export"
/** Raise when the shape of the file changes (a group renamed or removed, a field of the envelope changed). */
export const EXPORT_VERSION = 1

export interface ExportGroup {
  /** The name of the list in the file. */
  key: string
  /** The name a person reads. */
  label: string
  /** The heading it sits under on the page. */
  section: string
  /** The table it is read from. */
  table: string
  /** How the rows are narrowed to the signed-in person, in words. The route's query must do exactly this. */
  filter: string
  /** The most rows kept. The route reads one more, so a cut is known rather than guessed. */
  cap: number
  /** Fields dropped from this group only, on top of the secret names. */
  drop?: readonly string[]
}

const MINE = "user_id is the signed-in person"
const MY_PROJECTS = "project_id is a project whose user_id is the signed-in person"
const ROWS = 5000

export const EXPORT_GROUPS = [
  { key: "notification_prefs", label: "Notification choices", section: "Account", table: "notification_prefs", filter: MINE, cap: 10 },
  { key: "api_keys", label: "API keys (names and dates only)", section: "Account", table: "api_keys", filter: MINE, cap: 500 },
  { key: "devices", label: "Devices that get notifications (dates only)", section: "Account", table: "push_subscriptions", filter: MINE, cap: 500, drop: ["endpoint"] },

  { key: "projects", label: "Projects", section: "Projects", table: "projects", filter: MINE, cap: ROWS },
  { key: "tasks", label: "Tasks", section: "Projects", table: "project_steps", filter: MY_PROJECTS, cap: 20000 },
  { key: "phases", label: "Phases", section: "Projects", table: "project_phases", filter: MY_PROJECTS, cap: ROWS },
  { key: "progress_notes", label: "Progress notes", section: "Projects", table: "progress_notes", filter: MY_PROJECTS, cap: 20000 },
  { key: "task_comments", label: "Comments on tasks", section: "Projects", table: "step_comments", filter: MY_PROJECTS, cap: 20000 },
  { key: "decisions", label: "Decisions", section: "Projects", table: "mlp_why_decisions", filter: MINE, cap: ROWS },
  { key: "architecture_decisions", label: "Architecture decisions", section: "Projects", table: "architecture_decisions", filter: MY_PROJECTS, cap: ROWS },

  { key: "documents", label: "Documents (text and links to files)", section: "Documents", table: "documents", filter: `${MINE}, or ${MY_PROJECTS}`, cap: 2000 },
  { key: "processes", label: "Processes", section: "Documents", table: "sops", filter: MINE, cap: 2000 },

  { key: "todos", label: "To-dos", section: "To-dos", table: "todos", filter: MINE, cap: 20000 },

  { key: "ideas", label: "Ideas", section: "Ideas", table: "ideas", filter: MINE, cap: ROWS },
  { key: "idea_facets", label: "Idea facets", section: "Ideas", table: "idea_facets", filter: "idea_id is an idea whose user_id is the signed-in person", cap: 20000 },
  { key: "idea_notes", label: "Idea notes", section: "Ideas", table: "idea_notes", filter: "idea_id is an idea whose user_id is the signed-in person", cap: 20000 },

  { key: "finance_accounts", label: "Accounts", section: "Finance", table: "finance_accounts", filter: MINE, cap: ROWS },
  { key: "finance_categories", label: "Categories", section: "Finance", table: "finance_categories", filter: MINE, cap: ROWS },
  { key: "finance_transactions", label: "Transactions", section: "Finance", table: "finance_transactions", filter: MINE, cap: 50000 },
  { key: "finance_budgets", label: "Budgets", section: "Finance", table: "finance_budgets", filter: MINE, cap: ROWS },
  { key: "finance_income_streams", label: "Income", section: "Finance", table: "finance_income_streams", filter: MINE, cap: ROWS },
  { key: "finance_recurring", label: "Repeating transactions", section: "Finance", table: "finance_recurring_transactions", filter: MINE, cap: ROWS },
  { key: "finance_goals", label: "Goals", section: "Finance", table: "finance_goals", filter: MINE, cap: ROWS },

  { key: "calendar_events", label: "Events", section: "Calendar", table: "calendar_events", filter: MINE, cap: 20000 },
  { key: "calendar_categories", label: "Event categories", section: "Calendar", table: "calendar_categories", filter: MINE, cap: ROWS },

  { key: "clients", label: "Clients", section: "Clients", table: "clients", filter: MINE, cap: ROWS },
  { key: "service_schedules", label: "Service schedules", section: "Clients", table: "service_schedules", filter: MINE, cap: ROWS },

  { key: "skills", label: "Skills", section: "Library", table: "skills", filter: MINE, cap: ROWS },
  { key: "templates", label: "Templates", section: "Library", table: "feature_templates", filter: MINE, cap: ROWS },
  { key: "protocols", label: "Protocols", section: "Library", table: "protocols", filter: MINE, cap: ROWS },
  { key: "prompts", label: "Prompts", section: "Library", table: "prompts", filter: MINE, cap: ROWS },
  { key: "statements", label: "Stack entries and statements", section: "Library", table: "gate_guides", filter: MINE, cap: ROWS },

  { key: "chats", label: "Chats", section: "Assistant", table: "ai_conversations", filter: MINE, cap: ROWS },
  { key: "chat_messages", label: "Chat messages", section: "Assistant", table: "ai_messages", filter: "conversation_id is a chat whose user_id is the signed-in person", cap: 20000 },
] as const satisfies readonly ExportGroup[]

export type ExportKey = (typeof EXPORT_GROUPS)[number]["key"]

/** Said on the page and carried in the file. Change both by changing this. */
export const NOT_INCLUDED: readonly string[] = [
  "The files themselves (images, PDFs and other uploads): the file holds their links, not their contents.",
  "Older versions of documents.",
  "Page checks, their screenshots, walks, People and flows, and Changes.",
  "What agents ran and their logs.",
  "Memory records other than decisions, and the catalog.",
  "Projects other people shared with you.",
  "Your password and sign-in sessions (held by the sign-in provider), API key values, and the addresses and keys of your devices.",
]

// ── secrets ──────────────────────────────────────────────────────────────────

const SECRET_NAMES = new Set([
  "password", "passwd", "secret", "token", "auth", "authorization", "p256dh", "api_key", "apikey", "private_key",
  "stack_auth_id", "credentials", "cookie",
])
const SECRET_ENDINGS = /(_hash|_password|_secret|_token|_api_key|_private_key)$/
/** A planner API key in running text. The prefix shown in Settings is at most 12 characters, so it is left alone. */
const PLANNER_KEY = /aipp_[A-Za-z0-9_-]{12,}/g

/** Whether a field's name marks it as a secret. Works on snake_case and camelCase names. */
export function isSecretField(name: string): boolean {
  const n = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
  return SECRET_NAMES.has(n) || SECRET_ENDINGS.test(n)
}

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object") return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * A copy of the value with every secret field dropped at any depth and any planner key in text blanked.
 * Nothing passed in is changed. `removed` counts both.
 */
export function scrub(value: unknown, alsoDrop: readonly string[] = []): { value: unknown; removed: number } {
  let removed = 0
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      return v.replace(PLANNER_KEY, () => { removed++; return "aipp_[removed]" })
    }
    if (Array.isArray(v)) return v.map(walk)
    if (!isPlain(v)) return v
    const out: Record<string, unknown> = {}
    for (const [k, inner] of Object.entries(v)) {
      if (isSecretField(k) || alsoDrop.includes(k)) { removed++; continue }
      out[k] = walk(inner)
    }
    return out
  }
  return { value: walk(value), removed }
}

// ── the file ─────────────────────────────────────────────────────────────────

/** What the route read for one group: its rows (up to one more than the limit), or that it could not be read. */
export type GroupRead = { rows: readonly unknown[] } | { error: string }

export interface ExportAccount { id: string; email: string; name: string | null }

export interface ExportContentsEntry {
  key: ExportKey
  label: string
  section: string
  /** Rows in the file. */
  count: number
  /** complete: all of it. cut: more existed than the limit. failed: could not be read, so the list is empty. */
  state: "complete" | "cut" | "failed"
  /** Only when cut: the limit it was cut at. */
  limit?: number
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: number
  exportedAt: string
  account: ExportAccount
  /** True only when every group was read in full. */
  complete: boolean
  secretFieldsRemoved: number
  contents: ExportContentsEntry[]
  notIncluded: readonly string[]
  data: Record<ExportKey, unknown[]>
}

export function buildExport(input: {
  now: Date
  account: ExportAccount
  reads: Partial<Record<ExportKey, GroupRead>>
}): ExportFile {
  let secretFieldsRemoved = 0
  const account = scrub(input.account)
  secretFieldsRemoved += account.removed

  const contents: ExportContentsEntry[] = []
  const data = {} as Record<ExportKey, unknown[]>
  for (const group of EXPORT_GROUPS as readonly ExportGroup[]) {
    const key = group.key as ExportKey
    const base = { key, label: group.label, section: group.section }
    const read = input.reads[key]
    if (!read || "error" in read) {
      data[key] = []
      contents.push({ ...base, count: 0, state: "failed" })
      continue
    }
    const cut = read.rows.length > group.cap
    const clean = scrub(read.rows.slice(0, group.cap), group.drop)
    secretFieldsRemoved += clean.removed
    data[key] = clean.value as unknown[]
    contents.push(cut
      ? { ...base, count: group.cap, state: "cut", limit: group.cap }
      : { ...base, count: read.rows.length, state: "complete" })
  }

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: input.now.toISOString(),
    account: account.value as ExportAccount,
    complete: contents.every((c) => c.state === "complete"),
    secretFieldsRemoved,
    contents,
    notIncluded: NOT_INCLUDED,
    data,
  }
}

/** The download's name, from the day passed in (UTC). */
export function exportFileName(now: Date): string {
  return `planner-export-${now.toISOString().slice(0, 10)}.json`
}

/** What the page says is in the file: one line per section, in the listed order. */
export function exportSummary(): { section: string; labels: string[] }[] {
  const out: { section: string; labels: string[] }[] = []
  for (const g of EXPORT_GROUPS) {
    const last = out[out.length - 1]
    if (last && last.section === g.section) last.labels.push(g.label)
    else out.push({ section: g.section, labels: [g.label] })
  }
  return out
}
