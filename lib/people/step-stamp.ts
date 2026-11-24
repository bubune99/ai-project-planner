/**
 * When each step of a use case last changed, kept by the server on every save.
 *
 * Owner, 2026-11-23 (card 9b43ac44): when a feature changes "the use cases and steps it adds or changes are logged"
 * and shown "as new or changed steps not yet walked". A ship to a step's page already marks it changed; a step whose
 * words or control changed with no ship (a use case updated to match what was built) was not. A step's `changedAt` is
 * set when it is added or when what it does, expects or points at changes, and a walk before that time is owed again
 * (step-coverage.ts). The sender's own `changedAt` is never trusted: it is taken from what was stored.
 *
 * Pure: the time is passed in. Checked in step-stamp.assert.ts.
 */
import { everyStep, sameRef, type FlowDoc, type Step } from "./people-model"

const moved = (a: Step, b: Step) => a.does !== b.does || a.expects !== b.expects || !(sameRef(a.ref, b.ref) || (!a.ref && !b.ref))

export function stampChangedSteps(before: FlowDoc, after: FlowDoc, now: string): FlowDoc {
  const was = new Map(before.flows.flatMap((f) => everyStep(f).map((s) => [`${f.id}|${s.id}`, s] as const)))
  // A use case that is new as a whole has nothing to compare with: its steps are new, and "never walked" says so already.
  const knownFlows = new Set(before.flows.map((f) => f.id))
  const stamp = (flowId: string) => (s: Step): Step => {
    const { changedAt: _sent, ...rest } = s
    const p = was.get(`${flowId}|${s.id}`)
    const at = !knownFlows.has(flowId) ? undefined : !p ? now : moved(p, s) ? now : p.changedAt
    return { ...rest, ...(at ? { changedAt: at } : {}), ...(s.ways ? { ways: s.ways.map((w) => ({ ...w, steps: w.steps.map(stamp(flowId)) })) } : {}) }
  }
  return { ...after, flows: after.flows.map((f) => ({ ...f, steps: f.steps.map(stamp(f.id)) })) }
}
