/* Run: npx -y tsx@4.23.15 lib/threads/work-channel.assert.ts */
import { assignText, isRealProof, nextCard, reviewFinish, sameCommit, type Evidence, splitRequests } from "./work-channel"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, what: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.log(`FAIL ${what}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`) }
}
const good = "Production 1f6dcec: the notice is 408x60 at 440px, 9px above the tab bar"
const ev = (o: Partial<Evidence> = {}): Evidence => ({ ships: [{ env: "production", sha: "1f6dcec0aa11", note: good }], changes: [{ stage: "staging", build: "1f6dcec" }], cardKind: "done", ...o })

eq(["ok", "Done.", "looks fine", "LGTM", "it works"].map(isRealProof), [false, false, false, false, false], "empty words are not proof")
eq(isRealProof(good), true, "what was seen, where, is proof")
eq(isRealProof("checked it"), false, "two words are not enough")
eq(sameCommit("1f6dcec0", "1f6dcec0aa11"), true, "a short sha matches its full commit")
eq(sameCommit("1f6d", "1f6dcec0"), false, "under seven characters never matches")

eq(reviewFinish({ taskId: "t", sha: "1f6dcec0", visible: true, proof: good }, ev()), { verdict: "accepted", requests: [] }, "ship on record with what was seen, a pair for the build, card closed: accepted")
eq(reviewFinish({ taskId: "t", sha: "1f6dcec0", proof: "ok" }, ev()).requests.length, 1, "'ok' as proof is sent back")
eq(reviewFinish({ taskId: "t", sha: "deadbeef1", proof: good }, ev()).requests[0].startsWith("No ship record for deadbeef"), true, "no ship record: asked to check it live and record it")
eq(reviewFinish({ taskId: "t", sha: "1f6dcec0", proof: good }, ev({ ships: [{ env: "production", sha: "1f6dcec0", note: "ok" }] })).requests.length, 1, "a ship record that says nothing seen is sent back")
eq(reviewFinish({ taskId: "t", sha: "1f6dcec0", visible: true, proof: good }, ev({ changes: [] })).verdict, "sent_back", "a visible change without a before/after pair is sent back")
eq(reviewFinish({ taskId: "t", sha: "1f6dcec0", visible: false, proof: good }, ev({ changes: [] })).verdict, "accepted", "a change nobody can see owes no pair")
eq(reviewFinish({ taskId: "t", sha: "1f6dcec0", proof: good }, ev({ cardKind: "active" })).requests[0].startsWith("The card is not finished"), true, "the card still in progress is sent back")
eq(reviewFinish({ taskId: "t", proof: good }, ev()).requests[0].startsWith("Name the commit"), true, "no commit named")
eq(reviewFinish({ taskId: "t", sha: "94a6fe6", deploys: false, proof: good }, ev({ ships: [], changes: [] })), { verdict: "accepted", requests: [] }, "a repository that deploys nothing owes no ship record or pair (walk, 2026-11-17: the plugin's finish was sent back forever)")
eq(reviewFinish({ taskId: "t", sha: "94a6fe6", deploys: false, proof: "ok" }, ev({ ships: [] })).verdict, "sent_back", "but its proof must still say what was seen")
eq(reviewFinish({ taskId: "t", sha: "94a6fe6", deploys: false, proof: good }, ev({ ships: [], cardKind: "active" })).verdict, "sent_back", "and the card must still be closed")

const cards = [
  { id: "a", title: "A", priority: "low", orderIndex: 1, kind: "open" },
  { id: "b", title: "B", priority: "high", orderIndex: 5, kind: "open" },
  { id: "c", title: "C", priority: "high", orderIndex: 2, kind: "open", assignedTo: "other-agent" },
  { id: "d", title: "D", priority: "critical", orderIndex: 9, kind: "active" },
  { id: "e", title: "E", priority: "high", orderIndex: 3, kind: "open" },
]
eq(nextCard(cards)?.id, "e", "most urgent open card nobody holds, first in order; in-progress and held cards are skipped")
eq(nextCard(cards, "e")?.id, "b", "never the card just finished")
eq(nextCard([]), null, "nothing left")
eq(assignText({ id: "x", title: "X", priority: null, orderIndex: null, kind: "open", needsOwner: true }).includes("ask_owner"), true, "a card that waits on the owner: raise his question first")

// One ship, many cards: the same request is asked once.
const pair = "This change can be seen, but there is no before/after pair for 491a281c. Send one (gates change after --build 491a281c) so the owner can judge it."
const first = splitRequests([pair, "The card is not finished on the board."], [])
eq(first.ask.length, 2, "nothing open yet: both are asked")
const second = splitRequests([pair, "The card is not finished on the board."], [{ id: "r1", body: pair }])
eq(JSON.stringify(second.ask), JSON.stringify(["The card is not finished on the board."]), "the pair request already open is not asked again")
eq(second.standing[0]?.id, "r1", "the open one is named, so the reply to it serves this card too")
eq(splitRequests([pair, pair], []).ask.length, 1, "the same words twice in one send-back are one request")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
