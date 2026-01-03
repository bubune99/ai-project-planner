/**
 * Cloudflare R2 Storage Client
 * S3-compatible API for file storage
 *
 * Environment Variables Required:
 * - R2_ACCOUNT_ID: Cloudflare account ID
 * - R2_ACCESS_KEY_ID: R2 API token access key
 * - R2_SECRET_ACCESS_KEY: R2 API token secret key
 * - R2_BUCKET_NAME: Name of the R2 bucket
 * - R2_PUBLIC_URL: (Optional) Custom domain or public bucket URL
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Configuration from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// Validate required environment variables
function validateConfig() {
  const missing: string[] = [];
  if (!R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!R2_BUCKET_NAME) missing.push("R2_BUCKET_NAME");

  if (missing.length > 0) {
    throw new Error(
      `Missing required R2 environment variables: ${missing.join(", ")}`
    );
  }
}

// Create S3 client for R2
export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Check if R2 is properly configured
 */
export function isR2Configured(): boolean {
  return !!(
    R2_ACCOUNT_ID &&
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_BUCKET_NAME
  );
}

/**
 * Generate the public URL for a file
 */
export function getPublicUrl(key: string): string {
  if (R2_PUBLIC_URL) {
    // Use custom domain/CDN URL
    return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  // Use R2 public bucket URL (requires public access enabled on bucket)
  return `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | Blob,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ key: string; url: string; size: number }> {
  validateConfig();

  // Convert Blob to Buffer if needed
  let uploadBody: Buffer | Uint8Array;
  if (body instanceof Blob) {
    uploadBody = Buffer.from(await body.arrayBuffer());
  } else {
    uploadBody = body;
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: uploadBody,
      ContentType: contentType,
      Metadata: metadata,
    })
  );

  return {
    key,
    url: getPublicUrl(key),
    size: uploadBody.length,
  };
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(key: string): Promise<void> {
  validateConfig();

  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

/**
 * Delete multiple files from R2
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<void> {
  validateConfig();

  // Delete in parallel (R2 doesn't have DeleteObjects, so we delete one by one)
  await Promise.all(keys.map((key) => deleteFromR2(key)));
}

/**
 * Get a signed download URL (for private buckets)
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  validateConfig();

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Get a signed upload URL (for client-side uploads)
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  validateConfig();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Check if a file exists in R2
 */
export async function fileExistsInR2(key: string): Promise<boolean> {
  validateConfig();

  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );
    return true;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "name" in error &&
      error.name === "NotFound"
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Get file metadata from R2
 */
export async function getFileMetadata(key: string): Promise<{
  contentType?: string;
  contentLength?: number;
  lastModified?: Date;
  metadata?: Record<string, string>;
} | null> {
  validateConfig();

  try {
    const response = await r2Client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );

    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      metadata: response.Metadata,
    };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "name" in error &&
      error.name === "NotFound"
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * List files in a directory (prefix)
 */
export async function listFilesInR2(
  prefix: string,
  maxKeys: number = 1000
): Promise<
  Array<{
    key: string;
    size: number;
    lastModified: Date;
  }>
> {
  validateConfig();

  const response = await r2Client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: maxKeys,
    })
  );

  return (response.Contents || []).map((item) => ({
    key: item.Key!,
    size: item.Size || 0,
    lastModified: item.LastModified || new Date(),
  }));
}

/**
 * Generate a storage key for user files
 * Format: users/{userId}/projects/{projectId}/{timestamp}-{filename}
 */
export function generateStorageKey(
  userId: string,
  projectId: string,
  filename: string
): string {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `users/${userId}/projects/${projectId}/${timestamp}-${sanitizedFilename}`;
}

/**
 * Copy a file within R2 (for versioning or duplication)
 */
export async function copyFileInR2(
  sourceKey: string,
  destinationKey: string
): Promise<{ key: string; url: string }> {
  validateConfig();

  // R2 doesn't support CopyObject, so we need to download and re-upload
  const getResponse = await r2Client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: sourceKey,
    })
  );

  const body = await getResponse.Body?.transformToByteArray();
  if (!body) {
    throw new Error("Failed to read source file");
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: destinationKey,
      Body: body,
      ContentType: getResponse.ContentType,
      Metadata: getResponse.Metadata,
    })
  );

  return {
    key: destinationKey,
    url: getPublicUrl(destinationKey),
  };
}
