/**
 * Guides: what the owner's stack and taste ask of the work, written once and
 * turned into checks. Pure: no database, no React.
 *
 * Two kinds. A STACK entry is a tool we build with (Next.js, Stripe, ...): it
 * points to the skill that says how to use it and names the checks its use
 * brings. A STATEMENT is a preference on how something should be built or
 * look: it says what it applies to and what shows it was followed. Statements
 * are expected to change as taste is refined and researched, so each carries
 * where it came from and whether it is settled (active) or still a draft.
 *
 * The planner stores guides. The plugin pulls them as rules and applies them
 * to each file as it is written (far-gates: lib-code.mjs).
 */
import type { Issue } from "./gate-model"

export interface GuideCheck {
  id: string
  /** What must be true, in words. */
  say: string
  /**
   * A check the hook can run itself on the file's text:
   *   mentions:<regex>  the text must match
   *   forbids:<regex>   the text must not match
   *   max-lines:<n>, no-secrets, no-emoji, has-check-file
   * Without it, the agent performs the check and records what it saw.
   */
  auto?: string
}

export interface Guide {
  id: string
  kind: "stack" | "statement"
  name: string
  summary: string
  /** The skill that holds the how-to. */
  skill?: string
  applies: {
    /** File globs: ** any folders, * within a name, {a,b} alternatives. */
    files?: string[]
    /** Only files that import one of these packages (a prefix: "@radix-ui" matches "@radix-ui/react-dialog"). */
    imports?: string[]
  }
  checks: GuideCheck[]
  status: "active" | "draft"
  source: "owner" | "research" | "agent"
  /** Where it came from: the owner's words and date, or the research behind it. */
  basis: string
}

/** The shape the plugin applies: one rule per check. */
export interface Rule {
  id: string
  match: string
  imports?: string[]
  auto?: string
  say?: string
  manual?: string
  /** The guide it came from, shown to the agent with the skill to load. */
  from: string
  skill?: string
}

const AUTO = /^(mentions:.+|forbids:.+|max-lines:\d+|no-secrets|no-emoji|has-check-file)$/

export function validateGuide(g: Guide): Issue[] {
  const issues: Issue[] = []
  const say = (where: string, message: string) => issues.push({ where, message })
  if (!g.name?.trim()) say("name", "A guide needs a name")
  if (!g.summary?.trim()) say("summary", "Say in a sentence what it asks for")
  if (!["stack", "statement"].includes(g.kind)) say("kind", "kind is stack or statement")
  if (!g.basis?.trim()) say("basis", "Say where it comes from: the owner's words, or the research behind it")
  if (!g.applies?.files?.length && !g.applies?.imports?.length) say("applies", "Say which files it applies to, by path or by what they import")
  if (!g.checks?.length) say("checks", "A guide needs at least one check, or nothing verifies it")
  const ids = new Set<string>()
  for (const c of g.checks ?? []) {
    if (!/^[a-z0-9-]{2,40}$/.test(c.id ?? "")) say(`check ${c.id}`, "A check id is lowercase letters, digits and dashes")
    if (ids.has(c.id)) say(`check ${c.id}`, "Two checks share this id")
    ids.add(c.id)
    if (!c.say?.trim()) say(`check ${c.id}`, "Say what must be true")
    if (c.auto !== undefined && !AUTO.test(c.auto)) say(`check ${c.id}`, "auto must be mentions:, forbids:, max-lines:, no-secrets, no-emoji or has-check-file")
    if (c.auto && /^(mentions|forbids):/.test(c.auto)) { try { new RegExp(c.auto.replace(/^\w+:/, "")) } catch { say(`check ${c.id}`, "The pattern is not a valid regular expression") } }
  }
  return issues
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

/** The rules a set of guides compiles to. Drafts are left out: a preference still being worked out holds nobody up. */
export function toRules(guides: Guide[]): Rule[] {
  const rules: Rule[] = []
  for (const g of guides) {
    if (g.status !== "active") continue
    const globs = g.applies.files?.length ? g.applies.files : ["**/*.{ts,tsx,js,jsx,mjs}"]
    for (const c of g.checks) for (const match of globs) {
      rules.push({
        id: `${slug(g.name)}-${c.id}`, match, from: g.name,
        ...(g.applies.imports?.length ? { imports: g.applies.imports } : {}),
        ...(c.auto ? { auto: c.auto, say: c.say } : { manual: c.say }),
        ...(g.skill ? { skill: g.skill } : {}),
      })
    }
  }
  return rules
}
