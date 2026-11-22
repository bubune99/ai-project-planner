/**
 * What an uploaded file may be, what it is stored as, and what it is called when it is downloaded again.
 *
 * Pure: no storage, no clock, no randomness (the caller passes the new file id in). The name a browser sends is
 * the sender's words: it is kept only as display metadata and never becomes part of the storage key. The key is
 * `users/<user>/projects/<project>/<id>.<ext>`, where the extension comes from the allowed type.
 * Checks: lib/storage/upload-rules.assert.ts
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** The types an upload may declare, and the ending each is stored under. */
const EXTENSION_BY_TYPE: ReadonlyMap<string, string> = new Map([
  // Images
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
  ["image/gif", "gif"],
  // Documents
  ["application/pdf", "pdf"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["text/csv", "csv"],
  ["text/plain", "txt"],
  ["application/json", "json"],
  // Design files
  ["application/x-sketch", "sketch"],
  ["application/vnd.figma", "fig"],
])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The stored ending for an allowed type; null when the type is not on the list. */
export function extensionFor(type: string): string | null {
  return EXTENSION_BY_TYPE.get(type) ?? null
}

/** Why this upload is refused, in words for the person; null when it may be stored. */
export function uploadRefusal(file: { type: string; size: number }): string | null {
  if (!extensionFor(file.type)) {
    return `Invalid file type: ${String(file.type).slice(0, 100)}. Allowed types: images, PDFs, spreadsheets, documents.`
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return "The file is empty."
  if (file.size > MAX_UPLOAD_BYTES) return "File too large. Maximum size is 50MB."
  return null
}

/**
 * The storage key for a new file. `fileId` is a fresh random id made by the server. Null when the type is not
 * allowed or any id is not an id, so nothing the sender typed can shape the path.
 */
export function storageKeyFor(userId: string, projectId: string, type: string, fileId: string): string | null {
  const ext = extensionFor(type)
  if (!ext || !UUID.test(userId) || !UUID.test(projectId) || !UUID.test(fileId)) return null
  return `users/${userId}/projects/${projectId}/${fileId}.${ext}`
}

const MAX_DOWNLOAD_NAME = 120

/**
 * The Content-Disposition for a download: the name the person gave the file, made safe for a header, with the
 * ending the file is stored under (so a name cannot claim another kind of file). Falls back to the stored name.
 */
export function downloadDisposition(originalName: string | null | undefined, storageKey: string): string {
  const stored = storageKey.split("/").pop() ?? ""
  const ext = /\.([a-z0-9]{1,10})$/i.exec(stored)?.[1] ?? ""
  const storedStem = ext ? stored.slice(0, -(ext.length + 1)) : stored

  const given = String(originalName ?? "").split(/[\\/]/).pop() ?? ""
  const stem = given
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .replace(/[:;*?<>|]/g, "_")
    .replace(/\.[a-z0-9]{1,10}$/i, "")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, MAX_DOWNLOAD_NAME)

  const name = `${stem || storedStem}${ext ? `.${ext}` : ""}`
  const ascii = name.replace(/[^\x20-\x7e]/g, "_")
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
