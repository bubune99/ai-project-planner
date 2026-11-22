/**
 * A transaction typed into quick capture, checked before anything is written. Pure: the body and today's date in,
 * the values for `finance_transactions` (migration 028) or the reason it was refused out.
 */

export interface QuickTransaction {
  /** A size, to the cent. Which way the money went is `transactionType`. */
  amount: number
  transactionType: "income" | "expense"
  description: string | null
  merchant: string | null
  notes: string | null
  /** YYYY-MM-DD */
  date: string
  accountId: string | null
  categoryId: string | null
  /** A category given by name; the route finds its id among the person's own and the built-in ones. */
  categoryName: string | null
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** DECIMAL(15,2) */
const LARGEST = 9_999_999_999_999.99

class Refused extends Error {}

function text(body: Record<string, unknown>, key: string, label: string, max: number): string | null {
  const v = body[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "string") throw new Refused(`${label} must be text`)
  const t = v.trim()
  if (t.length > max) throw new Refused(`${label} is too long (${max} characters at most)`)
  return t || null
}

function id(body: Record<string, unknown>, key: string, label: string): string | null {
  const v = body[key]
  if (v === undefined || v === null || v === "") return null
  if (typeof v !== "string" || !UUID.test(v)) throw new Refused(`${label} is not a valid id`)
  return v
}

function amountOf(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN
  const cents = Math.round(Math.abs(n) * 100) / 100
  if (!Number.isFinite(cents) || cents <= 0 || cents > LARGEST) throw new Refused("Amount must be a number above zero")
  return cents
}

function dateOf(v: unknown, today: string): string {
  if (v === undefined || v === null || v === "") return today
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
  if (!m || !d || d.toISOString().slice(0, 10) !== v) throw new Refused("Date must be a real day written YYYY-MM-DD")
  return v as string
}

export function parseQuickTransaction(raw: unknown, today: string): Parsed<QuickTransaction> {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  try {
    const type = body.transactionType ?? "expense"
    if (type !== "income" && type !== "expense") throw new Refused("Transaction type must be income or expense")
    return {
      ok: true,
      value: {
        amount: amountOf(body.amount),
        transactionType: type,
        description: text(body, "description", "Description", 500),
        merchant: text(body, "merchant", "Merchant", 255),
        notes: text(body, "notes", "Notes", 2000),
        date: dateOf(body.date, today),
        accountId: id(body, "accountId", "Account"),
        categoryId: id(body, "categoryId", "Category"),
        categoryName: text(body, "category", "Category", 100),
      },
    }
  } catch (e) {
    if (e instanceof Refused) return { ok: false, message: e.message }
    throw e
  }
}

export interface OwnAccount { id: string; currency: string }

/** `accounts` are the signed-in person's own open accounts. A transaction always belongs to one of them. */
export function pickAccount(accounts: OwnAccount[], requested: string | null): { ok: true; account: OwnAccount } | { ok: false; message: string } {
  if (requested) {
    const account = accounts.find((a) => a.id === requested)
    return account ? { ok: true, account } : { ok: false, message: "Account not found" }
  }
  if (accounts.length === 0) return { ok: false, message: "Add an account first: a transaction belongs to an account" }
  if (accounts.length > 1) return { ok: false, message: "Say which account this belongs to (accountId)" }
  return { ok: true, account: accounts[0] }
}
