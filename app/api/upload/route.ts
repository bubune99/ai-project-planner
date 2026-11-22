import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import crypto from "crypto";
import {
  uploadToR2,
  getSignedUploadUrl,
  isR2Configured,
  getPublicUrl,
} from "@/lib/storage/r2-client";
import { getAuthContext, verifyProjectWriteAccess } from "@/lib/auth/auth-utils";
import { checkRateLimit, HOUR_MS } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES, extensionFor, storageKeyFor, uploadRefusal } from "@/lib/storage/upload-rules";

/** Uploads (direct or presigned) per user per hour. */
const UPLOADS_PER_HOUR = 30;

function uploadLimited() {
  return NextResponse.json(
    { error: `Upload limit reached (${UPLOADS_PER_HOUR} per hour). Try again later.`, code: "RATE_LIMITED" },
    { status: 429 }
  );
}

export const dynamic = "force-dynamic"

/**
 * POST /api/upload
 * Upload file to Cloudflare R2 and create document record
 */
export async function POST(request: NextRequest) {
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

    if (!(await checkRateLimit(`upload:${userId}`, UPLOADS_PER_HOUR, HOUR_MS))) {
      return uploadLimited();
    }

    // Check R2 configuration
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "Storage not configured. Please set R2 environment variables." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;
    const category = (formData.get("category") as string) || "other";
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;

    // Validation
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID required" },
        { status: 400 }
      );
    }

    // Verify project ownership before allowing upload
    const { verifyProjectOwnership } = await import("@/lib/auth/auth-utils");
    const hasAccess = await verifyProjectWriteAccess(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 403 }
      );
    }

    // Size and type: what may be stored is decided in lib/storage/upload-rules.ts
    const refusal = uploadRefusal({ type: file.type, size: file.size });
    if (refusal) {
      return NextResponse.json({ error: refusal }, { status: 400 });
    }

    // Calculate content hash for deduplication
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Check for existing file with same hash in this project
    const existingDocs = await sql`
      SELECT id, blob_url, title, blob_key FROM documents
      WHERE project_id = ${projectId}
        AND content_hash = ${hash}
        AND deleted_at IS NULL
    `;

    if (existingDocs.length > 0) {
      const existing = existingDocs[0];
      return NextResponse.json({
        message: "File already exists in this project",
        documentId: existing.id,
        blobUrl: existing.blob_url,
        duplicate: true,
        existingTitle: existing.title,
      });
    }

    // The stored name is made here (a random id and the ending for the allowed type). The name the browser sent
    // is kept only as display metadata below: it never becomes part of the key.
    const storageKey = storageKeyFor(userId, projectId, file.type, crypto.randomUUID());
    if (!storageKey) {
      return NextResponse.json({ error: "Project ID is not valid" }, { status: 400 });
    }

    // Upload to Cloudflare R2
    const uploadResult = await uploadToR2(storageKey, buffer, file.type, {
      originalName: file.name,
      projectId,
      userId,
      uploadedAt: new Date().toISOString(),
    });

    // Generate thumbnail for images (placeholder - would use Sharp or image processing)
    let thumbnailUrl = null;
    const metadata: Record<string, unknown> = {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    };

    if (file.type.startsWith("image/")) {
      // For now, use the original image as thumbnail
      // TODO: Implement actual thumbnail generation with Sharp
      thumbnailUrl = uploadResult.url;
      metadata.isImage = true;
    }

    // Create document record
    const documentResult = await sql`
      INSERT INTO documents (
        project_id,
        user_id,
        title,
        description,
        blob_key,
        blob_url,
        thumbnail_url,
        file_type,
        file_size,
        category,
        content_hash,
        uploaded_by,
        metadata
      ) VALUES (
        ${projectId},
        ${userId},
        ${title || file.name},
        ${description || null},
        ${storageKey},
        ${uploadResult.url},
        ${thumbnailUrl},
        ${file.type},
        ${file.size},
        ${category},
        ${hash},
        ${userId},
        ${JSON.stringify(metadata)}
      )
      RETURNING *
    `;

    const document = documentResult[0];

    // Log to execution history
    await sql`
      INSERT INTO execution_history (
        project_id,
        user_id,
        event_type,
        description,
        new_value
      ) VALUES (
        ${projectId},
        ${userId},
        'document_uploaded',
        ${`Document uploaded: ${document.title}`},
        ${JSON.stringify({
          documentId: document.id,
          fileName: file.name,
          fileSize: file.size,
          category,
        })}
      )
    `;

    return NextResponse.json({
      success: true,
      document,
      blobUrl: uploadResult.url,
      downloadUrl: uploadResult.url,
    });
  } catch (error: unknown) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? message : 'Upload failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/upload?projectId=yyy&contentType=zzz
 * Get presigned upload URL for client-side direct upload to R2. Only for a project the caller may write to, only
 * for an allowed type, and under a name made here.
 */
export async function GET(request: NextRequest) {
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

    if (!(await checkRateLimit(`upload:${userId}`, UPLOADS_PER_HOUR, HOUR_MS))) {
      return uploadLimited();
    }

    // Check R2 configuration
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "Storage not configured. Please set R2 environment variables." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const contentType = searchParams.get("contentType") || "";

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId parameter" },
        { status: 400 }
      );
    }

    if (!extensionFor(contentType)) {
      return NextResponse.json(
        { error: "Missing or invalid contentType. Allowed types: images, PDFs, spreadsheets, documents." },
        { status: 400 }
      );
    }

    // The stored name is made here; a project id that is not an id gets no key and no lookup.
    const storageKey = storageKeyFor(userId, projectId, contentType, crypto.randomUUID());
    if (!storageKey || !(await verifyProjectWriteAccess(projectId, userId))) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 403 }
      );
    }

    // Get presigned URL for direct upload
    const uploadUrl = await getSignedUploadUrl(storageKey, contentType, 3600);

    return NextResponse.json({
      uploadUrl,
      storageKey,
      publicUrl: getPublicUrl(storageKey),
      maxSize: MAX_UPLOAD_BYTES, // 50MB
      expiresIn: 3600, // 1 hour
    });
  } catch (error: unknown) {
    console.error("Get upload URL error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? message : 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}

// Mark as dynamic to prevent static generation
;
