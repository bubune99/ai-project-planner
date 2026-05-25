/**
 * API-layer helpers for the 5W+H documentation envelope.
 *
 * Two modes:
 *   - LEGACY: auto-derives all starred fields from request body + session + URL.
 *             Used for pre-existing endpoints during the rollout.
 *             Stamps `metadata.envelope_origin = 'legacy_derived'` on the parent row.
 *   - STRICT: requires explicit documentation_5wh in request body OR explicit derive args.
 *             Returns 422 if missing.
 *             Used for NEW endpoints (library/work_orders/prompts).
 *
 * Both modes always end with a fully validated envelope being stored. The contract
 * (envelope exists and validates) is hard-from-day-one in both modes; legacy mode is
 * lenient on WHERE the rationale comes from (auto-derived ok), strict mode requires
 * the caller to provide explicit rationale.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  type Documentation5WH,
  type Documentation5WHPartial,
  buildEnvelope,
  validateEnvelope,
  formatEnvelopeErrors,
  mergeEnvelope,
} from "@/lib/validation/documentation-5wh";
import { errorResponse, ErrorCodes } from "@/lib/api-utils";

// ============================================================================
// Mode + result types
// ============================================================================

export type EnvelopeMode = "legacy" | "strict";

export type EnvelopeContext = {
  userId: string;
  projectId?: string; // optional — some entities are user-scoped not project-scoped
  agentId?: string;
};

export type EnvelopeDeriveHints = {
  /** Resource type discriminator. Use the API resource name (e.g. 'idea', 'todo', 'sop'). */
  type: string;
  /** Title from request body — typically body.title / body.name / body.subject. */
  title?: string;
  /** Summary from request body — typically body.description / body.content / first 200 chars. */
  summary?: string;
  /** Rationale — caller-supplied (strict mode) or auto-generated (legacy mode). */
  rationale?: string;
};

export type EnvelopeBuildResult =
  | {
      ok: true;
      envelope: Documentation5WH;
      origin: "explicit" | "legacy_derived";
    }
  | {
      ok: false;
      response: NextResponse;
    };

// ============================================================================
// Core builder — used by POST handlers
// ============================================================================

/**
 * Build an envelope for a new entity write. Handles both legacy and strict modes.
 *
 * Returns either { ok: true, envelope } to use in the INSERT, or { ok: false, response }
 * to return directly from the route handler.
 *
 * @param rawBody - Parsed JSON request body
 * @param ctx - Auth/route context (userId, projectId, agentId)
 * @param hints - Derive hints from body fields (type is mandatory)
 * @param mode - 'legacy' (auto-derive everything) or 'strict' (require explicit envelope)
 */
export function buildEnvelopeForWrite(
  rawBody: { documentation_5wh?: unknown } & Record<string, unknown>,
  ctx: EnvelopeContext,
  hints: EnvelopeDeriveHints,
  mode: EnvelopeMode = "legacy"
): EnvelopeBuildResult {
  const explicitEnvelope = rawBody.documentation_5wh as
    | Partial<Documentation5WH>
    | undefined;

  // Auto-derive starred fields from hints + context
  const derived = {
    title: hints.title?.toString().trim() || `Untitled ${hints.type}`,
    type: hints.type,
    summary:
      hints.summary?.toString().trim() ||
      hints.title?.toString().trim() ||
      `(${hints.type} record)`,
    rationale:
      hints.rationale?.toString().trim() ||
      (mode === "legacy"
        ? `Auto-derived: created via ${hints.type} API endpoint at ${new Date().toISOString()}`
        : ""), // strict mode: empty rationale will fail validation
  };

  // Effective projectId — explicit > derived from rawBody > ctx; may be undefined for user-scoped entities
  const effectiveProjectId =
    (rawBody.project_id as string | undefined) ??
    ctx.projectId ??
    (explicitEnvelope?.where?.project_id as string | undefined);

  try {
    const envelope = buildEnvelope(
      explicitEnvelope,
      {
        userId: ctx.userId,
        projectId: effectiveProjectId,
        agentId: ctx.agentId,
      },
      derived
    );

    return {
      ok: true,
      envelope,
      origin: explicitEnvelope ? "explicit" : "legacy_derived",
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        ok: false,
        response: errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          "5W+H envelope validation failed",
          422,
          formatEnvelopeErrors(err)
        ),
      };
    }
    throw err;
  }
}

// ============================================================================
// PATCH/UPDATE builder — merges incoming partial onto existing stored envelope
// ============================================================================

export type EnvelopePatchResult =
  | { ok: true; envelope: Documentation5WH }
  | { ok: false; response: NextResponse };

/**
 * Merge a partial envelope from a PATCH request onto the existing stored envelope.
 * Used by PATCH/PUT handlers.
 */
export function mergeEnvelopeForPatch(
  existing: Documentation5WH | Record<string, unknown> | null | undefined,
  rawBody: { documentation_5wh?: Partial<Documentation5WHPartial> } & Record<string, unknown>,
  ctx: EnvelopeContext,
  hints: EnvelopeDeriveHints
): EnvelopePatchResult {
  // If there's no existing envelope (legacy row), build a fresh one
  if (!existing || Object.keys(existing as object).length === 0) {
    const built = buildEnvelopeForWrite(
      rawBody as never,
      ctx,
      hints,
      "legacy"
    );
    if (!built.ok) return built;
    return { ok: true, envelope: built.envelope };
  }

  try {
    const parsedExisting = validateEnvelope(existing);
    const patch = (rawBody.documentation_5wh ?? {}) as Documentation5WHPartial;
    const merged = mergeEnvelope(parsedExisting, patch);
    // Re-validate full envelope after merge
    return { ok: true, envelope: validateEnvelope(merged) };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        ok: false,
        response: errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          "5W+H envelope merge/validation failed",
          422,
          formatEnvelopeErrors(err)
        ),
      };
    }
    throw err;
  }
}

// ============================================================================
// Helpers for SQL — converts envelope to/from JSONB safely
// ============================================================================

/**
 * Serialize envelope for SQL JSONB parameter. Use as `[...other, JSON.stringify(envelope)]`
 * in parameterized queries.
 */
export function envelopeForSql(envelope: Documentation5WH): string {
  return JSON.stringify(envelope);
}

/**
 * Stamp origin marker into row metadata. Pass the parent row's existing metadata + the build result;
 * returns the metadata to write back. Use when legacy_derived so audit knows to flag for enrichment.
 */
export function stampEnvelopeOrigin(
  existingMetadata: Record<string, unknown> | null | undefined,
  origin: "explicit" | "legacy_derived"
): Record<string, unknown> {
  const base = (existingMetadata as Record<string, unknown>) ?? {};
  return {
    ...base,
    envelope_origin: origin,
    envelope_origin_at: new Date().toISOString(),
  };
}
