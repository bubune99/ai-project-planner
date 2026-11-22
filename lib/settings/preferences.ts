/*
 * The two account preferences in Settings: the timezone and the assistant's default model.
 *
 * Pure: no React, no database, no clock (an instant is passed in). The lists a value is checked against are
 * passed in too: the zones are the runtime's own (supportedZones), the models are the ones the app runs on
 * (MODELS in lib/agents/registry.ts). Nothing here names a zone or a model of its own.
 *
 * Two readings of a value, on purpose:
 *   - a change sent from the page is strict (parsePatch): anything not offered is refused with a reason;
 *   - a value read back from storage is lenient (readPreferences, modelFor, todayIn): one that is no longer
 *     offered counts as not chosen, so a retired model or a dropped zone can never break a page or a chat.
 *
 * Checks: preferences.assert.ts.
 */

export interface Preferences {
  /** An IANA zone name, or null for "this device's". */
  timezone: string | null
  /** A model id the app offers, or null for the planner's default. */
  defaultModel: string | null
}

export interface ModelOption { id: string; label: string }

export const NO_PREFERENCES: Preferences = { timezone: null, defaultModel: null }

// ── timezone ──────────────────────────────────────────────────────────────────

/** The zones this runtime knows. Empty when it cannot say, so nothing is offered rather than guessed. */
export function supportedZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone")
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

export const zoneLabel = (zone: string): string => zone.replace(/_/g, " ")

const utcDay = (instant: Date): string => instant.toISOString().slice(0, 10)

/**
 * The date (YYYY-MM-DD) it is in `zone` at `instant`. No zone, or one the runtime does not know, gives the
 * UTC date, which is what the server used before there was a setting.
 */
export function todayIn(zone: string | null, instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new Error("todayIn needs a real instant")
  if (!zone) return utcDay(instant)
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant)
    const get = (type: string) => parts.find((p) => p.type === type)?.value
    const y = get("year"), m = get("month"), d = get("day")
    return y && m && d ? `${y}-${m}-${d}` : utcDay(instant)
  } catch { return utcDay(instant) }
}

// ── model ─────────────────────────────────────────────────────────────────────

/** "claude-haiku-4-5-20251001" reads as "Claude Haiku 4.5": the id's own words, the release date left off. */
export function modelLabel(id: string): string {
  const words: string[] = []
  const numbers: string[] = []
  for (const part of id.replace(/-\d{8}$/, "").split("-")) {
    if (/^\d+$/.test(part)) numbers.push(part)
    else if (part) words.push(part.charAt(0).toUpperCase() + part.slice(1))
  }
  return [...words, numbers.join(".")].filter(Boolean).join(" ")
}

/** The models to offer, from the app's own list, each once and in its order. */
export function modelOptions(models: Readonly<Record<string, string>>): ModelOption[] {
  const seen = new Set<string>()
  const out: ModelOption[] = []
  for (const id of Object.values(models)) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, label: modelLabel(id) })
  }
  return out
}

/** The model a run uses: the stored choice while the app still offers it, otherwise the agent's own. */
export function modelFor(agentModel: string, stored: string | null | undefined, offered: readonly string[]): string {
  return typeof stored === "string" && offered.includes(stored) ? stored : agentModel
}

// ── stored row and a change from the page ─────────────────────────────────────

const offeredOrNull = (raw: unknown, offered: readonly string[]): string | null =>
  typeof raw === "string" && offered.includes(raw) ? raw : null

/** A stored row (or none) as preferences. Values no longer offered read as not chosen. */
export function readPreferences(row: unknown, zones: readonly string[], modelIds: readonly string[]): Preferences {
  const r = (row && typeof row === "object" ? row : {}) as { timezone?: unknown; default_model?: unknown }
  return { timezone: offeredOrNull(r.timezone, zones), defaultModel: offeredOrNull(r.default_model, modelIds) }
}

export type PatchResult =
  | { ok: true; changes: Partial<Preferences> }
  | { ok: false; message: string }

const FIELDS = ["timezone", "defaultModel"] as const

/** A change sent from the page. Only the two fields, each null (clear it) or a value from its list. */
export function parsePatch(body: unknown, zones: readonly string[], modelIds: readonly string[]): PatchResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "Send the setting to change." }
  const b = body as Record<string, unknown>
  const extra = Object.keys(b).filter((k) => !(FIELDS as readonly string[]).includes(k))
  if (extra.length) return { ok: false, message: `This only changes the timezone and the default model, not: ${extra.slice(0, 5).join(", ")}.` }
  const changes: Partial<Preferences> = {}
  if ("timezone" in b) {
    const v = b.timezone
    if (v !== null && !(typeof v === "string" && zones.includes(v))) return { ok: false, message: "That timezone is not in the list. Choose one from the list." }
    changes.timezone = v
  }
  if ("defaultModel" in b) {
    const v = b.defaultModel
    if (v !== null && !(typeof v === "string" && modelIds.includes(v))) return { ok: false, message: "That model is not one the assistant can run on. Choose one from the list." }
    changes.defaultModel = v
  }
  if (!("timezone" in changes) && !("defaultModel" in changes)) return { ok: false, message: "Send the setting to change." }
  return { ok: true, changes }
}
