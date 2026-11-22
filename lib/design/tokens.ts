/**
 * The design system's tokens, read out of the stylesheet that defines them (card ec6b2efd, first slice).
 *
 * Owner, 2026-11-17: "What should also be in the planner is the design system of the application."
 * The planner's own tokens are the --opx-* names in app/opx-skin.css. This reads them into a record, one set of
 * values per theme, so the rest of the card (a record the owner can read, a finding for a value outside the
 * tokens) has something exact to stand on.
 *
 * Pure: the stylesheet's text is passed in. This module reads no file, and never changes the text.
 *
 * How the stylesheet says which theme a value is for:
 *   :root (or html)   the value in light, and in dark too unless dark says otherwise
 *   .dark             the value in dark
 *   .light            the value in light only
 * A token set anywhere else (on one component, or inside a width rule) is not part of either theme's set. Its
 * name is listed in `elsewhere` so nothing is dropped without a word.
 */

export type Theme = "dark" | "light"

export interface DesignTokens {
  /** The theme the product opens in. The stylesheet cannot say this; the caller does (the planner opens dark). */
  defaultTheme: Theme
  /** Every token and its value in each theme, by its full name ("--opx-bg"). A token only one theme sets is only in that theme. */
  themes: Record<Theme, Record<string, string>>
  /** The tokens whose value is not the same in both themes, in the order they are declared. */
  differ: string[]
  /** Tokens also, or only, set outside the theme rules: on one component or inside an @ rule. Sorted. */
  elsewhere: string[]
}

export interface ReadOptions {
  /** Which tokens to read. The planner's are "--opx-". */
  prefix?: string
  defaultTheme?: Theme
}

interface Rule { selectors: string[]; body: string; nested: boolean }

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?(\*\/|$)/g, " ")

/** The index just past the quoted string that starts at `i`. */
function skipString(text: string, i: number): number {
  const quote = text[i]
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === "\\") j++
    else if (text[j] === quote) return j + 1
  }
  return text.length
}

/** Split on a separator, leaving alone what is inside quotes or round brackets. */
function splitOutside(text: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"' || ch === "'") { i = skipString(text, i) - 1; continue }
    if (ch === "(") depth++
    else if (ch === ")") depth = Math.max(0, depth - 1)
    else if (ch === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1 }
  }
  parts.push(text.slice(start))
  return parts
}

/** Every rule in the text, with the rules inside an @ rule marked as nested. A rule cut off at the end still counts. */
function rules(css: string, nested = false): Rule[] {
  const out: Rule[] = []
  let i = 0, start = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '"' || ch === "'") { i = skipString(css, i); continue }
    if (ch === ";" || ch === "}") { start = ++i; continue }
    if (ch !== "{") { i++; continue }
    const prelude = css.slice(start, i).trim()
    let depth = 1, j = i + 1, round = 0
    for (; j < css.length && depth > 0; j++) {
      const c = css[j]
      if (c === '"' || c === "'") { j = skipString(css, j) - 1; continue }
      if (c === "(") round++
      else if (c === ")") round = Math.max(0, round - 1)
      else if (round > 0) continue
      else if (c === "{") depth++
      else if (c === "}") depth--
    }
    const body = css.slice(i + 1, depth === 0 ? j - 1 : j)
    if (prelude.startsWith("@")) out.push(...rules(body, true))
    else if (prelude) out.push({ selectors: splitOutside(prelude, ",").map((s) => s.replace(/\s+/g, " ").trim()), body, nested })
    i = start = j
  }
  return out
}

/** The custom properties a rule's body sets, later ones winning, in the order first seen. */
function declarations(body: string, prefix: string): [string, string][] {
  const found = new Map<string, string>()
  for (const part of splitOutside(body, ";")) {
    const colon = part.indexOf(":")
    if (colon < 0) continue
    const name = part.slice(0, colon).trim()
    const value = part.slice(colon + 1).replace(/\s+/g, " ").trim()
    if (name.startsWith(prefix) && /^--[\w-]+$/.test(name) && value) found.set(name, value)
  }
  return [...found]
}

const BASE = new Set([":root", "html"])
const DARK = new Set([".dark", "html.dark", ":root.dark"])
const LIGHT = new Set([".light", "html.light", ":root.light"])

/** The tokens with this prefix, in each theme, from the text of a stylesheet. */
export function readTokens(css: string, options: ReadOptions = {}): DesignTokens {
  const prefix = options.prefix ?? "--opx-"
  const base = new Map<string, string>(), dark = new Map<string, string>(), light = new Map<string, string>()
  const elsewhere = new Set<string>()
  for (const rule of rules(stripComments(css))) {
    const set = declarations(rule.body, prefix)
    if (!set.length) continue
    const targets = rule.nested ? [] : [BASE, DARK, LIGHT].filter((names) => rule.selectors.some((s) => names.has(s)))
    // A rule inside an @ rule, or one that also names something else, does not set the theme's value everywhere.
    if (!targets.length || rule.selectors.some((s) => !BASE.has(s) && !DARK.has(s) && !LIGHT.has(s))) for (const [name] of set) elsewhere.add(name)
    for (const [name, value] of set) {
      if (targets.includes(BASE)) base.set(name, value)
      if (targets.includes(DARK)) dark.set(name, value)
      if (targets.includes(LIGHT)) light.set(name, value)
    }
  }
  const names = [...new Set([...base.keys(), ...dark.keys(), ...light.keys()])]
  const themes: Record<Theme, Record<string, string>> = { dark: {}, light: {} }
  for (const name of names) {
    // A token one theme never sets has no value there, and is left out of that theme: a value is never made up.
    const inDark = dark.get(name) ?? base.get(name), inLight = light.get(name) ?? base.get(name)
    if (inDark !== undefined) themes.dark[name] = inDark
    if (inLight !== undefined) themes.light[name] = inLight
  }
  return {
    defaultTheme: options.defaultTheme ?? "dark",
    themes,
    differ: names.filter((name) => themes.dark[name] !== themes.light[name]),
    elsewhere: [...elsewhere].sort(),
  }
}

/** Tokens with this prefix that the stylesheet uses in var(...) but never gives a value anywhere, most used first. */
export function undeclaredTokens(css: string, prefix = "--opx-"): { name: string; uses: number }[] {
  const text = stripComments(css)
  const declared = new Set(rules(text).flatMap((rule) => declarations(rule.body, prefix).map(([name]) => name)))
  const uses = new Map<string, number>()
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) if (m[1].startsWith(prefix) && !declared.has(m[1])) uses.set(m[1], (uses.get(m[1]) ?? 0) + 1)
  return [...uses].map(([name, count]) => ({ name, uses: count })).sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
}
