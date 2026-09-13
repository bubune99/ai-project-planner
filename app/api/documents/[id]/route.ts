import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { deleteFromR2 } from "@/lib/storage/r2-client";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { mergeEnvelopeForPatch, envelopeForSql } from "@/lib/api/envelope-helpers";
import { decodeTitleEntities, decodeMarkdownAmpEntities } from "@/lib/text/decode-entities";

export const dynamic = "force-dynamic"

;

/**
 * GET /api/documents/[id]
 * Get document details with version history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { userId } = authContext;
    const { id } = await params;

    // Get document with version history
    // First try the function, if it doesn't exist fall back to simple query
    let document;
    try {
      const result = await sql`
        SELECT * FROM get_document_with_versions(${id}::UUID)
      `;
      document = result[0];
    } catch {
      // Function may not exist, fall back to simple query
      const result = await sql`
        SELECT d.*,
          (SELECT json_agg(dv ORDER BY dv.version_number DESC)
           FROM document_versions dv
           WHERE dv.document_id = d.id) as versions
        FROM documents d
        WHERE d.id = ${id}
          AND d.user_id = ${userId}
          AND d.deleted_at IS NULL
      `;
      document = result[0];
    }

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ document });
  } catch (error: unknown) {
    console.error("Get document error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to get document", details: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/documents/[id]
 * Delete document from R2 storage and database (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { userId } = authContext;
    const { id } = await params;

    // Get document details (with ownership check)
    const docResult = await sql`
      SELECT
        d.id,
        d.project_id,
        d.blob_key,
        d.blob_url,
        d.title,
        d.user_id
      FROM documents d
      WHERE d.id = ${id}
        AND d.user_id = ${userId}
        AND d.deleted_at IS NULL
    `;

    if (docResult.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const document = docResult[0];

    // Delete from Cloudflare R2
    if (document.blob_key) {
      try {
        await deleteFromR2(document.blob_key);
      } catch (r2Error) {
        console.error("R2 deletion error:", r2Error);
        // Continue with database deletion even if R2 deletion fails
      }
    }

    // Soft delete in database
    await sql`
      UPDATE documents
      SET deleted_at = NOW()
      WHERE id = ${id}
    `;

    // Log to execution history
    await sql`
      INSERT INTO execution_history (
        project_id,
        user_id,
        event_type,
        description,
        old_value
      ) VALUES (
        ${document.project_id},
        ${userId},
        'document_deleted',
        ${`Document deleted: ${document.title}`},
        ${JSON.stringify({ documentId: document.id, title: document.title })}
      )
    `;

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error: unknown) {
    console.error("Delete error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Delete failed", details: message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/documents/[id]
 * Update a document's title, description, category, and (for pages) content.
 *
 * `content` replaces the body. Until 2026-09-13 this route could not change
 * content at all, and neither could the MCP, so documents were write-once.
 * Agents that need to add to a document should use MCP update_document with
 * mode="append", which is atomic under concurrent edits.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { userId } = authContext;
    const { id } = await params;
    const body = await request.json();
    const { description, category } = body;

    // Some clients HTML-encode their payload; normalise at the boundary.
    const title = typeof body.title === "string" ? decodeTitleEntities(body.title).trim() : undefined;
    if (body.content !== undefined && typeof body.content !== "string") {
      return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    }
    const content = typeof body.content === "string" ? decodeMarkdownAmpEntities(body.content) : null;

    // Fetch existing envelope + project_id for merge
    const existingDoc = await sql`SELECT documentation_5wh, project_id, blob_key FROM documents WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL`;

    if (content !== null && existingDoc[0]?.blob_key) {
      return NextResponse.json(
        { error: "This document is an uploaded file; its content cannot be edited" },
        { status: 400 }
      );
    }
    const mergeResult = mergeEnvelopeForPatch(
      existingDoc[0]?.documentation_5wh,
      body,
      { userId, projectId: existingDoc[0]?.project_id ?? undefined, agentId: undefined },
      {
        type: 'document',
        title: title || undefined,
        summary: description || body.summary,
        rationale: body?.documentation_5wh?.why?.rationale || 'Update via PATCH /api/documents/[id]',
      }
    );
    const hasEnvelope = mergeResult.ok;

    const result = await sql`
      UPDATE documents
      SET
        title             = COALESCE(${title || null}, title),
        description       = COALESCE(${description || null}, description),
        category          = COALESCE(${category || null}, category),
        content           = COALESCE(${content}::text, content),
        file_size         = CASE WHEN ${content}::text IS NULL THEN file_size ELSE octet_length(${content}::text) END,
        documentation_5wh = COALESCE(${hasEnvelope ? envelopeForSql(mergeResult.envelope) : null}::jsonb, documentation_5wh),
        version           = COALESCE(version, 1) + 1,
        last_edited_by    = ${userId},
        updated_at        = NOW()
      WHERE id = ${id}
        AND user_id = ${userId}
        AND deleted_at IS NULL
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const document = result[0];

    return NextResponse.json({
      success: true,
      document,
    });
  } catch (error: unknown) {
    console.error("Update error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Update failed", details: message },
      { status: 500 }
    );
  }
}
