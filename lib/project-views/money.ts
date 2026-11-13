/**
 * A project's money, and the roll-up across projects. The numbers are the
 * ones entered on each project's Money tab (projects.metadata.planner_ui.money).
 * Pure. Nothing is estimated: a number that was never entered is null and
 * shows as "—", never 0. Checked by project-views.assert.ts.
 */

export interface ProjectMoney {
  currency?: string
  budget?: number | null
  budgetPeriod?: "month" | "total"
  warnAt?: number
  costs?: { id: string; name: string; service: string; monthly: number | null }[]
  putIn?: { id: string; date: string; amount: number; note: string }[]
  broughtIn?: { id: string; date: string; amount: number; note: string }[]
}

export interface MoneyTotals {
  currency: string
  budget: number | null
  budgetPeriod: "month" | "total"
  /** Running cost per month; null when no cost has an amount. */
  monthly: number | null
  putIn: number | null
  broughtIn: number | null
  /** Share of a monthly budget the running costs use (0.5 = 50%); null when it can't be worked out. */
  budgetUsed: number | null
  /** Running costs have reached the project's warning level. */
  warn: boolean
}

const sum = (list: { amount: number }[] | undefined) => (list && list.length ? list.reduce((a, x) => a + (Number(x.amount) || 0), 0) : null)

export function moneyTotals(money: ProjectMoney | null | undefined): MoneyTotals {
  const m = money || {}
  const priced = (m.costs || []).filter((c) => c.monthly != null)
  const monthly = priced.length ? priced.reduce((a, c) => a + (c.monthly || 0), 0) : null
  const budget = m.budget ?? null
  const budgetPeriod = m.budgetPeriod === "total" ? "total" : "month"
  const budgetUsed = budget && budgetPeriod === "month" && monthly != null ? monthly / budget : null
  return {
    currency: m.currency || "USD",
    budget, budgetPeriod, monthly,
    putIn: sum(m.putIn), broughtIn: sum(m.broughtIn),
    budgetUsed,
    warn: budgetUsed != null && budgetUsed * 100 >= (m.warnAt ?? 80),
  }
}

/** True when a project has any money entered at all. */
export const hasMoney = (t: MoneyTotals) => t.budget != null || t.monthly != null || t.putIn != null || t.broughtIn != null

export interface MoneyRow extends MoneyTotals { id: string; name: string }

export interface MoneyRollup {
  currency: string
  rows: MoneyRow[]
  /** Monthly budgets only; a total budget is a different kind of number and is not added in. */
  monthlyBudget: number | null
  monthly: number | null
  putIn: number | null
  broughtIn: number | null
  /** Brought in minus put in; null unless at least one of them was entered. */
  net: number | null
  /** Monthly cost by service across these projects, largest first. */
  services: { service: string; monthly: number; projects: number }[]
}

const add = (a: number | null, b: number | null) => (a == null && b == null ? null : (a || 0) + (b || 0))

/**
 * Totals across projects, one roll-up per currency (amounts in different
 * currencies are never added together). Projects with no money entered are
 * left out of the rows.
 */
export function moneyRollup(projects: { id: string; name: string; money?: ProjectMoney | null }[]): MoneyRollup[] {
  const by = new Map<string, MoneyRollup & { svc: Map<string, { monthly: number; projects: Set<string> }> }>()
  for (const p of projects) {
    const t = moneyTotals(p.money)
    if (!hasMoney(t)) continue
    let r = by.get(t.currency)
    if (!r) { r = { currency: t.currency, rows: [], monthlyBudget: null, monthly: null, putIn: null, broughtIn: null, net: null, services: [], svc: new Map() }; by.set(t.currency, r) }
    r.rows.push({ id: p.id, name: p.name, ...t })
    if (t.budgetPeriod === "month") r.monthlyBudget = add(r.monthlyBudget, t.budget)
    r.monthly = add(r.monthly, t.monthly)
    r.putIn = add(r.putIn, t.putIn)
    r.broughtIn = add(r.broughtIn, t.broughtIn)
    for (const c of p.money?.costs || []) {
      if (c.monthly == null) continue
      const key = (c.service || c.name || "Other").trim() || "Other"
      const s = r.svc.get(key.toLowerCase()) || { monthly: 0, projects: new Set<string>() }
      s.monthly += c.monthly; s.projects.add(p.id)
      r.svc.set(key.toLowerCase(), s)
      if (!r.services.some((x) => x.service.toLowerCase() === key.toLowerCase())) r.services.push({ service: key, monthly: 0, projects: 0 })
    }
  }
  return [...by.values()]
    .map(({ svc, ...r }) => ({
      ...r,
      net: r.putIn == null && r.broughtIn == null ? null : (r.broughtIn || 0) - (r.putIn || 0),
      rows: r.rows.sort((a, b) => (b.monthly ?? -1) - (a.monthly ?? -1) || a.name.localeCompare(b.name)),
      services: r.services.map((x) => ({ service: x.service, monthly: svc.get(x.service.toLowerCase())!.monthly, projects: svc.get(x.service.toLowerCase())!.projects.size })).sort((a, b) => b.monthly - a.monthly),
    }))
    .sort((a, b) => b.rows.length - a.rows.length)
}

export const formatMoney = (n: number | null | undefined, currency = "USD") =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n)
