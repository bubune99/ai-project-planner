/*
 * What a turn SHOULD cost, as pure rules the scenarios are held to.
 * No imports that run, no clock. Checked by cost-kit.assert.ts.
 */

import type { ModelCall } from "./fake-model"

/** A turn with this many tool rounds makes one call per round, plus one for the answer. */
export const callsFor = (toolRounds: number) => toolRounds + 1

export interface AgentShape {
  maxSteps: number
  /** Step caps of the specialists this agent may hand work to. */
  delegateMaxSteps: readonly number[]
}

/**
 * The most model calls one request can make: the agent's own step cap, plus
 * every delegate call it is allowed, each run to the largest specialist cap.
 */
export function maxCallsPerTurn(agent: AgentShape, maxDelegateCalls: number): number {
  const largest = agent.delegateMaxSteps.length ? Math.max(...agent.delegateMaxSteps) : 0
  return agent.maxSteps + maxDelegateCalls * largest
}

/**
 * Faults in how tool results were sent back to the model.
 *  - A tool result must not appear twice in one prompt (any agent).
 *  - Each call by `mainAgent` must carry exactly the results of its own earlier
 *    tool rounds, once each: nothing missing, nothing extra. (Order inside one
 *    round is not held: tools asked for together finish in any order.)
 * Returns one line per fault; empty means none.
 */
export function toolResultFaults(calls: readonly ModelCall[], mainAgent: string): string[] {
  const faults: string[] = []
  for (const c of calls) {
    const seen = new Set<string>()
    for (const id of c.toolResultIds) {
      if (seen.has(id)) faults.push(`call ${c.n} (${c.who}): tool result ${id} was sent twice in one prompt`)
      seen.add(id)
    }
  }
  const owed: string[] = []
  for (const c of calls) {
    if (c.who !== mainAgent) continue
    if ([...c.toolResultIds].sort().join(",") !== [...owed].sort().join(",")) {
      faults.push(`call ${c.n} (${c.who}): expected tool results [${owed.join(", ")}], was sent [${c.toolResultIds.join(", ")}]`)
    }
    ;(c.reply.tools ?? []).forEach((_, i) => owed.push(`call-${c.n}-${i + 1}`))
  }
  return faults
}

/**
 * Characters by which each call of `agent` outgrew its previous one. One round
 * adds its own reply and its own tool results; growth well past that means
 * something is being sent again.
 */
export function growthPerRound(calls: readonly ModelCall[], agent: string): number[] {
  const own = calls.filter((c) => c.who === agent)
  return own.slice(1).map((c, i) => c.charsSent - own[i].charsSent)
}
