/**
 * Skills: small bundles of tool guidance loaded on demand (registry section 12).
 * A skill carries use_when / do_not_use_when / order / claims / examples for
 * its tools, so none of it lives in a shared system prompt. Not wired into
 * registry.ts yet; skillInstructions() is what the loader will inject.
 */
import { CATCH_UP } from "./catch-up"
import { MY_WORK } from "./my-work"

export interface SkillExample {
  request: string
  calls: string[]
}

export interface Skill {
  id: string
  use_when: string[]
  do_not_use_when: string[]
  /** Required sequence when using the tools. */
  order: string[]
  /** What the reply may say. */
  claims: string[]
  examples: SkillExample[]
  tools: string[]
}

export const SKILLS: Readonly<Record<string, Skill>> = {
  [CATCH_UP.id]: CATCH_UP,
  [MY_WORK.id]: MY_WORK,
}

const list = (title: string, items: string[]) => `${title}:\n${items.map((i) => `- ${i}`).join("\n")}`

/** Instruction text for the given skill ids; unknown ids are skipped. */
export function skillInstructions(ids: readonly string[]): string {
  return ids
    .map((id) => SKILLS[id])
    .filter((s): s is Skill => Boolean(s))
    .map((s) =>
      [
        `## Skill: ${s.id} (tools: ${s.tools.join(", ")})`,
        list("Use when", s.use_when),
        list("Do not use when", s.do_not_use_when),
        list("Order", s.order),
        list("You may claim", s.claims),
        list("Examples", s.examples.map((e) => `"${e.request}" -> ${e.calls.join("; ")}`)),
      ].join("\n"),
    )
    .join("\n\n")
}
