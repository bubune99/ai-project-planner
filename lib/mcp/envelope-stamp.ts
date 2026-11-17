/**
 * The 5W+H envelope for rows the MCP create tools write (Program 1 finding F1, card cfc3cf90).
 *
 * create_task, create_todo, create_idea, create_document and create_decision inserted rows with no envelope at all
 * (416 of 416 cards made in a week were empty), and none of them accepted the rationale the agent contract asks
 * agents to give. Each now takes an optional `rationale` and stamps the envelope the HTTP routes already build
 * (buildEnvelopeForWrite, legacy mode: a missing rationale is recorded as auto-derived, never invented).
 *
 * mcpEnvelope is pure (check file: envelope-stamp.assert.ts); stampEnvelope writes it to one row.
 */
import { buildEnvelopeForWrite } from "@/lib/api/envelope-helpers"
import type { Documentation5WH } from "@/lib/validation/documentation-5wh"

export type StampTable = "project_steps" | "todos" | "ideas" | "documents" | "mlp_why_decisions"

export interface StampInput {
  type: string
  title: string
  summary?: string | null
  rationale?: string | null
  userId: string
  projectId?: string | null
}

/** The envelope for a new row, or null when it cannot be built (the row is kept either way). */
export function mcpEnvelope(input: StampInput): Documentation5WH | null {
  const rationale = input.rationale?.trim() || undefined
  const projectId = input.projectId || undefined
  const built = buildEnvelopeForWrite(
    { project_id: projectId },
    { userId: input.userId, projectId },
    { type: input.type, title: input.title, summary: input.summary?.trim() || undefined, rationale },
    "legacy"
  )
  return built.ok ? built.envelope : null
}

/** Write the envelope to the row just created. Never throws: a failed stamp must not fail the create. */
export async function stampEnvelope(table: StampTable, id: string, input: StampInput): Promise<void> {
  const envelope = mcpEnvelope(input)
  if (!envelope || !id) return
  const json = JSON.stringify(envelope)
  try {
    const { sql } = await import("@/lib/db/client")
    // One statement per table: the table name cannot be a query parameter.
    if (table === "project_steps") await sql`UPDATE project_steps SET documentation_5wh = ${json}::jsonb WHERE id = ${id}`
    else if (table === "todos") await sql`UPDATE todos SET documentation_5wh = ${json}::jsonb WHERE id = ${id}`
    else if (table === "ideas") await sql`UPDATE ideas SET documentation_5wh = ${json}::jsonb WHERE id = ${id}`
    else if (table === "documents") await sql`UPDATE documents SET documentation_5wh = ${json}::jsonb WHERE id = ${id}`
    else if (table === "mlp_why_decisions") await sql`UPDATE mlp_why_decisions SET documentation_5wh = ${json}::jsonb WHERE id = ${id}`
  } catch (e) {
    console.error(`[mcp] envelope stamp failed for ${table} ${id}:`, e instanceof Error ? e.message : e)
  }
}
