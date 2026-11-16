// npx -y tsx@4.23.15 lib/work/proposal.assert.ts
import assert from "node:assert/strict"
import { proposalText, readProposal } from "./proposal"

const good = { title: "Search finds tasks by their words", goal: "Find the task I was working on yesterday", useCase: "Pick up where I left off", what: "The search box matches task titles and descriptions", deliverable: "Search results list matching tasks with their project", proof: "On staging, typing a word from a task's description lists that task", why: "The walk typed a word from a task and got nothing", foundBy: "walk" }
const r = readProposal(good)
assert.deepEqual(r.errors, [])
assert.equal(r.proposal!.foundBy, "walk")
assert.match(proposalText(r.proposal!), /^Goal it serves: Find the task I was working on yesterday \(use case: Pick up where I left off\)\nWhat it does: .*\nDelivered: .*\nProved by: .*\nWhy: The walk typed .* \(found by walking the goal\)$/)
console.log("ok   a full proposal is read and written for the owner to approve")

const missing = readProposal({ title: "Search finds tasks", goal: "Find a task" })
assert.deepEqual(missing.errors, ["what is required", "deliverable is required", "proof is required", "why is required"])
console.log("ok   a proposal must say what it does, what is delivered, how it is proved and why")

assert.ok(readProposal({ ...good, proof: "tested" }).errors.includes("proof must say what will be seen or run, and where"))
assert.ok(readProposal({ ...good, title: "Improve search" }).errors.some((e) => /title must say what the feature does/.test(e)))
assert.equal(readProposal({ ...good, foundBy: "guess" }).proposal!.foundBy, "reading")
console.log("ok   vague titles and proofs are refused")
