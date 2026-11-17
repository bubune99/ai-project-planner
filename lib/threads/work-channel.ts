/**
 * The two-way channel between the platform side and a coding session (card f56c9ba0). Pure: no database, no
 * clock. Check file: work-channel.assert.ts.
 *
 * Owner, 2026-11-14: "a way for that agent to prompt you based on its findings ... It can request you to perform a
 * check or take a screenshot. It is meant to keep you honest. Say when you finish something, a hook to say that you
 * have finished, it then knows to see something else in the queue that you can be working on and either assign it
 * to you or have you put up a queue question for me."
 *
 * The platform side here is rules, not a model: a finish claim is compared with what the planner holds (the ship
 * record, the before/after pair, what was said), and either accepted, with the next card assigned, or sent back with
 * a request for each missing piece. It never accepts "ok" as proof, never approves production, never changes a rule.
 */
export type MessageKind = "request" | "result" | "finished" | "accepted" | "sent_back" | "assign" | "question"
export const KINDS: readonly MessageKind[] = ["request", "result", "finished", "accepted", "sent_back", "assign", "question"]

/** Words that are not proof on their own (owner: "Looks fine is not proof"). */
const EMPTY = /^(ok(ay)?|done|fixed|works?|looks? (fine|good)|all good|lgtm|verified|passed|yes|ship(ped)?|it works)[.!]*$/i

/** Proof says what was seen: at least a few words, and not only an empty word. */
export function isRealProof(text: unknown): boolean {
  const t = String(text ?? "").trim()
  if (EMPTY.test(t)) return false
  return t.split(/\s+/).filter(Boolean).length >= 5
}

export interface FinishClaim {
  taskId: string
  sha?: string | null
  /** The change can be seen on a screen (then a before/after pair is owed). */
  visible?: boolean
  proof: string
}

export interface Evidence {
  /** Ship records whose commit starts with the claim's sha (or the sha with them). */
  ships: { env: string; sha: string; note: string | null }[]
  /** Before/after pairs recorded for that build. */
  changes: { stage: string | null; build: string | null }[]
  /** The card's status kind now. */
  cardKind: "open" | "active" | "done" | "closed" | null
}

export interface Review { verdict: "accepted" | "sent_back"; requests: string[] }

export function sameCommit(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a ?? "").toLowerCase(), y = String(b ?? "").toLowerCase()
  if (x.length < 7 || y.length < 7) return false
  return x.startsWith(y) || y.startsWith(x)
}

export function reviewFinish(claim: FinishClaim, ev: Evidence): Review {
  const requests: string[] = []
  if (!isRealProof(claim.proof)) requests.push("Say what you saw and where (the address, the value read off the page or the output). \"Done\" or \"ok\" is not proof.")
  if (!claim.sha) {
    requests.push("Name the commit that carries the change, so it can be matched with its ship record.")
  } else {
    const ships = ev.ships.filter((s) => sameCommit(s.sha, claim.sha))
    if (!ships.length) requests.push(`No ship record for ${claim.sha.slice(0, 8)}. After the build is live, check it in the running page and record it: gates shipped ${claim.sha.slice(0, 8)} --saw "<what you saw, on which address>".`)
    else if (!ships.some((s) => isRealProof(s.note))) requests.push(`The ship record for ${claim.sha.slice(0, 8)} does not say what was seen. Record it again with what you saw.`)
    if (claim.visible && !ev.changes.some((c) => sameCommit(c.build, claim.sha))) {
      requests.push(`This change can be seen, but there is no before/after pair for ${claim.sha.slice(0, 8)}. Send one (gates change after --build ${claim.sha.slice(0, 8)}) so the owner can judge it.`)
    }
  }
  if (ev.cardKind && ev.cardKind !== "done") requests.push("The card is not finished on the board. Close it with the proof (gates shipped --closes), or say what is left (--advances --left).")
  return { verdict: requests.length ? "sent_back" : "accepted", requests }
}

export interface Card { id: string; title: string; priority: string | null; orderIndex: number | null; kind: string; assignedTo?: string | null; needsOwner?: boolean }
const PRI: Record<string, number> = { critical: 0, urgent: 0, high: 1, medium: 2, normal: 2, low: 3 }

/** The next card for an agent after an accepted finish: open, not held by anyone, most urgent, then first in order. */
export function nextCard(cards: Card[], justFinished?: string): Card | null {
  const free = cards.filter((c) => c.kind === "open" && c.id !== justFinished && !c.assignedTo)
  free.sort((a, b) => (PRI[String(a.priority ?? "").toLowerCase()] ?? 2) - (PRI[String(b.priority ?? "").toLowerCase()] ?? 2) || (a.orderIndex ?? 1e9) - (b.orderIndex ?? 1e9))
  return free[0] ?? null
}

/** The words of the assign message: take it, or raise the owner's question first when the card needs him. */
export function assignText(card: Card): string {
  return card.needsOwner
    ? `Next: "${card.title}". It waits on the owner: raise his question with what you found (ask_owner), then take the next card.`
    : `Next: "${card.title}". Claim it, work it, and say when it is finished (work_finished).`
}
