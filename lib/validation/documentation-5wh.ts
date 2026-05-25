/**
 * 5W+H universal documentation envelope — Zod schema + helpers.
 *
 * Locked design (memory: planner-meta-roadmap-septet, 2026-05-25):
 *   - Hard-from-day-one validation: API rejects 422 on missing starred fields.
 *   - Single polymorphic entity_relations table for typed cross-links.
 *   - Storage: documentation_5wh JSONB column on 35 planner tables.
 *
 * Methodology adopted verbatim from Memory-Agent's 5W+H framework.
 * Export-later compatibility: field names and dimensional split match MA's WHO/WHAT/WHEN/WHERE/WHY/HOW layers.
 */

import { z } from "zod";

// ============================================================================
// Sub-schemas
// ============================================================================

const ParentEntitySchema = z.object({
  type: z.string().min(1),
  id: z.string().uuid(),
});

const ExternalRefSchema = z.object({
  system: z.string().min(1), // 'github' | 'vercel' | 'stripe' | 'notion' | 'jira' | ...
  id: z.string().min(1),
  url: z.string().url().optional(),
  label: z.string().optional(),
});

const MilestoneSchema = z.object({
  at: z.string().datetime(),
  label: z.string().min(1),
});

const ContributorSchema = z.object({
  user_id: z.string().uuid().optional(),
  agent_id: z.string().optional(),
  name: z.string().optional(),
  role: z.string().optional(),
}).refine(
  (v) => Boolean(v.user_id || v.agent_id || v.name),
  { message: "contributor must have at least one of: user_id, agent_id, name" }
);

const RelatesToSchema = z.object({
  entity_type: z.string().min(1),
  id: z.string().uuid(),
  relation: z.enum([
    "supersedes",
    "derives_from",
    "related_to",
    "conflicts_with",
    "implements",
    "blocks",
    "part_of",
    "references",
    "promoted_from",
    "addresses",
    "inspired_by",
  ]).default("related_to"),
});

const ReferenceSchema = z.object({
  kind: z.enum(["doc", "example", "spec", "prompt", "sop", "template", "url", "code"]),
  id: z.string().min(1),
  label: z.string().optional(),
  url: z.string().url().optional(),
});

// ============================================================================
// Six dimensions
// ============================================================================

export const WhoSchema = z.object({
  user_id: z.string().uuid({ message: "who.user_id required" }),
  agent_id: z.string().optional(),
  role: z.string().optional(),
  contributors: z.array(ContributorSchema).optional(),
});

export const WhatSchema = z.object({
  title: z.string().min(1, { message: "what.title required" }).max(500),
  type: z.string().min(1, { message: "what.type required" }).max(64),
  summary: z.string().min(1, { message: "what.summary required" }).max(2000),
  scope: z.enum(["system", "project", "feature", "step", "personal"]).optional(),
});

export const WhenSchema = z.object({
  created_at: z.string().datetime({ message: "when.created_at must be ISO 8601 datetime" }),
  due_at: z.string().datetime().optional(),
  occurred_at: z.string().datetime().optional(),
  milestones: z.array(MilestoneSchema).optional(),
  supersedes_at: z.string().datetime().optional(),
});

export const WhereSchema = z.object({
  // Optional because user-scoped entities (ideas, todos, finance, etc.) have no project.
  // Audit tool reports missing project_id as 'user-scoped' (not incomplete).
  project_id: z.string().uuid().optional(),
  // Discriminator for entities that intentionally have no project (e.g. global skills, personal todos)
  scope_kind: z.enum(["project", "user", "system", "external"]).optional(),
  parent_entity: ParentEntitySchema.optional(),
  file_paths: z.array(z.string()).optional(),
  routes: z.array(z.string()).optional(),
  external_refs: z.array(ExternalRefSchema).optional(),
});

export const WhySchema = z.object({
  rationale: z.string().min(1, { message: "why.rationale required" }).max(5000),
  constraints: z.array(z.string()).optional(),
  decision_ids: z.array(z.string().uuid()).optional(),
  alternatives_considered: z.array(z.string()).optional(),
  relates_to: z.array(RelatesToSchema).optional(),
});

export const HowSchema = z.object({
  approach: z.string().optional(),
  instructions: z.string().optional(),
  references: z.array(ReferenceSchema).optional(),
  success_criteria: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
});

// ============================================================================
// Envelope (the canonical 5W+H shape)
// ============================================================================

export const Documentation5WHSchema = z.object({
  who: WhoSchema,
  what: WhatSchema,
  when: WhenSchema,
  where: WhereSchema,
  why: WhySchema,
  how: HowSchema.optional().default({}),
}).strict();

export type Documentation5WH = z.infer<typeof Documentation5WHSchema>;

// Permissive shape for PATCH operations — allows partial updates
export const Documentation5WHPartialSchema = z.object({
  who: WhoSchema.partial().optional(),
  what: WhatSchema.partial().optional(),
  when: WhenSchema.partial().optional(),
  where: WhereSchema.partial().optional(),
  why: WhySchema.partial().optional(),
  how: HowSchema.partial().optional(),
}).strict();

export type Documentation5WHPartial = z.infer<typeof Documentation5WHPartialSchema>;

// ============================================================================
// Helpers — build, validate, merge, audit
// ============================================================================

export type EnvelopeBuildContext = {
  userId: string;
  projectId: string;
  agentId?: string;
};

/**
 * Build a complete envelope from a raw payload + context.
 * Auto-populates auto-derivable fields (who.user_id, when.created_at, where.project_id)
 * from context if absent. Then validates the result. Throws ZodError if invalid.
 *
 * Use this in POST handlers right before INSERT.
 */
export function buildEnvelope(
  raw: Partial<Documentation5WH> | undefined | null,
  ctx: EnvelopeBuildContext,
  derive: {
    title?: string;
    type?: string;
    summary?: string;
    rationale?: string;
  } = {}
): Documentation5WH {
  const r = raw ?? {};
  const nowIso = new Date().toISOString();

  const candidate: Partial<Documentation5WH> = {
    who: {
      user_id: r.who?.user_id ?? ctx.userId,
      agent_id: r.who?.agent_id ?? ctx.agentId,
      role: r.who?.role,
      contributors: r.who?.contributors,
    },
    what: {
      title: r.what?.title ?? derive.title ?? "",
      type: r.what?.type ?? derive.type ?? "",
      summary: r.what?.summary ?? derive.summary ?? "",
      scope: r.what?.scope,
    },
    when: {
      created_at: r.when?.created_at ?? nowIso,
      due_at: r.when?.due_at,
      occurred_at: r.when?.occurred_at,
      milestones: r.when?.milestones,
      supersedes_at: r.when?.supersedes_at,
    },
    where: {
      project_id: r.where?.project_id ?? ctx.projectId,
      scope_kind: r.where?.scope_kind ?? (ctx.projectId ? "project" : "user"),
      parent_entity: r.where?.parent_entity,
      file_paths: r.where?.file_paths,
      routes: r.where?.routes,
      external_refs: r.where?.external_refs,
    },
    why: {
      rationale: r.why?.rationale ?? derive.rationale ?? "",
      constraints: r.why?.constraints,
      decision_ids: r.why?.decision_ids,
      alternatives_considered: r.why?.alternatives_considered,
      relates_to: r.why?.relates_to,
    },
    how: r.how ?? {},
  };

  return Documentation5WHSchema.parse(candidate);
}

/**
 * Validate an existing envelope (for PATCH workflows where it's been built).
 * Returns parsed envelope or throws ZodError.
 */
export function validateEnvelope(envelope: unknown): Documentation5WH {
  return Documentation5WHSchema.parse(envelope);
}

/**
 * Safe-validate (does not throw — returns success or error object).
 */
export function safeValidateEnvelope(envelope: unknown) {
  return Documentation5WHSchema.safeParse(envelope);
}

/**
 * Validate a partial envelope (for PATCH updates).
 */
export function validateEnvelopePartial(envelope: unknown): Documentation5WHPartial {
  return Documentation5WHPartialSchema.parse(envelope);
}

/**
 * Merge a partial envelope into an existing one. Deep-merge per dimension.
 * For arrays: replace, don't concat (caller can pre-merge if accumulation desired).
 */
export function mergeEnvelope(
  existing: Documentation5WH,
  patch: Documentation5WHPartial
): Documentation5WH {
  return {
    who: { ...existing.who, ...(patch.who ?? {}) },
    what: { ...existing.what, ...(patch.what ?? {}) },
    when: { ...existing.when, ...(patch.when ?? {}) },
    where: { ...existing.where, ...(patch.where ?? {}) },
    why: { ...existing.why, ...(patch.why ?? {}) },
    how: { ...existing.how, ...(patch.how ?? {}) },
  } as Documentation5WH;
}

/**
 * Audit envelope completeness — returns score 0–100 and list of empty optional fields.
 * Used by audit_5wh_completeness MCP tool (Phase 11 / G L4).
 */
export function auditCompleteness(envelope: Documentation5WH): {
  score: number;
  filled: string[];
  empty: string[];
} {
  const optionalFields = [
    ["who.agent_id", envelope.who.agent_id],
    ["who.role", envelope.who.role],
    ["who.contributors", envelope.who.contributors],
    ["what.scope", envelope.what.scope],
    ["when.due_at", envelope.when.due_at],
    ["when.occurred_at", envelope.when.occurred_at],
    ["when.milestones", envelope.when.milestones],
    ["where.parent_entity", envelope.where.parent_entity],
    ["where.file_paths", envelope.where.file_paths],
    ["where.routes", envelope.where.routes],
    ["where.external_refs", envelope.where.external_refs],
    ["why.constraints", envelope.why.constraints],
    ["why.decision_ids", envelope.why.decision_ids],
    ["why.alternatives_considered", envelope.why.alternatives_considered],
    ["why.relates_to", envelope.why.relates_to],
    ["how.approach", envelope.how.approach],
    ["how.instructions", envelope.how.instructions],
    ["how.references", envelope.how.references],
    ["how.success_criteria", envelope.how.success_criteria],
    ["how.risks", envelope.how.risks],
  ] as const;

  const filled: string[] = [];
  const empty: string[] = [];
  for (const [name, val] of optionalFields) {
    const isFilled =
      val !== undefined && val !== null && (Array.isArray(val) ? val.length > 0 : val !== "");
    if (isFilled) filled.push(name);
    else empty.push(name);
  }

  // Score: starred fields always present (validated) = 50 base points
  //        Optional fields contribute up to 50 points
  const optionalScore = Math.round((filled.length / optionalFields.length) * 50);
  return { score: 50 + optionalScore, filled, empty };
}

/**
 * Format Zod errors as field-level error response (for 422 JSON body).
 */
export function formatEnvelopeErrors(error: z.ZodError): {
  message: string;
  fields: Array<{ path: string; message: string }>;
} {
  return {
    message: "5W+H envelope validation failed",
    fields: error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}

// ============================================================================
// Helper: validate envelope from a request body for write endpoints.
// Convenience wrapper used by API route patches in Phase 1f.
// ============================================================================

export type RequireEnvelopeResult =
  | { ok: true; envelope: Documentation5WH }
  | { ok: false; status: 422; body: ReturnType<typeof formatEnvelopeErrors> };

/**
 * Require + build envelope from raw API body. Suitable for POST handlers.
 * If raw.documentation_5wh missing, auto-build from context + derive fields.
 * If present but incomplete starred fields, return 422.
 */
export function requireEnvelopeForWrite(
  rawBody: { documentation_5wh?: Partial<Documentation5WH> } & Record<string, unknown>,
  ctx: EnvelopeBuildContext,
  derive: {
    title?: string;
    type?: string;
    summary?: string;
    rationale?: string;
  } = {}
): RequireEnvelopeResult {
  try {
    const envelope = buildEnvelope(rawBody.documentation_5wh, ctx, derive);
    return { ok: true, envelope };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, status: 422, body: formatEnvelopeErrors(err) };
    }
    throw err;
  }
}
