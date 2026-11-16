/**
 * Choices in a use case: where a person can go one way or another.
 *
 * Owner, 2026-11-16: "The cards as flow can also show user branching decisions in the flow that need to be evaluated
 * too. Like a user at check out that has the cart go through or that decides to end the order".
 *
 * A step becomes a choice when it has two or more ways on. Each way has a name ("Pays", "Leaves the cart"), its own
 * steps, and either ends the use case or rejoins the main line at the next step. Ways do not hold further choices.
 * Each way is a path to walk and validate: a use case is proved only when every path is.
 *
 * Pure. Checked in branches.assert.ts.
 */
import { everyStep, type Step, type UseCase, type Way } from "./people-model"
export { MAX_WAYS, type Way } from "./people-model"

const waysOf = (s: Step): Way[] => s.ways ?? []
export const isChoice = (s: Step) => waysOf(s).length >= 2

/** Every step of a use case, main line and ways, in reading order. */
export const allSteps = everyStep

export interface Path { name: string; steps: Step[]; ends: "done" | "left" }
/**
 * The paths to walk. The first is the main line, taking the first way at every choice. Each other way gives one more
 * path: the main line up to its choice, that way, then (if it rejoins) the rest of the main line taking first ways.
 */
export function pathsOf(flow: Pick<UseCase, "steps" | "name">): Path[] {
  const follow = (from: number): { steps: Step[]; left: boolean } => {
    const out: Step[] = []
    for (let i = from; i < flow.steps.length; i++) {
      const s = flow.steps[i]; out.push(s)
      if (isChoice(s)) { const w = waysOf(s)[0]; out.push(...w.steps); if (w.ends) return { steps: out, left: true } }
    }
    return { steps: out, left: false }
  }
  const main = follow(0)
  const paths: Path[] = [{ name: flow.name, steps: main.steps, ends: main.left ? "left" : "done" }]
  flow.steps.forEach((s, i) => {
    if (!isChoice(s)) return
    waysOf(s).slice(1).forEach((w) => {
      const head: Step[] = []
      for (let k = 0; k <= i; k++) { const t = flow.steps[k]; head.push(t); if (k < i && isChoice(t)) head.push(...waysOf(t)[0].steps) }
      const rest = w.ends ? { steps: [], left: true } : follow(i + 1)
      paths.push({ name: `${flow.name}: ${w.label}`, steps: [...head, ...w.steps, ...rest.steps], ends: w.ends || rest.left ? "left" : "done" })
    })
  })
  return paths
}

export interface LaidBox { key: string; kind: "step" | "end"; stepId?: string; label?: string; x: number; y: number }
export interface LaidJoin { from: string; to: string; label?: string; out: "r" | "b" | "l" | "t"; into: "l" | "t" | "r" | "b" }
/**
 * Where the boxes go when a use case has choices: the main line runs left to right on the top lane; at a choice each
 * way after the first gets its own lane below, and the main line resumes after the longest way. A way that ends
 * finishes in a small "Ends here" box.
 */
export function branchLayout(flow: Pick<UseCase, "steps">, { w = 280, h = 250, gapX = 90, gapY = 70 } = {}): { boxes: LaidBox[]; joins: LaidJoin[]; width: number; height: number } {
  const boxes: LaidBox[] = [], joins: LaidJoin[] = []
  const X = (col: number) => col * (w + gapX), Y = (lane: number) => lane * (h + gapY)
  let col = 0, lanes = 1
  let tails: { key: string; lane: number; label?: string }[] = []   // what joins into the next main step
  for (const s of flow.steps) {
    const key = s.id
    boxes.push({ key, kind: "step", stepId: s.id, x: X(col), y: Y(0) })
    for (const t of tails) joins.push({ from: t.key, to: key, label: t.label, out: t.lane === 0 ? "r" : "r", into: t.lane === 0 ? "l" : "b" })
    tails = []
    if (!isChoice(s)) { tails = [{ key, lane: 0 }]; col++; continue }
    const ways = waysOf(s)
    let longest = 0
    ways.forEach((wy, k) => {
      const lane = k; lanes = Math.max(lanes, lane + 1)
      let prev = key, prevLane = 0, first = true
      wy.steps.forEach((st, j) => {
        boxes.push({ key: st.id, kind: "step", stepId: st.id, x: X(col + 1 + j), y: Y(lane) })
        joins.push({ from: prev, to: st.id, label: first ? wy.label : undefined, out: prevLane === lane ? "r" : "b", into: prevLane === lane ? "l" : "l" })
        prev = st.id; prevLane = lane; first = false
      })
      longest = Math.max(longest, wy.steps.length + (wy.ends ? 1 : 0))
      if (wy.ends) {
        const endKey = `end:${wy.id}`
        boxes.push({ key: endKey, kind: "end", label: wy.label, x: X(col + 1 + wy.steps.length), y: Y(lane) })
        joins.push({ from: prev, to: endKey, label: first ? wy.label : undefined, out: prevLane === lane ? "r" : "b", into: "l" })
      } else tails.push({ key: prev, lane: prevLane, label: first ? wy.label : undefined })
    })
    col += 1 + Math.max(1, longest)
  }
  return { boxes, joins, width: col > 0 ? X(col) - gapX : 0, height: Y(lanes) - gapY }
}
