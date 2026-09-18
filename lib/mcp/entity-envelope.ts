/**
 * Entity → envelope-source resolution for the 5W+H tools (`get_5wh`, `audit_5wh`).
 *
 * Both tools previously carried their own inline `entity_type → table` map and
 * both assumed the target table has a `user_id` column. Two entity types break
 * that assumption:
 *
 *   - work_order_steps  — owned through its parent work_order
 *   - architecture_decisions (ADRs) — owned through its project
 *
 * and `decision` pointed at the wrong table entirely (see migration 055). The
 * result was a raw Postgres error (`column "user_id" does not exist`) surfacing
 * to agents as a tool failure.
 *
 * One table here, one query builder, both tools consume it — so a new entity
 * type cannot be half-registered again.
 */

import { sql } from "@/lib/db/client"

/** How a row's owning user is determined. */
export type OwnershipRule =
  /** The table itself carries the owning user id. */
  | { via: "column"; column: string }
  /** Ownership is inherited from a parent row via a foreign key. */
  | { via: "parent"; table: string; foreignKey: string; column: string }

export interface EnvelopeSource {
  readonly table: string
  readonly ownership: OwnershipRule
}

const OWNED_BY_USER: OwnershipRule = { via: "column", column: "user_id" }

/**
 * Every entity type whose 5W+H envelope can be read.
 *
 * `decision` is mlp_why_decisions — what create_decision/list_decisions write.
 * ADRs (the older /api/projects/[id]/adrs feature) keep their own type, `adr`.
 */
export const ENTITY_ENVELOPE_SOURCES: Readonly<Record<string, EnvelopeSource>> = {
  skill: { table: "skills", ownership: OWNED_BY_USER },
  feature_template: { table: "feature_templates", ownership: OWNED_BY_USER },
  protocol: { table: "protocols", ownership: OWNED_BY_USER },
  work_order: { table: "work_orders", ownership: OWNED_BY_USER },
  work_order_step: {
    table: "work_order_steps",
    ownership: { via: "parent", table: "work_orders", foreignKey: "work_order_id", column: "user_id" },
  },
  prompt: { table: "prompts", ownership: OWNED_BY_USER },
  idea: { table: "ideas", ownership: OWNED_BY_USER },
  todo: { table: "todos", ownership: OWNED_BY_USER },
  project: { table: "projects", ownership: OWNED_BY_USER },
  decision: { table: "mlp_why_decisions", ownership: OWNED_BY_USER },
  adr: {
    table: "architecture_decisions",
    ownership: { via: "parent", table: "projects", foreignKey: "project_id", column: "user_id" },
  },
  attempted_solution: { table: "attempted_solutions", ownership: OWNED_BY_USER },
  entity_relation: { table: "entity_relations", ownership: OWNED_BY_USER },
  spec_application: { table: "spec_applications", ownership: OWNED_BY_USER },
}

export const KNOWN_ENVELOPE_ENTITY_TYPES: readonly string[] = Object.keys(ENTITY_ENVELOPE_SOURCES)

/**
 * Tables that per-table envelope coverage may be counted over.
 *
 * Derived, not a second hand-maintained list: a table qualifies when it carries
 * the owning user id directly, because the coverage query filters on that
 * column. Tables owned through a parent (work_order_steps, architecture_decisions)
 * are deliberately excluded rather than silently miscounted.
 *
 * This doubles as the injection allowlist for the caller-supplied `table`
 * parameter — it reaches a SQL identifier position, so it must never be
 * interpolated unvalidated.
 */
export const AUDITABLE_ENVELOPE_TABLES: readonly string[] = Object.values(ENTITY_ENVELOPE_SOURCES)
  .filter((source) => source.ownership.via === "column")
  .map((source) => source.table)
  .sort()

export function isAuditableEnvelopeTable(table: string): boolean {
  return AUDITABLE_ENVELOPE_TABLES.includes(table)
}

export type EnvelopeLookup =
  | { ok: true; envelope: unknown }
  | { ok: false; reason: "unknown_type"; knownTypes: readonly string[] }
  | { ok: false; reason: "not_found" }

/**
 * Read one entity's stored envelope, scoped to the calling user.
 *
 * Identifiers come only from ENTITY_ENVELOPE_SOURCES (a fixed allowlist), never
 * from caller input, so interpolating them is safe; the id and user id stay
 * parameterized.
 */
export async function fetchEntityEnvelope(
  entityType: string,
  entityId: string,
  userId: string
): Promise<EnvelopeLookup> {
  const source = ENTITY_ENVELOPE_SOURCES[entityType]
  if (!source) {
    return { ok: false, reason: "unknown_type", knownTypes: KNOWN_ENVELOPE_ENTITY_TYPES }
  }

  const table = sql.unsafe(source.table)

  // The Neon client's template tag is typed as a union of possible result
  // shapes; every query here selects a single column, so narrow it once.
  const rows = (source.ownership.via === "column"
    ? await sql`
          SELECT documentation_5wh
          FROM ${table}
          WHERE id = ${entityId}::uuid
            AND ${sql.unsafe(source.ownership.column)} = ${userId}::uuid
          LIMIT 1
        `
    : await sql`
          SELECT child.documentation_5wh
          FROM ${table} AS child
          JOIN ${sql.unsafe(source.ownership.table)} AS parent
            ON parent.id = child.${sql.unsafe(source.ownership.foreignKey)}
          WHERE child.id = ${entityId}::uuid
            AND parent.${sql.unsafe(source.ownership.column)} = ${userId}::uuid
          LIMIT 1
        `) as Array<{ documentation_5wh: unknown }>

  if (!rows[0]) return { ok: false, reason: "not_found" }
  return { ok: true, envelope: rows[0].documentation_5wh }
}
