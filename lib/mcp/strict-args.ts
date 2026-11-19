/**
 * A tool call naming a field the tool does not take is refused, never quietly trimmed.
 *
 * The MCP library builds each tool's schema with zod's default "strip": unknown fields vanish and the call succeeds.
 * Found 2026-11-19: update_task was given a closing note, answered updated:true, and the note was gone, so the
 * agent believed the proof was on the card. Pure; checked by strict-args.assert.ts.
 */

export interface CallProblem { id: unknown; tool: string; unknown: string[]; accepted: string[] }

/** The fields of `args` that the tool's field list does not have. */
export function unknownFields(accepted: readonly string[], args: unknown): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return []
  const ok = new Set(accepted)
  return Object.keys(args).filter((k) => !ok.has(k))
}

/** Every tools/call in a JSON-RPC body (single or batch) that names an unknown field. Never throws. */
export function callProblems(body: unknown, fieldsOf: (tool: string) => readonly string[] | undefined): CallProblem[] {
  const msgs = Array.isArray(body) ? body : [body]
  const out: CallProblem[] = []
  for (const m of msgs) {
    if (!m || typeof m !== "object" || (m as { method?: unknown }).method !== "tools/call") continue
    const params = (m as { params?: { name?: unknown; arguments?: unknown } }).params
    if (typeof params?.name !== "string") continue
    const accepted = fieldsOf(params.name)
    if (!accepted) continue // an unknown tool is the library's to answer
    const bad = unknownFields(accepted, params.arguments)
    if (bad.length) out.push({ id: (m as { id?: unknown }).id ?? null, tool: params.name, unknown: bad, accepted: [...accepted] })
  }
  return out
}

export function problemText(p: CallProblem): string {
  return `${p.tool} does not take ${p.unknown.map((k) => `"${k}"`).join(", ")}, so nothing was changed. It takes: ${p.accepted.join(", ") || "no fields"}.${p.unknown.includes("note") && p.accepted.length ? " To leave a note on a card, use add_task_comment." : ""}${p.unknown.includes("documentation_5wh") ? (p.accepted.includes("rationale") ? " Put the why in rationale instead." : " This tool records its 5W+H envelope itself; say the why in the description.") : ""}`
}
