/*
 * Replayed chat history for the model: assistant messages are stored as text,
 * so the tool calls behind them were invisible and the agent "corrected"
 * earlier answers it had in fact checked. toolNote() reads the saved trace
 * (metadata.trace) and returns a one-line note naming the tools that ran
 * successfully for that reply. Pure; asserted by history.assert.ts.
 */

const MAX_NAMES = 8

export function toolNote(metadata: unknown): string {
  const trace = (metadata as { trace?: unknown } | null | undefined)?.trace
  if (!Array.isArray(trace)) return ""
  const names: string[] = []
  for (const span of trace) {
    if (!span || typeof span !== "object") continue
    const s = span as { kind?: unknown; label?: unknown; status?: unknown }
    if (s.kind !== "tool" || typeof s.label !== "string" || s.status === "error") continue
    if (!names.includes(s.label)) names.push(s.label)
  }
  if (!names.length) return ""
  const shown = names.slice(0, MAX_NAMES).join(", ")
  return `\n\n[Tools used for this reply: ${shown}${names.length > MAX_NAMES ? ", …" : ""}]`
}

/** Message content for the model: the saved text plus, for assistant messages, the tool note. */
export function contentForModel(m: { role: string; content?: string | null; metadata?: unknown }): string {
  const base = m.content ?? ""
  return m.role === "assistant" ? base + toolNote(m.metadata) : base
}
