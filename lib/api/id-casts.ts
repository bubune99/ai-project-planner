/**
 * Is a value put to isUuid before the database is told to read it as a uuid?
 *
 * Reads a route file's source text. Pure: no files, no database. The walk over app/api and the
 * named exceptions are in id-casts.assert.ts. The sibling of path-ids.ts, for ids that arrive in
 * a body or a query string rather than in the path.
 *
 * The rule: for every `${x}::uuid` or `${x}::uuid[]` in a query, the name x must, earlier in the
 * same top-level function, have been
 *   - put to `isUuid(x)` (lib/api/ids.ts) or the older `UUID.test(x)`, or
 *   - for a list, tested with `x.every(isUuid)`, or declared with `.filter(isUuid)`.
 * A malformed value then never reaches the cast, where the database refuses it ("invalid input
 * syntax for type uuid") and the route's catch reports a failure of ours.
 *
 * What source text can and cannot tell:
 *   - It sees only values the query itself casts with `::uuid`. An id compared to a uuid column
 *     with no cast (`WHERE id = ${x}`) is refused by the database in exactly the same way and is
 *     NOT seen here: the column's type is not in the route's text. Those are found by reading.
 *   - It cannot tell where a value came from (the caller, or a row just read). So every cast
 *     counts unless the caller of `uncheckedCasts` names the value as safe, with a reason kept
 *     beside the name in the assert file.
 *   - It cannot tell what is answered when the check fails (400, and in which words).
 *   - A query built from numbered placeholders (`$${p++}::uuid`) is reported as "cannot follow".
 */

export type CastFinding = {
  name: string
  problem: "not checked" | "cannot follow"
  detail: string
}

const CAST = /\$\{([^{}]*)\}::uuid\b(\[\])?/g
const DOTTED = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/
const FIRST = /^[A-Za-z_$][\w$]*/

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Comments are not code. Kept the same length so positions hold. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, " "))

/** The name a cast expression is about: `a.b` whole, else its first name (`x || null`, `rows.map(...)`). */
export function castName(expression: string): string | null {
  const e = expression.trim()
  if (DOTTED.test(e)) return e
  return e.match(FIRST)?.[0] ?? null
}

function isChecked(scope: string, name: string): boolean {
  const n = escape(name)
  return (
    new RegExp(String.raw`(?:isUuid|UUID\.test)\(\s*${n}\s*\)`).test(scope) ||
    new RegExp(String.raw`(?<![\w$.])${n}\.every\(\s*isUuid\s*\)`).test(scope) ||
    new RegExp(String.raw`(?:const|let|var)\s+${n}\b[^;\n]*\.filter\(\s*isUuid\s*\)`).test(scope)
  )
}

/**
 * The values a route file casts to uuid without checking them first.
 * `safe` names values of this file that do not come from the caller (a row just read, the signed-in user).
 */
export function uncheckedCasts(source: string, safe: string[] = []): CastFinding[] {
  const text = withoutComments(source.replace(/\r\n/g, "\n"))
  const findings: CastFinding[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(CAST)) {
    const at = m.index ?? 0
    // the top-level function this cast is in starts after the last `}` in column one
    const start = Math.max(0, text.lastIndexOf("\n}", at))
    const positional = text[at - 1] === "$"
    const name = positional ? null : castName(m[1])
    const key = `${start}:${name ?? m[1]}`
    if (seen.has(key)) continue
    seen.add(key)
    if (name === null) {
      findings.push({ name: m[1].trim(), problem: "cannot follow", detail: positional ? "a numbered placeholder is cast: read by hand which value fills it" : "the cast value is not a name" })
      continue
    }
    if (safe.includes(name)) continue
    if (!isChecked(text.slice(start, at), name)) {
      findings.push({ name, problem: "not checked", detail: `${name} is cast to uuid${m[2] ? "[]" : ""} and never put to isUuid before it` })
    }
  }
  return findings
}
