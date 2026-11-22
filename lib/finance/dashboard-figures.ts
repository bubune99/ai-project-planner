/**
 * The finance figures shown outside the finance pages: this month's totals on the dashboard and the
 * one-line description of a transaction in the activity feed. Pure: rows in, figures out.
 *
 * The rows come from `finance_transactions` and `finance_budgets` (migration 028). An amount that cannot be read is an
 * error here, so a broken read can never turn into a zero that looks real.
 */

/** A DECIMAL as the database driver hands it over (a string), or a number. */
export type Amount = string | number | null | undefined

export function money(v: Amount): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  if (!Number.isFinite(n)) throw new Error(`An amount could not be read: ${JSON.stringify(v)}`)
  return n
}

function whole(v: Amount): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  if (!Number.isInteger(n) || n < 0) throw new Error(`A count could not be read: ${JSON.stringify(v)}`)
  return n
}

/** One row per transaction type and currency for the month: SELECT transaction_type, currency, SUM(amount) AS total, COUNT(*) AS count ... GROUP BY 1, 2. */
export interface TypeTotal { transaction_type: string; currency: string; total: Amount; count: Amount }

/** A total is null when the rows are in more than one currency: they are never added into one figure. */
export interface MonthFigures { monthSpending: number | null; monthIncome: number | null; transactionCount: number; currency: string | null }

/** The one currency the rows share, or null when there are none or several. */
function oneCurrency(rows: { currency: string }[]): { currency: string | null; mixed: boolean } {
  const all = [...new Set(rows.map((r) => r.currency))]
  return { currency: all.length === 1 ? all[0] : null, mixed: all.length > 1 }
}

/** Expenses are spending and income is income; a transfer between the person's own accounts is neither, but it is a transaction. */
export function monthFigures(rows: TypeTotal[]): MonthFigures {
  let monthSpending = 0
  let monthIncome = 0
  let transactionCount = 0
  for (const r of rows) {
    const total = money(r.total)
    transactionCount += whole(r.count)
    if (r.transaction_type === "expense") monthSpending += total
    else if (r.transaction_type === "income") monthIncome += total
  }
  const { currency, mixed } = oneCurrency(rows)
  return mixed ? { monthSpending: null, monthIncome: null, transactionCount, currency: null } : { monthSpending, monthIncome, transactionCount, currency }
}

/** One row per period and currency of the budgets in force: SELECT period, currency, SUM(amount) AS total, COUNT(*) AS count ... GROUP BY 1, 2. */
export interface BudgetTotal { period: string; currency: string; total: Amount; count: Amount }

export interface BudgetFigures { monthlyBudget: number | null; monthlyBudgetCount: number; budgetCount: number; currency: string | null }

/**
 * Only monthly budgets make the figure that sits beside this month's spending: a weekly or yearly budget is not
 * turned into a monthly one here. Every budget in force is counted.
 */
export function budgetFigures(rows: BudgetTotal[]): BudgetFigures {
  let monthlyBudget = 0
  let monthlyBudgetCount = 0
  let budgetCount = 0
  for (const r of rows) {
    const total = money(r.total)
    const count = whole(r.count)
    budgetCount += count
    if (r.period === "monthly") { monthlyBudget += total; monthlyBudgetCount += count }
  }
  const { currency, mixed } = oneCurrency(rows.filter((r) => r.period === "monthly"))
  return { monthlyBudget: mixed ? null : monthlyBudget, monthlyBudgetCount, budgetCount, currency }
}

export interface TransactionLineRow { transaction_type: string; amount: Amount; currency: string | null | undefined; category: string | null | undefined }

function inCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
  } catch {
    // Not a code the formatter knows: show it as written rather than guess a symbol.
    return `${currency} ${amount.toFixed(2)}`
  }
}

/** What the activity feed says about one transaction. */
export function transactionLine(row: TransactionLineRow): { action: "received" | "spent" | "moved"; description: string } {
  const shown = inCurrency(Math.abs(money(row.amount)), row.currency || "USD")
  if (row.transaction_type === "transfer") return { action: "moved", description: `${shown} - Transfer` }
  const income = row.transaction_type === "income"
  return { action: income ? "received" : "spent", description: `${income ? "+" : "-"}${shown} - ${row.category || "Uncategorized"}` }
}
