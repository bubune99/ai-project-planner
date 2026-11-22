// npx -y tsx@4.23.15 lib/finance/quick-capture.assert.ts
import assert from "node:assert/strict"
import { parseQuickTransaction, pickAccount } from "./quick-capture"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const TODAY = "2026-11-22"
const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const value = (body: unknown) => { const r = parseQuickTransaction(body, TODAY); assert.ok(r.ok, r.ok ? "" : r.message); return r.value }
const refused = (body: unknown, why: RegExp) => { const r = parseQuickTransaction(body, TODAY); assert.equal(r.ok, false); if (!r.ok) assert.match(r.message, why) }

ok("the least a quick transaction needs is an amount: it is an expense dated today", () => {
  assert.deepEqual(value({ amount: 12.5 }), { amount: 12.5, transactionType: "expense", description: null, merchant: null, notes: null, date: TODAY, accountId: null, categoryId: null, categoryName: null })
})

ok("everything given is kept, trimmed", () => {
  assert.deepEqual(value({ amount: "40", transactionType: "income", description: "  Refund ", merchant: " Shop ", notes: " n ", date: "2026-11-01", accountId: A, categoryId: B }),
    { amount: 40, transactionType: "income", description: "Refund", merchant: "Shop", notes: "n", date: "2026-11-01", accountId: A, categoryId: B, categoryName: null })
  assert.equal(value({ amount: 1, category: " Food " }).categoryName, "Food")
})

ok("the amount is a size: a minus sign is dropped and it is kept to the cent", () => {
  assert.equal(value({ amount: -12.345 }).amount, 12.35)
  assert.equal(value({ amount: "-7.10" }).amount, 7.1)
})

ok("an amount that is missing, zero, not a number or too large for the column is refused", () => {
  refused({}, /amount/i)
  refused({ amount: null }, /amount/i)
  refused({ amount: 0 }, /amount/i)
  refused({ amount: 0.001 }, /amount/i)
  refused({ amount: "12abc" }, /amount/i)
  refused({ amount: NaN }, /amount/i)
  refused({ amount: Infinity }, /amount/i)
  refused({ amount: true }, /amount/i)
  refused({ amount: 1e13 }, /amount/i)
  refused(null, /amount/i)
})

ok("only income or expense: a transfer needs two accounts and is not a quick entry", () => {
  refused({ amount: 1, transactionType: "transfer" }, /income or expense/)
  refused({ amount: 1, transactionType: "gift" }, /income or expense/)
})

ok("a date must be a real calendar day written YYYY-MM-DD", () => {
  refused({ amount: 1, date: "11/22/2026" }, /date/i)
  refused({ amount: 1, date: "2026-02-30" }, /date/i)
  refused({ amount: 1, date: 20261122 }, /date/i)
})

ok("an account or category id that is not an id is refused; text that is too long is refused", () => {
  refused({ amount: 1, accountId: "mine" }, /account/i)
  refused({ amount: 1, categoryId: "food" }, /category/i)
  refused({ amount: 1, merchant: "x".repeat(256) }, /merchant/i)
  refused({ amount: 1, description: 5 }, /description/i)
  refused({ amount: 1, category: "x".repeat(101) }, /category/i)
})

ok("the account: the one asked for if it is theirs, the only one if none was asked for, otherwise a question", () => {
  assert.deepEqual(pickAccount([{ id: A, currency: "USD" }, { id: B, currency: "EUR" }], B), { ok: true, account: { id: B, currency: "EUR" } })
  assert.deepEqual(pickAccount([{ id: A, currency: "USD" }], null), { ok: true, account: { id: A, currency: "USD" } })
  const none = pickAccount([], null); assert.equal(none.ok, false); if (!none.ok) assert.match(none.message, /Add an account/)
  const many = pickAccount([{ id: A, currency: "USD" }, { id: B, currency: "EUR" }], null); assert.equal(many.ok, false); if (!many.ok) assert.match(many.message, /which account/i)
  const notMine = pickAccount([{ id: A, currency: "USD" }], B); assert.equal(notMine.ok, false); if (!notMine.ok) assert.match(notMine.message, /not found/i)
})

console.log(`\n${n} checks passed`)
