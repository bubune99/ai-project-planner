/**
 * Normalise HTML entities that a client encoded before writing to the planner.
 *
 * Six documents were stored as e.g. "Northwind Product &amp; Business Thesis":
 * the caller HTML-encoded its payload before calling create_document, and the
 * UI renders titles as React text, so users saw a literal "&amp;". Decoding on
 * write fixes the data at the boundary instead of teaching every renderer to
 * undo someone else's escaping.
 *
 * Two decoders, because titles and markdown carry different risks.
 */

const TITLE_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  "#x27": "'",
}

const TITLE_ENTITY_RE = /&(amp|lt|gt|quot|apos|#39|#x27);/g

/**
 * Titles are plain text and always rendered escaped (React text nodes), so
 * every basic entity is safe to decode.
 *
 * Exactly one layer is removed, in a single pass: "&amp;amp;" becomes "&amp;"
 * and "&amp;lt;" becomes "&lt;". The output is never re-scanned, so a doubly
 * encoded value is not collapsed further than it was encoded.
 */
export function decodeTitleEntities(title: string): string {
  if (!title) return title
  return title.replace(TITLE_ENTITY_RE, (_match, name: string) => TITLE_ENTITIES[name])
}

/**
 * Markdown content: decode ONLY "&amp;", and ONLY outside code.
 *
 * Why so narrow — each exclusion guards a real way to corrupt a document:
 *
 * - Inside fenced blocks and inline code spans, entities are literal
 *   characters. "Use `&amp;` to escape" is teaching, not a defect.
 * - "&lt;" / "&gt;" are never decoded. In prose, "&lt;script&gt;" renders as
 *   visible text; decoded to "<script>", a markdown renderer that permits raw
 *   HTML treats it as markup. That changes meaning and opens an injection path.
 * - "&amp;" is kept when it is followed by something that would form a new
 *   entity ("&amp;copy;"). Decoding it would render "©" where the author wrote
 *   the text "&copy;".
 *
 * Everywhere else, "&amp;" in markdown prose already renders as "&", so this
 * decode is render-equivalent: it changes the stored text, never the page.
 *
 * Not handled: 4-space indented code blocks. They are rare in planner docs, and
 * the worst case is cosmetic (a literal "&amp;" in such a block shows as "&").
 */
export function decodeMarkdownAmpEntities(markdown: string): string {
  if (!markdown || !markdown.includes("&amp;")) return markdown

  const lines = markdown.split("\n")
  const out: string[] = []
  let prose: string[] = []
  let fence: { char: string; length: number } | null = null

  const flushProse = () => {
    if (prose.length === 0) return
    out.push(decodeProseAmp(prose.join("\n")))
    prose = []
  }

  for (const line of lines) {
    if (fence) {
      out.push(line)
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null
      continue
    }

    const open = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (open) {
      flushProse()
      out.push(line)
      fence = { char: open[1][0], length: open[1].length }
      continue
    }

    prose.push(line)
  }
  // An unclosed fence runs to the end of the document (CommonMark), so any
  // remaining lines were already pushed verbatim. Only prose needs flushing.
  flushProse()

  return out.join("\n")
}

/**
 * Inline code spans are matched first and returned untouched; a span opens
 * with a run of N backticks and closes at the next run of exactly N. An
 * unmatched backtick run is literal text, so decoding continues past it.
 */
const INLINE_CODE_OR_AMP_RE = /(`+)[\s\S]*?(?<!`)\1(?!`)|&amp;(?![A-Za-z0-9#]+;)/g

function decodeProseAmp(text: string): string {
  return text.replace(INLINE_CODE_OR_AMP_RE, (match, codeRun: string | undefined) =>
    codeRun ? match : "&",
  )
}
