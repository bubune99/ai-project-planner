// npx -y tsx@4.23.15 lib/finance/dashboard-figures.assert.ts
import assert from "node:assert/strict"
import { budgetFigures, money, monthFigures, transactionLine } from "./dashboard-figures"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }

ok("an amount is read as a number, and one that cannot be read is an error, never a zero", () => {
  assert.equal(money("1234.50"), 1234.5)
  assert.equal(money(12), 12)
  assert.equal(money("0.00"), 0)
  assert.throws(() => money(null), /amount/)
  assert.throws(() => money(undefined), /amount/)
  assert.throws(() => money(""), /amount/)
  assert.throws(() => money("abc"), /amount/)
})

ok("this month: expenses are spending, income is income, a transfer is neither but is still counted", () => {
  const f = monthFigures([
    { transaction_type: "expense", currency: "USD", total: "310.25", count: "4" },
    { transaction_type: "income", currency: "USD", total: "2000.00", count: "1" },
    { transaction_type: "transfer", currency: "USD", total: "500.00", count: "2" },
  ])
  assert.deepEqual(f, { monthSpending: 310.25, monthIncome: 2000, transactionCount: 7, currency: "USD" })
})

ok("a month with no transactions is a true zero, in no currency", () => {
  assert.deepEqual(monthFigures([]), { monthSpending: 0, monthIncome: 0, transactionCount: 0, currency: null })
})

ok("a month with only income has no spending", () => {
  assert.deepEqual(monthFigures([{ transaction_type: "income", currency: "EUR", total: "50.00", count: 1 }]), { monthSpending: 0, monthIncome: 50, transactionCount: 1, currency: "EUR" })
})

ok("money in two currencies is never added into one figure: the totals are left out, the count stays", () => {
  const f = monthFigures([
    { transaction_type: "expense", currency: "USD", total: "10.00", count: "1" },
    { transaction_type: "expense", currency: "EUR", total: "20.00", count: "2" },
  ])
  assert.deepEqual(f, { monthSpending: null, monthIncome: null, transactionCount: 3, currency: null })
})

ok("a total that cannot be read fails the month instead of counting as nothing", () => {
  assert.throws(() => monthFigures([{ transaction_type: "expense", currency: "USD", total: null, count: "1" }]), /amount/)
  assert.throws(() => monthFigures([{ transaction_type: "expense", currency: "USD", total: "5.00", count: "x" }]), /count/)
})

ok("the budget figure is the monthly budgets only; every active budget is counted", () => {
  const f = budgetFigures([
    { period: "monthly", currency: "USD", total: "900.00", count: "3" },
    { period: "weekly", currency: "USD", total: "100.00", count: "1" },
    { period: "yearly", currency: "USD", total: "1200.00", count: "1" },
  ])
  assert.deepEqual(f, { monthlyBudget: 900, monthlyBudgetCount: 3, budgetCount: 5, currency: "USD" })
})

ok("no budgets is a true zero; monthly budgets in two currencies give no total", () => {
  assert.deepEqual(budgetFigures([]), { monthlyBudget: 0, monthlyBudgetCount: 0, budgetCount: 0, currency: null })
  assert.deepEqual(budgetFigures([
    { period: "monthly", currency: "USD", total: "900.00", count: "3" },
    { period: "monthly", currency: "GHS", total: "50.00", count: "1" },
  ]), { monthlyBudget: null, monthlyBudgetCount: 4, budgetCount: 4, currency: null })
  assert.throws(() => budgetFigures([{ period: "monthly", currency: "USD", total: "x", count: "1" }]), /amount/)
})

ok("the activity line says which way the money went, in the transaction's own currency", () => {
  assert.deepEqual(transactionLine({ transaction_type: "expense", amount: "12.5", currency: "USD", category: "Food & Dining" }), { action: "spent", description: "-$12.50 - Food & Dining" })
  assert.deepEqual(transactionLine({ transaction_type: "income", amount: "2000", currency: "USD", category: "Salary" }), { action: "received", description: "+$2,000.00 - Salary" })
  assert.deepEqual(transactionLine({ transaction_type: "expense", amount: "9", currency: "EUR", category: null }), { action: "spent", description: "-€9.00 - Uncategorized" })
})

ok("a transfer is money moved, not money spent", () => {
  assert.deepEqual(transactionLine({ transaction_type: "transfer", amount: "500", currency: "USD", category: null }), { action: "moved", description: "$500.00 - Transfer" })
})

ok("a currency code the formatter does not know is shown as written", () => {
  assert.equal(transactionLine({ transaction_type: "expense", amount: "3", currency: "ZZ", category: "Fees" }).description, "-ZZ 3.00 - Fees")
  assert.equal(transactionLine({ transaction_type: "expense", amount: "3", currency: null, category: "Fees" }).description, "-$3.00 - Fees")
})

console.log(`\n${n} checks passed`)
