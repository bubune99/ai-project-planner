import assert from "node:assert/strict"
import {
  EXPORT_FORMAT, EXPORT_GROUPS, EXPORT_VERSION, NOT_INCLUDED,
  buildExport, exportFileName, exportSummary, isSecretField, scrub,
  type ExportKey, type GroupRead,
} from "./export-model"

let n = 0
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n++ }
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n++ }

const NOW = new Date("2026-11-22T15:04:05.000Z")
const ACCOUNT = { id: "u1", email: "sample@example.com", name: "Sample Person" }

// ── The list of what goes in ────────────────────────────────────────────────
const keys = EXPORT_GROUPS.map((g) => g.key)
eq(new Set(keys).size, keys.length, "every group has its own key")
ok(EXPORT_GROUPS.every((g) => g.label && g.section && g.table && g.filter), "every group names its table and how it is filtered to the person")
ok(EXPORT_GROUPS.every((g) => Number.isInteger(g.cap) && g.cap > 0), "every group has a row limit")
ok(EXPORT_GROUPS.every((g) => /^[a-z_]+$/.test(g.key)), "keys are plain words")
// Tables that hold only secrets or other people's sessions are never a group.
for (const banned of ["oauth_auth_codes", "oauth_clients", "project_invitations", "rate_limit_counters"]) {
  ok(!EXPORT_GROUPS.some((g) => g.table === banned), `${banned} is never exported`)
}
ok(NOT_INCLUDED.length > 0 && NOT_INCLUDED.every((s) => s.length > 10), "what is left out is said in words")

// ── Secret fields, by name ──────────────────────────────────────────────────
for (const name of [
  "key_hash", "keyHash", "token_hash", "password", "password_hash", "passwordHash", "token", "access_token",
  "accessToken", "refresh_token", "id_token", "client_secret", "secret", "api_key", "apiKey", "p256dh", "auth",
  "authorization", "private_key", "stack_auth_id", "session_token", "webhook_secret",
]) ok(isSecretField(name), `${name} is a secret field`)
for (const name of [
  "id", "name", "email", "key_prefix", "title", "content", "author_name", "max_tokens_per_request", "tokens",
  "token_budget", "created_at", "scopes", "authority", "auth_type", "hashtags",
]) ok(!isSecretField(name), `${name} is not a secret field`)

// ── Scrubbing a value ───────────────────────────────────────────────────────
const made = new Date("2026-01-02T03:04:05.000Z")
const row = {
  id: "k1", name: "Laptop", key_prefix: "aipp_abc123", key_hash: "deadbeef", created_at: made,
  metadata: { note: "fine", accessToken: "t0p", nested: [{ password: "x", keep: 1 }] },
}
const s = scrub(row)
eq(s.value, { id: "k1", name: "Laptop", key_prefix: "aipp_abc123", created_at: made, metadata: { note: "fine", nested: [{ keep: 1 }] } }, "named secret fields are dropped at every depth")
eq(s.removed, 3, "and counted")
ok((s.value as { created_at: unknown }).created_at instanceof Date, "a date stays a date")
eq(row.key_hash, "deadbeef", "the row passed in is not changed")
ok("accessToken" in row.metadata, "nor anything inside it")

// A device's address and keys are secrets for that group only: "endpoint" elsewhere is ordinary.
const device = { id: "d1", endpoint: "https://push.example/abc", p256dh: "pk", auth: "au", updated_at: made }
eq(scrub(device, ["endpoint"]).value, { id: "d1", updated_at: made }, "a device keeps no address and no keys")
eq(scrub(device, ["endpoint"]).removed, 3, "three fields dropped from a device")
eq(scrub({ endpoint: "/api/x" }).value, { endpoint: "/api/x" }, "endpoint is kept where it is not a secret")

// A planner key pasted into text is blanked, wherever the text sits.
const pasted = scrub({ content: "use Bearer aipp_AbCdEf0123456789_xyz-9 please", parts: ["aipp_ZZZZZZZZZZZZ"] })
eq(pasted.value, { content: "use Bearer aipp_[removed] please", parts: ["aipp_[removed]"] }, "a pasted key is blanked")
eq(pasted.removed, 2, "and counted")
eq(scrub({ key_prefix: "aipp_abc123" }).value, { key_prefix: "aipp_abc123" }, "a short key prefix is not a key")
eq(scrub(null).value, null, "null stays null")
eq(scrub("plain").value, "plain", "text stays text")

// ── Building the file ───────────────────────────────────────────────────────
const reads: Partial<Record<ExportKey, GroupRead>> = {}
for (const g of EXPORT_GROUPS) reads[g.key] = { rows: [] }
reads.api_keys = { rows: [row] }
reads.devices = { rows: [device, device] }
reads.todos = { rows: [{ id: "t1", title: "Buy paper" }, { id: "t2", title: "Call" }] }
reads.ideas = { error: 'relation "ideas" does not exist' }
delete reads.calendar_events

const file = buildExport({ now: NOW, account: { ...ACCOUNT, stack_auth_id: "st_1" } as typeof ACCOUNT, reads })
eq(file.format, EXPORT_FORMAT, "the file says what it is")
eq(file.version, EXPORT_VERSION, "and which version")
eq(file.exportedAt, "2026-11-22T15:04:05.000Z", "the time is the one passed in")
eq(file.account, ACCOUNT, "the account is named, without the sign-in id")
eq(Object.keys(file.data), keys, "every group is in the file, in the listed order")
eq(file.contents.map((c) => c.key), keys, "and in the table of contents")
eq(file.notIncluded, NOT_INCLUDED, "what is left out travels with the file")

const entry = (k: ExportKey) => file.contents.find((c) => c.key === k)!
eq(file.data.api_keys, [{ id: "k1", name: "Laptop", key_prefix: "aipp_abc123", created_at: made, metadata: { note: "fine", nested: [{ keep: 1 }] } }], "a key is listed by name, never its hash")
eq(file.data.devices, [{ id: "d1", updated_at: made }, { id: "d1", updated_at: made }], "devices carry no address or keys")
ok(!JSON.stringify(file).includes("deadbeef") && !JSON.stringify(file).includes("push.example") && !JSON.stringify(file).includes("st_1"), "no secret value is anywhere in the file")
eq(entry("todos").count, 2, "counts are the rows that are in the file")
eq(entry("todos").state, "complete", "a group read in full says so")
eq(entry("ideas"), { key: "ideas", label: entry("ideas").label, section: entry("ideas").section, count: 0, state: "failed" }, "a group that could not be read says so")
eq(file.data.ideas, [], "and holds nothing")
ok(!JSON.stringify(file).includes("does not exist"), "the database's own words are not put in the file")
eq(entry("calendar_events").state, "failed", "a group that was never read is failed, not empty")
eq(file.secretFieldsRemoved, 3 + 3 + 3 + 1, "the file says how many secret fields were dropped")
eq(file.complete, false, "a file with a failed group is not complete")

// The limit: the route reads one more than the limit; the file keeps the limit and says it was cut.
const cap = EXPORT_GROUPS.find((g) => g.key === "todos")!.cap
const many = Array.from({ length: cap + 1 }, (_, i) => ({ id: `t${i}` }))
const full: Partial<Record<ExportKey, GroupRead>> = {}
for (const g of EXPORT_GROUPS) full[g.key] = { rows: [] }
const cut = buildExport({ now: NOW, account: ACCOUNT, reads: { ...full, todos: { rows: many } } })
eq(cut.data.todos.length, cap, "no more than the limit is kept")
eq((cut.data.todos[0] as { id: string }).id, "t0", "the first rows read are the ones kept")
eq(cut.contents.find((c) => c.key === "todos"), { key: "todos", label: entry("todos").label, section: entry("todos").section, count: cap, state: "cut", limit: cap }, "and the file says it was cut, and at what")
eq(cut.complete, false, "a cut file is not complete")
const exact = buildExport({ now: NOW, account: ACCOUNT, reads: { ...full, todos: { rows: many.slice(0, cap) } } })
eq(exact.contents.find((c) => c.key === "todos")!.state, "complete", "exactly the limit is not cut")
eq(exact.complete, true, "everything read in full is complete")
eq(exact.secretFieldsRemoved, 0, "nothing dropped when there was nothing to drop")

// ── The file's name and the words on the page ───────────────────────────────
eq(exportFileName(NOW), "planner-export-2026-11-22.json", "the name carries the day passed in")
eq(exportFileName(new Date("2026-01-05T23:59:59.000Z")), "planner-export-2026-01-05.json", "padded")
const summary = exportSummary()
eq(summary.flatMap((x) => x.labels).length, EXPORT_GROUPS.length, "the page lists every group once")
eq(new Set(summary.map((x) => x.section)).size, summary.length, "one line per section")
eq(summary[0].section, EXPORT_GROUPS[0].section, "in the listed order")

console.log(`export-model: ${n} checks pass`)
