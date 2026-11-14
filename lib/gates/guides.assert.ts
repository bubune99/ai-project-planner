import assert from "node:assert/strict"
import { toRules, validateGuide, type Guide } from "./guides"
import { DEFAULT_GUIDES } from "./default-guides"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const G = (o: Partial<Guide> = {}): Guide => ({ id: "1", kind: "stack", name: "Stripe", summary: "Payments", applies: { imports: ["stripe"] }, checks: [{ id: "test-run", say: "Run it in test mode" }], status: "active", source: "owner", basis: "Owner said so", ...o })

ok("a sound guide has no issues; a broken one says what is wrong", () => {
  assert.deepEqual(validateGuide(G()), [])
  const bad = (o: Partial<Guide>) => validateGuide(G(o)).map((i) => i.message).join(" / ")
  assert.match(bad({ name: " " }), /needs a name/)
  assert.match(bad({ basis: "" }), /where it comes from/)
  assert.match(bad({ applies: {} }), /which files/)
  assert.match(bad({ checks: [] }), /at least one check/)
  assert.match(bad({ checks: [{ id: "Bad Id", say: "x" }] }), /lowercase/)
  assert.match(bad({ checks: [{ id: "a1", say: "x" }, { id: "a1", say: "y" }] }), /share this id/)
  assert.match(bad({ checks: [{ id: "a1", say: "x", auto: "eval:rm" }] }), /auto must be/)
  assert.match(bad({ checks: [{ id: "a1", say: "x", auto: "forbids:(" }] }), /not a valid/)
})

ok("guides compile to one rule per check per file pattern; drafts hold nobody up", () => {
  const rules = toRules([G(), G({ id: "2", name: "No monospace type", kind: "statement", applies: { files: ["**/*.tsx", "**/*.css"] }, checks: [{ id: "none", say: "No monospace", auto: "forbids:font-mono" }] }), G({ id: "3", name: "Draft idea", status: "draft" })])
  assert.deepEqual(rules.map((r) => r.id), ["stripe-test-run", "no-monospace-type-none", "no-monospace-type-none"])
  assert.deepEqual(rules[0], { id: "stripe-test-run", match: "**/*.{ts,tsx,js,jsx,mjs}", from: "Stripe", imports: ["stripe"], manual: "Run it in test mode" })
  assert.equal(rules[1].auto, "forbids:font-mono")
  assert.equal(rules[1].say, "No monospace")
  assert.equal(rules[1].manual, undefined)
  assert.deepEqual(rules.slice(1).map((r) => r.match), ["**/*.tsx", "**/*.css"])
})

ok("the starting set is sound, names are unique, and it covers the stack the owner named", () => {
  for (const g of DEFAULT_GUIDES) assert.deepEqual(validateGuide({ ...g, id: "x" }), [], g.name)
  assert.equal(new Set(DEFAULT_GUIDES.map((g) => g.name)).size, DEFAULT_GUIDES.length)
  const stack = DEFAULT_GUIDES.filter((g) => g.kind === "stack").map((g) => g.name).join(" ")
  for (const tool of ["Next.js", "Vercel", "Cloudflare", "Stripe", "Hexclave", "React Flow", "shadcn", "Radix", "Zustand"]) assert.ok(stack.includes(tool), tool)
  assert.ok(DEFAULT_GUIDES.filter((g) => g.kind === "statement").every((g) => /Owner, 20\d\d/.test(g.basis)))
})

ok("the automatic statement patterns catch what they are meant to and leave good code alone", () => {
  const rule = (name: string) => new RegExp(toRules(DEFAULT_GUIDES.map((g, i) => ({ ...g, id: String(i) }))).find((r) => r.from === name)!.auto!.replace(/^forbids:/, ""))
  assert.ok(rule("No monospace type").test('<span className="font-mono text-xs">'))
  assert.ok(rule("No monospace type").test("font-family: ui-monospace, Menlo;"))
  assert.ok(!rule("No monospace type").test('<span className="font-medium">monthly</span>'))
  assert.ok(rule("No colored side-stripes").test('className="border-l-4 border-blue-500"'))
  assert.ok(rule("No colored side-stripes").test("border-left: 3px solid var(--accent);"))
  assert.ok(!rule("No colored side-stripes").test('className="border-l border-line"'))
  assert.ok(rule("US English").test("Choose your favourite colour"))
  assert.ok(!rule("US English").test("Choose your favorite color in the center"))
})

console.log(`\n${n} checks passed`)
