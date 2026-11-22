/*
  The project page's Phases strip, worked out from the project's cards.

  Owner, 2026-11-16, on the strip: "These phases tell me nothing of what they are". It drew the raw code on each card
  ("1" to "5", "ideation") as the phase's name, and counted "ideation", the bucket every unphased card falls into, as
  a phase of its own. A numbered phase takes its name from its own heading card ("Phase 3 — Dashboard Completion"),
  and cards outside any numbered phase are counted, not drawn as a phase.
*/

export type PhaseStepIn = { title?: string | null; phase?: string | null; status?: string | null; stage?: string | null }

export type StripPhase = {
  number: number
  name: string
  total: number
  done: number
  status: "done" | "active" | "upcoming"
}

export const HEADING = /^\s*phase\s*(\d+)\s*[—–:\-]+\s*(.+?)\s*$/i

export function phaseStrip(steps: PhaseStepIn[]): { phases: StripPhase[]; outside: number } {
  const groups = new Map<number, PhaseStepIn[]>()
  let outside = 0
  for (const s of steps || []) {
    if (!s) continue
    const key = String(s.phase ?? "").trim()
    if (!/^\d+$/.test(key)) { outside++; continue }
    const n = Number(key)
    groups.set(n, [...(groups.get(n) || []), s])
  }
  const phases = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, list]): StripPhase => {
      const heading = list.map((s) => HEADING.exec(String(s.title || ""))).find((m) => m && Number(m[1]) === number)
      const done = list.filter((s) => s.status === "completed").length
      const moving = done > 0 || list.some((s) => s.status === "in-progress" || s.stage === "in-progress")
      return {
        number,
        name: heading ? heading[2] : `Phase ${number}`,
        total: list.length,
        done,
        status: done === list.length ? "done" : moving ? "active" : "upcoming",
      }
    })
  return { phases, outside }
}
