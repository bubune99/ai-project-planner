/**
 * Does a handler ask the same access question twice?
 *
 * Reads a route file's source text. Pure: no files, no database. The walk over app/api is in
 * access-twice.assert.ts.
 *
 * Why it matters: a write handler is meant to ask two different questions, in this order:
 *   1. may the caller open this project at all (verifyProjectOwnership)? No: 404 Project not found.
 *   2. may the caller change it (verifyProjectWriteAccess)? No: 403, you can view but not change.
 * When the first question is also the write question, a view-only collaborator is told the project
 * does not exist and the 403 can never be reached. The second answer is dead code that looks alive.
 *
 * The rule: within one handler, the same question may not be asked twice with the same arguments.
 * `verifyProjectWriteAccess(p, u)` and `verifyCollaboratorAccess(p, u, "editor")` are one question
 * (the first is defined as the second in lib/auth/auth-utils.ts).
 *
 * What source text cannot tell: that the two questions are in the right order, what each answers,
 * or that a handler asks any question at all. It also does not follow a question asked inside a
 * helper the handler calls.
 */
import { handlersOf } from "./path-ids"

export type Repeat = { handler: string; question: "read" | "write"; args: string; times: number }

const CALL = /\b(verifyProjectOwnership|verifyProjectWriteAccess|verifyCollaboratorAccess)\(([^()]*)\)/g

/** Comments are not code. */
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/[^\n]*/g, " ")

function questionOf(fn: string, rawArgs: string): { question: "read" | "write"; args: string } | null {
  const args = rawArgs.split(",").map((a) => a.trim())
  if (fn === "verifyProjectOwnership") return { question: "read", args: args.slice(0, 2).join(", ") }
  if (fn === "verifyProjectWriteAccess") return { question: "write", args: args.slice(0, 2).join(", ") }
  // verifyCollaboratorAccess(project, user, role): "editor" is the write question; other roles are their own
  if (/^["']editor["']$/.test(args[2] ?? "")) return { question: "write", args: args.slice(0, 2).join(", ") }
  return null
}

/** The access questions each handler of a route file asks more than once. */
export function askedTwice(source: string): Repeat[] {
  const out: Repeat[] = []
  for (const handler of handlersOf(source)) {
    const counts = new Map<string, Repeat>()
    for (const m of withoutComments(handler.body).matchAll(CALL)) {
      const q = questionOf(m[1], m[2])
      if (!q) continue
      const key = `${q.question}|${q.args}`
      const seen = counts.get(key)
      if (seen) seen.times++
      else counts.set(key, { handler: handler.name, ...q, times: 1 })
    }
    for (const r of counts.values()) if (r.times > 1) out.push(r)
  }
  return out
}
