/**
 * Does a route check the ids in its path before it uses them?
 *
 * Reads a route file's source text. Pure: no files, no database. The walk over app/api and the
 * named exceptions are in path-ids.assert.ts.
 *
 * The rule, per handler (GET, POST, ...) and per dynamic segment of the route's path ([id], [stepId]):
 *   wherever the handler takes the segment out of `params`, the first thing done with it must be
 *   `isUuid(x)` (lib/api/ids.ts) or the older `UUID.test(x)`. Nothing may mention it in between.
 *
 * What source text can and cannot tell:
 *   - It cannot tell which column a value is compared to, or that column's type. So the rule does
 *     not try: every path segment counts as a uuid id unless the caller of `unchecked` names it as
 *     something else (a token, a slug). Whether those names are right is checked by hand against
 *     the migrations, not here.
 *   - It cannot tell what the handler answers when the check fails (404, and in which words), or
 *     that the signed-in check comes first. Those are read by a person in the diff.
 *   - It follows `const { id: projectId } = await params`, `const x = params.id` and bare
 *     `params.id`. A handler that passes `params` on whole, or reads it some other way, is
 *     reported as "cannot follow" rather than passed.
 */

export type Finding = {
  handler: string
  segment: string
  problem: "not checked" | "used before the check" | "cannot follow"
  detail: string
  /** the names the handler knows this segment by, when it could be followed */
  locals?: string[]
}

const HANDLER = /^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm
const HANDLER_AS_VALUE = /^export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm

/** `app/api/projects/[id]/steps/[stepId]/route.ts` -> ["id", "stepId"] */
export function segmentsOf(routePath: string): string[] {
  return [...routePath.matchAll(/\[(?:\.\.\.)?([A-Za-z0-9_]+)\]/g)].map((m) => m[1])
}

/** Each exported handler: its name and its body, from the line that opens it to the `}` in column one that closes it. */
export function handlersOf(source: string): { name: string; body: string }[] {
  const text = source.replace(/\r\n/g, "\n")
  const out: { name: string; body: string }[] = []
  for (const m of text.matchAll(HANDLER)) {
    const start = m.index ?? 0
    const close = text.indexOf("\n}", start)
    const whole = close === -1 ? text.slice(start) : text.slice(start, close)
    // the body starts after the first line that ends in "{" (a signature may run over several lines)
    const open = whole.search(/\{[ \t]*(?:\n|$)/)
    out.push({ name: m[1], body: open === -1 ? "" : whole.slice(open + 1) })
  }
  return out
}

type Binding = { segment: string; local: string; from: number }

const SOURCE = String.raw`(?:await\s+)?(?:Promise\.resolve\(\s*)?(?:\(\s*await\s+)?(?:[A-Za-z_$][\w$]*\.)?params\b\s*\)?`
const DESTRUCTURE = new RegExp(String.raw`(?:const|let|var)\s*\{([^}]*)\}\s*=\s*${SOURCE}\)?`, "g")
const ASSIGN = new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*${SOURCE}\.([A-Za-z_$][\w$]*)`, "g")
const RENAME = /(?:const|let|var)\s+params\s*=\s*await\s+[A-Za-z_$][\w$]*\.params\b/g

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** the name on its own: not part of a longer name, not a property of something else */
const word = (local: string) => new RegExp(String.raw`(?<![\w$.])${escape(local)}(?![\w$])`)
const guard = (local: string) => new RegExp(String.raw`(?:isUuid|UUID\.test)\(\s*${escape(local)}\s*\)`)

function bindingsOf(body: string, segments: string[]): { bindings: Binding[]; code: string; rest: string } {
  const bindings: Binding[] = []
  let rest = body
  const blank = (m: RegExpMatchArray) => {
    const at = m.index ?? 0
    rest = rest.slice(0, at) + " ".repeat(m[0].length) + rest.slice(at + m[0].length)
  }
  for (const m of body.matchAll(RENAME)) blank(m)
  for (const m of body.matchAll(DESTRUCTURE)) {
    blank(m)
    for (const part of m[1].split(",")) {
      const [key, alias] = part.split(":").map((s) => s.trim())
      if (key && segments.includes(key)) bindings.push({ segment: key, local: alias || key, from: (m.index ?? 0) + m[0].length })
    }
  }
  for (const m of body.matchAll(ASSIGN)) {
    blank(m)
    if (segments.includes(m[2])) bindings.push({ segment: m[2], local: m[1], from: (m.index ?? 0) + m[0].length })
  }
  // `code` is the body with the statements that take params apart blanked out; `rest` also has
  // every plain `params.id` blanked, so anything it still says about params is something not followed
  const code = rest
  for (const segment of segments) {
    const direct = `params.${segment}`
    if (word(direct).test(rest)) bindings.push({ segment, local: direct, from: 0 })
    rest = rest.replace(new RegExp(String.raw`(?<![\w$.])${escape(direct)}(?![\w$])`, "g"), " ".repeat(direct.length))
  }
  return { bindings, code, rest }
}

/** Comments say "params" too ("query params"); they are not code. Kept the same length so positions hold. */
const withoutComments = (body: string) =>
  body.replace(/\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, " "))

/**
 * The path ids a route file uses without checking them first.
 * `notIds` names segments of this route that are not uuid ids at all (a token, a slug).
 */
export function unchecked(routePath: string, source: string, notIds: string[] = []): Finding[] {
  const segments = segmentsOf(routePath).filter((s) => !notIds.includes(s))
  const findings: Finding[] = []
  if (segments.length === 0) return findings
  for (const m of source.matchAll(HANDLER_AS_VALUE)) {
    findings.push({ handler: m[1], segment: "*", problem: "cannot follow", detail: "the handler is a value, not a function: read it by hand" })
  }
  for (const handler of handlersOf(source)) {
    const name = handler.name
    const body = withoutComments(handler.body)
    const { bindings, code, rest } = bindingsOf(body, segments)
    if (/(?<![\w$])params(?![\w$])/.test(rest)) {
      findings.push({ handler: name, segment: "*", problem: "cannot follow", detail: "`params` is read or passed on in a way this check does not follow" })
    }
    for (const segment of segments) {
      // one value can go by two names in a handler (`const projectId = params.id`, then `params.id` again
      // in a log line): checking it under either name checks it
      const names = bindings.filter((b) => b.segment === segment)
      if (names.length === 0) continue
      const locals = names.map((b) => b.local).join(" / ")
      const checks = names.map((b) => { const g = body.slice(b.from).search(guard(b.local)); return g === -1 ? -1 : b.from + g }).filter((g) => g !== -1)
      if (checks.length === 0) {
        findings.push({ handler: name, segment, problem: "not checked", detail: `${locals} is never put to isUuid`, locals: names.map((b) => b.local) })
        continue
      }
      const checkedAt = Math.min(...checks)
      const early = names.find((b) => b.from < checkedAt && word(b.local).test(code.slice(b.from, checkedAt)))
      if (early) findings.push({ handler: name, segment, problem: "used before the check", detail: `${early.local} is used before it is put to isUuid`, locals: names.map((b) => b.local) })
    }
  }
  return findings
}
