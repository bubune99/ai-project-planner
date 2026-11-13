/**
 * How the knowledge graph looks up the item on each end of a link.
 *
 * Links are filtered to the caller, but a link can point at any id, so every
 * lookup also proves the item belongs to the caller: directly (user_id) or
 * through its parent (project, idea, work order). Pure: builds SQL text only.
 * Table and column names come from this file, never from the request.
 * Checked by lookup.assert.ts.
 */

type Owner = "user" | "project" | "idea" | "work_order" | "feedback" | "user_or_project"

export interface EntityLookup {
  table: string
  titleCol: string
  summaryCol?: string
  extraCols?: string[]
  owner: Owner
}

export const ENTITY_LOOKUP: Record<string, EntityLookup> = {
  idea: { table: "ideas", titleCol: "title", summaryCol: "description", extraCols: ["lifecycle", "category"], owner: "user" },
  todo: { table: "todos", titleCol: "title", summaryCol: "description", extraCols: ["status"], owner: "user" },
  project: { table: "projects", titleCol: "name", summaryCol: "description", extraCols: ["status"], owner: "user" },
  sop: { table: "sops", titleCol: "title", summaryCol: "content", extraCols: ["status", "category"], owner: "user" },
  // Decisions are written to mlp_why_decisions (create_decision, the Ideas & decisions tab).
  decision: { table: "mlp_why_decisions", titleCol: "title", summaryCol: "summary", extraCols: ["status"], owner: "user" },
  architecture_decision: { table: "mlp_why_decisions", titleCol: "title", summaryCol: "summary", extraCols: ["status"], owner: "user" },
  adr: { table: "architecture_decisions", titleCol: "title", summaryCol: "decision", extraCols: ["status"], owner: "project" },
  document: { table: "documents", titleCol: "title", summaryCol: "description", extraCols: ["category"], owner: "user_or_project" },
  feature_template: { table: "feature_templates", titleCol: "title", summaryCol: "description", extraCols: ["status", "category"], owner: "user" },
  skill: { table: "skills", titleCol: "title", summaryCol: "description", extraCols: ["status", "category"], owner: "user" },
  protocol: { table: "protocols", titleCol: "title", summaryCol: "description", extraCols: ["status", "category"], owner: "user" },
  work_order: { table: "work_orders", titleCol: "title", summaryCol: "description", extraCols: ["status"], owner: "user" },
  work_order_step: { table: "work_order_steps", titleCol: "title", summaryCol: "description", extraCols: ["status", "step_type"], owner: "work_order" },
  prompt: { table: "prompts", titleCol: "name", summaryCol: "purpose", extraCols: ["status", "trigger_event"], owner: "user" },
  client: { table: "clients", titleCol: "name", summaryCol: "notes", extraCols: ["status"], owner: "user" },
  service_schedule: { table: "service_schedules", titleCol: "title", summaryCol: "description", owner: "user" },
  feedback: { table: "feedback", titleCol: "title", summaryCol: "comment", extraCols: ["status"], owner: "feedback" },
  idea_facet: { table: "idea_facets", titleCol: "name", extraCols: ["facet_type"], owner: "idea" },
  idea_refinement: { table: "idea_refinements", titleCol: "title", summaryCol: "description", extraCols: ["status", "refinement_type"], owner: "idea" },
  idea_document: { table: "idea_documents", titleCol: "title", extraCols: ["document_type", "version"], owner: "idea" },
}

/** Own keys only: "__proto__" and "constructor" are not item types. */
const lookupFor = (entityType: string): EntityLookup | undefined =>
  Object.prototype.hasOwnProperty.call(ENTITY_LOOKUP, entityType) ? ENTITY_LOOKUP[entityType] : undefined

/** Older links may point a decision at the ADR table; look there second. */
const THEN_TRY: Record<string, string> = { decision: "adr", architecture_decision: "adr" }

const MY_PROJECTS = "(SELECT id FROM projects WHERE user_id = $2)"

const OWNED: Record<Owner, string> = {
  user: "t.user_id = $2",
  project: `t.project_id IN ${MY_PROJECTS}`,
  idea: "t.idea_id IN (SELECT id FROM ideas WHERE user_id = $2)",
  work_order: "t.work_order_id IN (SELECT id FROM work_orders WHERE user_id = $2)",
  feedback: `(t.reporter_user_id::text = $2::text OR t.project_id IN ${MY_PROJECTS})`,
  user_or_project: `(t.user_id = $2 OR t.project_id IN ${MY_PROJECTS})`,
}

export interface NodeQuery { text: string; lookup: EntityLookup }

function queryFor(lookup: EntityLookup): NodeQuery {
  const cols = [lookup.titleCol, lookup.summaryCol, ...(lookup.extraCols ?? [])].filter(Boolean).map((c) => `t.${c}`)
  return { text: `SELECT ${cols.join(", ")} FROM ${lookup.table} t WHERE t.id = $1 AND ${OWNED[lookup.owner]} LIMIT 1`, lookup }
}

/**
 * The lookups to try for one item, in order: $1 is the item id, $2 the
 * caller's user id. Empty for a type the graph has no table for.
 */
export function nodeQueries(entityType: string): NodeQuery[] {
  const first = lookupFor(entityType)
  if (!first) return []
  const second = lookupFor(THEN_TRY[entityType] ?? "")
  return second ? [queryFor(first), queryFor(second)] : [queryFor(first)]
}

export interface GraphNode {
  id: string
  type: string
  title: string
  summary?: string
  metadata: Record<string, unknown>
}

/** A dot with no details: used when an item can't be shown (not found, not the caller's, or the query failed). */
export const placeholderNode = (entityType: string, entityId: string): GraphNode => ({
  id: entityId,
  type: entityType,
  title: `${entityType.replace(/_/g, " ")} ${entityId.slice(0, 8)}`,
  metadata: {},
})

/** Turn a row into a node; no row means a placeholder, never someone else's data. */
export function toNode(entityType: string, entityId: string, lookup: EntityLookup | undefined, row: Record<string, unknown> | undefined): GraphNode {
  if (!lookup || !row) return placeholderNode(entityType, entityId)
  const label = entityType.replace(/_/g, " ")
  const metadata: Record<string, unknown> = {}
  for (const c of lookup.extraCols ?? []) metadata[c] = row[c]
  const summary = lookup.summaryCol ? row[lookup.summaryCol] : undefined
  return {
    id: entityId,
    type: entityType,
    title: (row[lookup.titleCol] as string) || `(untitled ${label})`,
    summary: typeof summary === "string" && summary ? summary.slice(0, 600) : undefined,
    metadata,
  }
}
