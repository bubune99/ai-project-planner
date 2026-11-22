/* Run: npx -y tsx@4.23.15 lib/agents/cost-kit/cost-kit.assert.ts
 *
 * Zero-token cost check for the planner's in-app agents (card 4295801e).
 * Whole chat turns run through the real runtime and the real AI SDK loop
 * against a fake model. No network, no key, no database: a run that reaches
 * any of them throws. Fails when a turn makes more model calls than
 * (tool rounds + 1), when a cap stops holding, or when a refusal still calls
 * the model.
 */
import { AGENTS } from "../catalog"
import { REGISTRY } from "../registry"
import { MAX_DELEGATE_CALLS } from "../../ai/spend-limits"
import { fakeModel, estimateTokens, ScriptExhausted, type Reply, type ModelCall } from "./fake-model"
import { callsFor, growthPerRound, maxCallsPerTurn, toolResultFaults } from "./rules"
import { runTurn, reached, RealModelReached } from "./harness"

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, detail?: unknown) => { if (cond) pass++; else { fail++; console.error(`FAIL ${name}`, detail ?? "") } }
const eq = (name: string, actual: unknown, expected: unknown) => ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)

const round = (...names: string[]): Reply => ({ tools: names.map((name) => ({ name })) })
const rounds = (n: number, name: string): Reply[] => Array.from({ length: n }, () => round(name))
const hand = (agent: string): { name: string; input: Record<string, unknown> } =>
  ({ name: "delegate", input: { agent, task: "Find what the records say about onboarding and report it." } })
const lines: string[] = []
const note = (scenario: string, calls: readonly ModelCall[]) =>
  lines.push(`  ${scenario.padEnd(46)} ${String(calls.length).padStart(3)} calls  ${String(calls.reduce((s, c) => s + c.tokensSent, 0)).padStart(7)} tokens sent (est.)`)

async function fakeModelItself() {
  // The counter must be right before anything is counted with it.
  const m = fakeModel({ scripts: { a: [round("x"), { text: "done" }] }, who: () => "a" })
  const model = m.forId("any-model")
  const prompt = [{ role: "system" as const, content: "s" }, { role: "user" as const, content: [{ type: "text" as const, text: "q" }] }]
  const first = await model.doGenerate({ prompt })
  eq("fake: a tool round finishes as tool-calls", first.finishReason, "tool-calls")
  const second = await model.doGenerate({ prompt })
  eq("fake: the answer finishes as stop", [second.finishReason, second.content], ["stop", [{ type: "text", text: "done" }]])
  eq("fake: counts each call once", m.calls.map((c) => c.n), [1, 2])
  eq("fake: tokens sent are characters / 4, rounded up", m.calls[0].tokensSent, estimateTokens(JSON.stringify(prompt).length + 2))
  let threw: unknown
  try { await model.doGenerate({ prompt }) } catch (e) { threw = e }
  ok("fake: a call past the script throws", threw instanceof ScriptExhausted, threw)
  eq("fake: and is kept as an overrun", m.overruns.length, 1)
}

function rulesThemselves() {
  const call = (n: number, who: string, ids: string[], tools: number): ModelCall =>
    ({ n, who, mode: "stream", modelId: "m", messages: 1, charsSent: n * 100, tokensSent: n * 25, toolResultIds: ids, reply: tools ? round(...Array(tools).fill("t")) : { text: "a" } })
  eq("rule: rounds + 1", [callsFor(0), callsFor(1), callsFor(2)], [1, 2, 3])
  eq("rule: a clean turn has no faults", toolResultFaults([call(1, "j", [], 2), call(2, "j", ["call-1-1", "call-1-2"], 0)], "j"), [])
  ok("rule: a result sent twice is a fault", toolResultFaults([call(1, "j", [], 1), call(2, "j", ["call-1-1", "call-1-1"], 0)], "j").length === 2)
  ok("rule: a missing result is a fault", toolResultFaults([call(1, "j", [], 1), call(2, "j", [], 0)], "j").length === 1)
  eq("rule: results of one round may come back in any order", toolResultFaults([call(1, "j", [], 2), call(2, "j", ["call-1-2", "call-1-1"], 0)], "j"), [])
  ok("rule: an extra result is a fault", toolResultFaults([call(1, "j", [], 1), call(2, "j", ["call-1-1", "call-9-1"], 0)], "j").length === 1)
  eq("rule: growth is per round", growthPerRound([call(1, "j", [], 1), call(2, "x", [], 0), call(3, "j", [], 0)], "j"), [200])
  eq("rule: worst case adds every delegate at the largest cap", maxCallsPerTurn({ maxSteps: 12, delegateMaxSteps: [16, 14] }, 3), 60)
  eq("rule: no delegates, no extra", maxCallsPerTurn({ maxSteps: 16, delegateMaxSteps: [] }, 3), 16)
}

async function main() {
  await fakeModelItself()
  rulesThemselves()

  // 1. A plain answer: one model call, and the person reads that call's text.
  for (const a of AGENTS) {
    const r = await runTurn({ agent: a.id, scripts: { [a.id]: [{ text: "You have 3 projects." }] } })
    eq(`${a.id}, plain answer: 1 model call`, r.calls.length, callsFor(0))
    eq(`${a.id}, plain answer: shown once, as generated`, [r.shown, r.answer], ["You have 3 projects.", "You have 3 projects."])
    eq(`${a.id}, plain answer: no tool runs`, r.toolsRun, [])
    eq(`${a.id}, plain answer: metered once, what the model reported`, [r.recorded.length, r.metered], [1, r.recorded[0]])
    eq(`${a.id}, plain answer: it is the streaming call`, r.calls[0].mode, "stream")
    note(`${a.id}: plain answer`, r.calls)
  }

  // 2. N tool rounds: N + 1 calls, never N + 2 (no second pass to write the answer).
  {
    const r = await runTurn({ agent: "jarvis", scripts: { jarvis: [round("list_projects"), { text: "You have 3 projects." }] } })
    eq("1 tool round: 2 model calls", r.calls.length, callsFor(1))
    eq("1 tool round: the tool ran once", r.toolsRun, ["list_projects"])
    eq("1 tool round: tool results go back once", toolResultFaults(r.calls, "jarvis"), [])
    note("jarvis: 1 tool round", r.calls)
  }
  {
    const answer = "Two are overdue."
    const r = await runTurn({
      agent: "jarvis",
      scripts: { jarvis: [{ text: "Let me look.", tools: [{ name: "list_projects" }] }, round("project_workload", "get_agenda"), { text: answer }] },
    })
    eq("2 tool rounds: 3 model calls", r.calls.length, callsFor(2))
    eq("2 tool rounds: every tool call ran once, in order", r.toolsRun, ["list_projects", "project_workload", "get_agenda"])
    eq("2 tool rounds: each call carries the earlier rounds' results once", toolResultFaults(r.calls, "jarvis"), [])
    eq("2 tool rounds: the last call sees all three results", r.calls[2].toolResultIds, ["call-1-1", "call-2-1", "call-2-2"])
    eq("2 tool rounds: the answer is generated by exactly one call", r.calls.filter((c) => c.reply.text === answer).length, 1)
    eq("2 tool rounds: the saved reply is the last call's text", r.answer, answer)
    eq("2 tool rounds: the person is shown each text once", r.shown, "Let me look." + answer)
    eq("2 tool rounds: every step is metered once", r.recorded.length, 3)
    note("jarvis: 2 tool rounds", r.calls)
  }

  // 3. A large tool result is sent back once per later call, not twice.
  {
    const size = 4000
    const r = await runTurn({
      agent: "jarvis",
      scripts: { jarvis: [round("read_document"), round("list_todos"), { text: "Done." }] },
      toolResult: (name) => (name === "read_document" ? "d".repeat(size) : "ok"),
    })
    const [first, second] = growthPerRound(r.calls, "jarvis")
    ok("large result: the round that produced it grows the prompt by about its size", first >= size && first < size * 1.5, first)
    ok("large result: the next round does not add it again", second < size / 2, second)
    eq("large result: no result is doubled", toolResultFaults(r.calls, "jarvis"), [])
    note("jarvis: 2 rounds, one 4,000-character result", r.calls)
  }

  // 4. The round limit stops the loop: a model that always asks for tools gets maxSteps calls and no more.
  for (const a of AGENTS) {
    const cap = REGISTRY[a.id].maxSteps
    const tool = REGISTRY[a.id].tools[0]
    const r = await runTurn({ agent: a.id, scripts: { [a.id]: rounds(cap + 5, tool) } })
    eq(`${a.id}, tools every round: stops at its cap of ${cap}`, r.calls.length, cap)
    eq(`${a.id}, tools every round: every round's tool still ran`, r.toolsRun.length, cap)
    eq(`${a.id}, tools every round: there is no answer text`, [r.answer, r.shown], ["", ""])
    note(`${a.id}: tools every round (cap ${cap})`, r.calls)
  }

  // 5. The request budget stops the loop after the step that spent it.
  {
    const r = await runTurn({ agent: "jarvis", scripts: { jarvis: [...rounds(3, "list_projects"), { text: "x" }] }, env: { AI_REQUEST_TOKEN_LIMIT: "1" } })
    eq("budget spent on the first step: no second call", r.calls.length, 1)
    ok("budget spent: what was metered is over the limit", r.metered > 1, r.metered)
  }
  {
    const r = await runTurn({ agent: "jarvis", scripts: { jarvis: [...rounds(3, "list_projects"), { text: "x" }] }, recordFails: true })
    eq("usage cannot be recorded: the run stops after that step", r.calls.length, 1)
  }

  // 6. A refusal at the door makes no model call at all.
  {
    const script = { jarvis: [{ text: "should never be asked for" }] }
    const off = await runTurn({ agent: "jarvis", scripts: script, env: { AI_DISABLED: "1" } })
    eq("switched off: refused, 0 calls", [off.admitted, off.refusal, off.calls.length], [false, "AI_DISABLED", 0])
    const spent = await runTurn({ agent: "jarvis", scripts: script, env: { AI_USER_TOKEN_LIMIT: "1000" }, usage: { user: 1000, global: 0 } })
    eq("person's limit reached: refused, 0 calls", [spent.refusal, spent.calls.length], ["USER_LIMIT", 0])
    const site = await runTurn({ agent: "jarvis", scripts: script, env: { AI_GLOBAL_TOKEN_LIMIT: "1000" }, usage: { user: 0, global: 1000 } })
    eq("site limit reached: refused, 0 calls", [site.refusal, site.calls.length], ["GLOBAL_LIMIT", 0])
    const blind = await runTurn({ agent: "jarvis", scripts: script, usage: null })
    eq("usage unreadable: refused, 0 calls", [blind.refusal, blind.calls.length], ["USAGE_UNAVAILABLE", 0])
    const under = await runTurn({ agent: "jarvis", scripts: script, env: { AI_USER_TOKEN_LIMIT: "1000" }, usage: { user: 999, global: 0 } })
    eq("one token under the limit: admitted, 1 call", [under.admitted, under.calls.length], [true, 1])
  }

  // 7. Handing work to a specialist: its calls are its own rounds + 1, on top of the main agent's.
  {
    const r = await runTurn({
      agent: "jarvis",
      scripts: {
        jarvis: [{ tools: [hand("researcher")] }, { text: "The records say X." }],
        researcher: [round("search_memory"), { text: "X, per document 12." }],
      },
    })
    eq("one delegate: main agent 2 calls, specialist 2 calls", r.callsBy, { jarvis: 2, researcher: 2 })
    eq("one delegate: the specialist's call is the one-shot kind", r.calls.filter((c) => c.who === "researcher").map((c) => c.mode), ["generate", "generate"])
    eq("one delegate: its tool ran once", r.toolsRun, ["search_memory"])
    eq("one delegate: its tokens are metered with the main agent's", r.recorded.length, 4)
    eq("one delegate: counted against the delegate allowance", r.delegatesUsed, 1)
    note("jarvis: hands one task to the researcher", r.calls)
  }
  {
    // One more delegate than allowed, all asked for in one round.
    const asks = Array.from({ length: MAX_DELEGATE_CALLS + 1 }, () => hand("researcher"))
    const r = await runTurn({
      agent: "jarvis",
      scripts: { jarvis: [{ tools: asks }, { text: "Done." }], researcher: Array.from({ length: MAX_DELEGATE_CALLS + 1 }, () => ({ text: "Found it." })) },
    })
    eq(`${MAX_DELEGATE_CALLS + 1} delegates asked: only ${MAX_DELEGATE_CALLS} run, the refused one calls no model`, r.callsBy, { jarvis: 2, researcher: MAX_DELEGATE_CALLS })
  }
  {
    // A specialist that never stops asking for tools is held to its own cap.
    const cap = REGISTRY.researcher.maxSteps
    const r = await runTurn({
      agent: "jarvis",
      scripts: { jarvis: [{ tools: [hand("researcher")] }, { text: "It found nothing." }], researcher: rounds(cap + 5, "search_memory") },
    })
    eq(`runaway specialist: held to its cap of ${cap}`, r.callsBy, { jarvis: 2, researcher: cap })
  }

  // 8. The worst a single request can do, run for real: every cap hit at once.
  {
    const j = REGISTRY.jarvis
    const worst = maxCallsPerTurn({ maxSteps: j.maxSteps, delegateMaxSteps: j.delegates.map((d) => REGISTRY[d].maxSteps) }, MAX_DELEGATE_CALLS)
    const r = await runTurn({
      agent: "jarvis",
      env: { AI_REQUEST_TOKEN_LIMIT: "999999999" },
      scripts: {
        jarvis: [{ tools: Array.from({ length: MAX_DELEGATE_CALLS + 2 }, () => hand("operator")) }, ...rounds(j.maxSteps + 5, "list_projects")],
        operator: rounds(MAX_DELEGATE_CALLS * REGISTRY.operator.maxSteps + 20, "get_project_context"),
      },
    })
    eq(`worst case: ${worst} model calls and not one more`, r.calls.length, worst)
    eq("worst case: split as the caps say", r.callsBy, { jarvis: j.maxSteps, operator: MAX_DELEGATE_CALLS * REGISTRY.operator.maxSteps })
    eq("worst case: no tool result doubled in any prompt", toolResultFaults(r.calls, "jarvis"), [])
    note("jarvis: every cap hit (token budget lifted)", r.calls)
  }
  {
    // The same runaway under the default request budget (300,000 tokens) stops when the budget says so.
    const j = REGISTRY.jarvis
    const r = await runTurn({
      agent: "jarvis",
      scripts: { jarvis: rounds(j.maxSteps + 5, "read_document") },
      toolResult: () => "d".repeat(400_000),
    })
    ok("default budget: a turn fed huge results stops before its step cap", r.calls.length < j.maxSteps, r.calls.length)
    note("jarvis: 400,000-character results, default budget", r.calls)
  }

  // 9. Nothing real was reached by any scenario above.
  eq("no scenario touched the network", reached.network, [])
  eq("no scenario touched the database", reached.database, [])

  // 10. And the kit refuses to continue if the real client is ever reached.
  {
    let threw: unknown
    try { await runTurn({ agent: "jarvis", scripts: { jarvis: [{ text: "x" }] }, realModel: true }) } catch (e) { threw = e }
    ok("real client reached: the kit throws", threw instanceof RealModelReached, threw)
    ok("real client reached: the request was stopped before it left", reached.network.length === 1 && /anthropic/.test(reached.network[0]), reached.network)
  }

  console.log("What each scenario cost (fake model; tool definitions are stand-ins, so tokens are a floor):")
  for (const l of lines) console.log(l)
  console.log(`cost-kit.assert: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
