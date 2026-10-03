/*
 * Saved chat messages (ai_messages rows) → the UIMessage shape the chat UI
 * renders (AI SDK v5: { id, role, parts }).
 *
 * Text becomes a text part; stored file parts (attachments) are kept. Tool
 * calls are not replayed as parts: the old converter emitted the v4
 * "tool-invocation" shape, which this v5 UI does not render, and the
 * assistant's text already reports what its tools did.
 *
 * Pure. Assertions in lib/ai/chat-format.assert.ts.
 */

export interface StoredMessage {
  id: string
  role: string
  content?: string | null
  parts?: unknown
  createdAt?: string | Date | null
}

export interface UIChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  parts: { type: string; [k: string]: unknown }[]
  createdAt?: string
}

const ROLES = new Set(["user", "assistant", "system"])

export function toUIMessages(rows: StoredMessage[]): UIChatMessage[] {
  const out: UIChatMessage[] = []
  for (const m of rows) {
    if (!ROLES.has(m.role)) continue
    const parts: UIChatMessage["parts"] = []
    if (typeof m.content === "string" && m.content.trim()) parts.push({ type: "text", text: m.content })
    if (Array.isArray(m.parts)) {
      for (const p of m.parts) {
        if (p && typeof p === "object" && (p as { type?: unknown }).type === "file") parts.push(p as UIChatMessage["parts"][number])
      }
    }
    if (!parts.length) continue
    out.push({
      id: String(m.id),
      role: m.role as UIChatMessage["role"],
      parts,
      ...(m.createdAt ? { createdAt: new Date(m.createdAt).toISOString() } : {}),
    })
  }
  return out
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v)
