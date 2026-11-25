/**
 * Leads: a note someone left on one of the owner's sites (the FAR CNCPT contact form first), kept in the planner so
 * it can be followed up from one place. Owner, 2026-11-25 (question cea936a9, card 1711d9e8): "Yes: save each note as
 * a lead in the planner, and keep the email."
 *
 * Pure: what a site may send, cleaned and checked. No database, no clock. Asserted by lead-model.assert.ts.
 */

export const LEAD_STATUSES = ["new", "replied", "closed"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_LIMITS = { name: 200, email: 254, company: 200, topic: 40, message: 5000, source: 80, ref: 120 } as const

export interface LeadInput {
  name: string
  email: string
  company: string | null
  topic: string | null
  message: string
  /** Where it came from, in words: "farcncpt.com contact form". */
  source: string
  /** The site's own id for this note, so a retried send is saved once. */
  ref: string | null
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(raw: Record<string, unknown>, key: keyof typeof LEAD_LIMITS, required: boolean): Result<string | null> {
  const v = raw[key]
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
    return required ? { ok: false, error: `${key} is required` } : { ok: true, value: null }
  }
  if (typeof v !== "string") return { ok: false, error: `${key} must be text` }
  const t = v.trim()
  if (t.length > LEAD_LIMITS[key]) return { ok: false, error: `${key} is over ${LEAD_LIMITS[key]} characters` }
  return { ok: true, value: t }
}

/** Clean and check what a site sent. Unknown fields are refused, so nothing unplanned is stored. */
export function parseLead(raw: unknown): Result<LeadInput> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "send a JSON object" }
  const r = raw as Record<string, unknown>
  const unknown = Object.keys(r).filter((k) => !(k in LEAD_LIMITS))
  if (unknown.length) return { ok: false, error: `not a lead field: ${unknown.join(", ")}` }
  const out: Partial<Record<keyof typeof LEAD_LIMITS, string | null>> = {}
  for (const [k, req] of [["name", true], ["email", true], ["company", false], ["topic", false], ["message", true], ["source", true], ["ref", false]] as const) {
    const t = text(r, k, req)
    if (!t.ok) return t
    out[k] = t.value
  }
  const email = (out.email as string).toLowerCase()
  if (!EMAIL.test(email)) return { ok: false, error: "email is not an email address" }
  return {
    ok: true,
    value: { name: out.name as string, email, company: out.company ?? null, topic: out.topic ?? null, message: out.message as string, source: out.source as string, ref: out.ref ?? null },
  }
}

/** A key may write leads when it was made for that (leads:write) or can write everything (write). */
export function canWriteLeads(auth: { authType: string; scopes?: string[] }): boolean {
  if (auth.authType === "session") return true
  return !!auth.scopes?.some((s) => s === "leads:write" || s === "write")
}

/** A key made only for leads may not read them back: a site that is broken into cannot list the notes. */
export function canReadLeads(auth: { authType: string; scopes?: string[] }): boolean {
  if (auth.authType === "session") return true
  return !!auth.scopes?.includes("read")
}

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v)
}
