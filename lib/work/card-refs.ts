/**
 * Code a card carries for whoever builds it: code samples (a mock-up's script, a snippet) and code references (a file
 * in a repo, with lines). Pictures stay where they were (metadata.pictures, card-view.ts).
 *
 * Owner, 2026-11-23: "when we have mocks like this, we must be able to input the image and any necessary code samples
 * included for building this out or reference to code for implementation". Kept in the card's metadata
 * (metadata.code, metadata.codeRefs) like its pictures, so they last as long as the card does.
 *
 * Pure; checked in card-refs.assert.ts.
 */

export interface CodeSample { id: string; title: string; lang: string; code: string }
export interface CodeRef { id: string; label: string; url: string; path: string; lines: string | null }

export const MAX_SAMPLES = 10
export const MAX_REFS = 20
export const MAX_CODE_CHARS = 20_000
const MAX_TITLE = 120

/** Languages a sample may be marked as; anything else is shown as plain text. */
export const LANGS = ["ts", "tsx", "js", "jsx", "css", "html", "json", "sql", "sh", "py", "md", "text"] as const
const LANG_ALIASES: Record<string, string> = { typescript: "ts", javascript: "js", bash: "sh", shell: "sh", python: "py", markdown: "md", plain: "text", txt: "text" }

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
type Meta = Record<string, unknown> | null | undefined

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n)
const str = (v: unknown) => (typeof v === "string" ? v : "")

/** A sample's language, from what was given or the file name's ending; plain text when unknown. */
export function langOf(given: unknown, name = ""): string {
  const g = str(given).trim().toLowerCase()
  const fromGiven = LANG_ALIASES[g] ?? g
  if ((LANGS as readonly string[]).includes(fromGiven)) return fromGiven
  const ext = name.toLowerCase().match(/\.([a-z]+)$/)?.[1] ?? ""
  const fromExt = LANG_ALIASES[ext] ?? ext
  return (LANGS as readonly string[]).includes(fromExt) ? fromExt : "text"
}

export function codeSamples(m: Meta): CodeSample[] {
  const raw = m && Array.isArray(m.code) ? m.code : []
  return raw.flatMap((c) => {
    const o = c as Partial<CodeSample> | null
    if (!o || typeof o.id !== "string" || typeof o.code !== "string" || !o.code.trim()) return []
    return [{ id: o.id, title: clip(str(o.title), MAX_TITLE) || "Code", lang: langOf(o.lang), code: o.code.slice(0, MAX_CODE_CHARS) }]
  })
}

export function codeRefs(m: Meta): CodeRef[] {
  const raw = m && Array.isArray(m.codeRefs) ? m.codeRefs : []
  return raw.flatMap((r) => {
    const o = r as Partial<CodeRef> | null
    if (!o || typeof o.id !== "string" || !isGithubUrl(str(o.url))) return []
    return [{ id: o.id, label: clip(str(o.label), MAX_TITLE), url: str(o.url), path: str(o.path), lines: typeof o.lines === "string" ? o.lines : null }]
  })
}

const isGithubUrl = (u: string) => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/|$)/.test(u)
const REPO = /^[\w.-]+\/[\w.-]+$/
const SAFE_PATH = /^(?!\/)(?!.*\.\.)[\w.\-/@[\]()]+$/
const REF = /^[\w.\-/]+$/

/** Lines as "12" or "12-30" from a number, two numbers or text; null when none or nonsense. */
export function readLines(from: unknown, to?: unknown): string | null {
  const t = str(from).trim()
  const m = t.match(/^L?(\d+)(?:\s*-\s*L?(\d+))?$/i)
  const a = typeof from === "number" ? from : m ? Number(m[1]) : NaN
  const b = typeof to === "number" ? to : m && m[2] ? Number(m[2]) : NaN
  if (!Number.isInteger(a) || a < 1) return null
  if (!Number.isInteger(b) || b <= a) return String(a)
  return `${a}-${b}`
}

/**
 * A code reference from what was given: a GitHub link (kept as given, its path and lines read from it), or a repo
 * ("owner/name"), a path in it and optional lines and branch or commit, made into a GitHub link.
 */
export function readCodeRef(input: { url?: unknown; repo?: unknown; path?: unknown; lines?: unknown; ref?: unknown; label?: unknown }, newId: string): Result<CodeRef> {
  const url = str(input.url).trim()
  const label = clip(str(input.label), MAX_TITLE)
  if (url) {
    if (!isGithubUrl(url)) return { ok: false, error: "A code reference must be a github.com link, or a repo and a path" }
    const m = url.match(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:blob|tree)\/[^/]+\/([^#?]+)(?:#L(\d+)(?:-L(\d+))?)?/)
    const path = m ? decodeURIComponent(m[1]) : ""
    const lines = m && m[2] ? readLines(Number(m[2]), m[3] ? Number(m[3]) : undefined) : null
    return { ok: true, value: { id: newId, label: label || path || url.replace(/^https:\/\/github\.com\//, ""), url, path, lines } }
  }
  const repo = str(input.repo).trim(), path = str(input.path).trim().replace(/^\.\//, ""), ref = str(input.ref).trim() || "main"
  if (!REPO.test(repo)) return { ok: false, error: 'Give a github.com link, or repo as "owner/name" with a path' }
  if (!path || !SAFE_PATH.test(path)) return { ok: false, error: "Give the file's path inside the repo, e.g. components/views/KanbanView.tsx" }
  if (!REF.test(ref)) return { ok: false, error: "The branch or commit has characters a ref cannot have" }
  const lines = readLines(input.lines)
  const anchor = lines ? `#L${lines.replace("-", "-L")}` : ""
  return { ok: true, value: { id: newId, label: label || `${path}${lines ? `:${lines}` : ""}`, url: `https://github.com/${repo}/blob/${ref}/${path}${anchor}`, path, lines } }
}

export function readCodeSample(input: { code?: unknown; title?: unknown; lang?: unknown }, newId: string): Result<CodeSample> {
  const code = str(input.code).replace(/\r\n/g, "\n")
  if (!code.trim()) return { ok: false, error: "The code sample is empty" }
  if (code.length > MAX_CODE_CHARS) return { ok: false, error: `A code sample is at most ${MAX_CODE_CHARS.toLocaleString("en-US")} characters: link the file instead` }
  const title = clip(str(input.title), MAX_TITLE)
  return { ok: true, value: { id: newId, title: title || "Code", lang: langOf(input.lang, title), code } }
}

/** The metadata after adding a sample, keeping everything else on the card. */
export function addCodeSample(m: Meta, s: CodeSample): Result<Record<string, unknown>> {
  const kept = codeSamples(m)
  if (kept.length >= MAX_SAMPLES) return { ok: false, error: `A card holds at most ${MAX_SAMPLES} code samples: remove one first` }
  if (kept.some((k) => k.code === s.code)) return { ok: true, value: { ...(m ?? {}), code: kept } }
  return { ok: true, value: { ...(m ?? {}), code: [...kept, s] } }
}

export function addCodeRef(m: Meta, r: CodeRef): Result<Record<string, unknown>> {
  const kept = codeRefs(m)
  if (kept.length >= MAX_REFS) return { ok: false, error: `A card holds at most ${MAX_REFS} code references: remove one first` }
  if (kept.some((k) => k.url === r.url)) return { ok: true, value: { ...(m ?? {}), codeRefs: kept } }
  return { ok: true, value: { ...(m ?? {}), codeRefs: [...kept, r] } }
}

/** The metadata without the sample or reference with this id (either list). */
export function removeRef(m: Meta, id: string): Record<string, unknown> {
  return { ...(m ?? {}), code: codeSamples(m).filter((s) => s.id !== id), codeRefs: codeRefs(m).filter((r) => r.id !== id) }
}
