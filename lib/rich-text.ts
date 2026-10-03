/*
 * Prepares free text that agents and the owner write (idea descriptions,
 * notes) for markdown rendering. Two rules:
 *
 * 1. A single newline is a break. Planner text is written like chat, where
 *    Enter starts a new thought; strict markdown would join those lines back
 *    into one wall of text. Single newlines become paragraph breaks, except
 *    inside lists, tables and fenced code, where markdown needs them as-is.
 * 2. [[...]] cross-references ([[dae457ea title]], [[slug]], [[dae457ea]])
 *    become links to #ref:<token>, which RichText renders as a chip. They are
 *    not real links: an 8-character id prefix does not resolve to a route.
 *
 * Pure. Assertions in lib/rich-text.assert.ts.
 */

const LIST_OR_TABLE = /^\s*([-*+]\s|\d+[.)]\s|\|)/
const REF = /\[\[([^\[\]\n]{1,120})\]\]/g
const ID_PREFIX = /^[0-9a-f]{8}$/i

export function refLabel(inner: string): { token: string; label: string } {
  const t = inner.trim()
  const [first, ...rest] = t.split(/\s+/)
  if (ID_PREFIX.test(first) && rest.length) return { token: first, label: rest.join(" ") }
  return { token: t, label: t.replace(/[-_]+/g, " ") }
}

export function prepareRichText(input: string): string {
  const text = input.replace(/\r\n?/g, "\n")
  const lines = text.split("\n")
  const out: string[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) inFence = !inFence
    out.push(line)
    const next = lines[i + 1]
    if (next === undefined || inFence) continue
    const lineBlank = line.trim() === ""
    const nextBlank = next.trim() === ""
    // Join a single newline with a blank line unless list/table structure
    // depends on it.
    if (!lineBlank && !nextBlank && !LIST_OR_TABLE.test(line) && !LIST_OR_TABLE.test(next)) out.push("")
    else if (!lineBlank && !nextBlank && LIST_OR_TABLE.test(next) && !LIST_OR_TABLE.test(line)) out.push("")
  }
  return out.join("\n").replace(REF, (_m, inner: string) => {
    const { token, label } = refLabel(inner)
    return `[${label.replace(/[\[\]]/g, "")}](#ref:${encodeURIComponent(token)})`
  })
}
