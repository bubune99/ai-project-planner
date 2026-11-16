// npx -y tsx@4.23.15 lib/gates/ux-laws.assert.ts
import assert from "node:assert/strict"
import { UX_LAWS, lawsAt } from "./ux-laws"
import { intakeQuestions } from "./gate-model"
import { LENSES } from "../walks/walk-model"

assert.equal(UX_LAWS.length, 30, "every law on lawsofux.com")
for (const l of UX_LAWS) {
  assert.ok(l.where.length > 0, `${l.law} has a place`)
  for (const w of l.where) {
    const [kind, rest] = w.split(":")
    if (kind === "ask") {
      const [k, id] = rest.split(".")
      const qs = intakeQuestions(k === "any" ? "Link" : k)
      assert.ok(qs.some((q) => q.id === id), `${l.law}: the question ${w} exists`)
    } else if (kind === "walk") assert.ok([...LENSES, "expected"].includes(rest as never), `${l.law}: ${w} is a walk lens`)
    else assert.ok(["scan:targets", "owner"].includes(w), `${l.law}: ${w} is a known place`)
  }
}
// The reason under each new question names the laws it rests on, so an agent answering it sees them. Two older
// questions (List.narrow, any.purpose) already carry the idea in their own words.
const NAME = (law: string) => law.replace(/^Law of /, "").replace(/ (Effect|Law|Rule|Principle|Threshold)$/, "").replace(/'s$/, "")
for (const l of UX_LAWS) for (const w of l.where.filter((x) => x.startsWith("ask:") && x !== "ask:List.narrow" && x !== "ask:any.purpose")) {
  const [k, id] = w.slice(4).split(".")
  const q = intakeQuestions(k === "any" ? "Link" : k).find((x) => x.id === id)!
  assert.ok(`${q.ask} ${q.why}`.includes(NAME(l.law)), `${w} names ${l.law}`)
}
assert.deepEqual(lawsAt("ask:Menu.choices").sort(), ["Choice Overload", "Hick's Law", "Miller's Law", "Serial Position Effect"])
console.log(`ok   ${UX_LAWS.length} laws, each with a place that exists`)
