/*
 * Path confinement for the catalog scanner.
 *
 * The scanner reads files from the server's filesystem. Callers (the
 * catalog_scan_now MCP tool, the GitHub/Vercel webhooks) supply a project
 * root and, for targeted scans, relative file paths. Neither may reach
 * outside the allowed root:
 *
 *   resolveAllowedRoot — the requested root must resolve (realpath, so
 *     symlinks are followed before comparing) to one of the allowed roots or
 *     a directory inside one. Returns the real path.
 *   confineFiles — each relative path must be relative (no absolute paths,
 *     no drive letters), contain no `..` segment, and its real path (when the
 *     file exists) must stay inside the real root, so a symlink inside the
 *     tree cannot point outside it. Rejected paths are reported, not read.
 *
 * Pure apart from fs.realpathSync / fs.existsSync, injected as `fsLike` so
 * confine.assert.ts can run against a scratch tree.
 */

import * as fs from "fs"
import * as path from "path"

export interface FsLike {
  realpathSync: (p: string) => string
  existsSync: (p: string) => boolean
}

const realFs: FsLike = { realpathSync: (p) => fs.realpathSync(p), existsSync: (p) => fs.existsSync(p) }

/** True when `child` is `parent` or inside it (both already absolute + normalised). */
export function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

/**
 * Resolve the scan root. `requested` defaults to the first allowed root.
 * Throws when the requested root is outside every allowed root.
 */
export function resolveAllowedRoot(
  requested: string | undefined,
  allowedRoots: readonly string[],
  fsLike: FsLike = realFs,
): string {
  if (allowedRoots.length === 0) throw new Error("No allowed scan roots configured")
  const realAllowed = allowedRoots.map((r) => fsLike.realpathSync(path.resolve(r)))
  if (requested === undefined) return realAllowed[0]
  if (!path.isAbsolute(requested)) throw new Error("project_root must be an absolute path")
  let real: string
  try {
    real = fsLike.realpathSync(path.resolve(requested))
  } catch {
    throw new Error("project_root does not exist")
  }
  if (!realAllowed.some((root) => isWithin(root, real))) {
    throw new Error("project_root is outside the allowed scan root")
  }
  return real
}

/**
 * Split relative file paths into those safe to read under `realRoot` and
 * those rejected. Accepted paths are returned normalised with forward
 * slashes, exactly as the scanner's classifiers expect.
 */
export function confineFiles(
  realRoot: string,
  files: readonly string[],
  fsLike: FsLike = realFs,
): { accepted: string[]; rejected: string[] } {
  const accepted: string[] = []
  const rejected: string[] = []
  for (const raw of files) {
    const norm = raw.replace(/\\/g, "/")
    const segments = norm.split("/")
    if (
      norm === "" ||
      norm.includes("\0") ||
      path.isAbsolute(norm) ||
      path.win32.isAbsolute(norm) ||
      segments.includes("..")
    ) {
      rejected.push(raw)
      continue
    }
    const abs = path.resolve(realRoot, norm)
    if (!isWithin(realRoot, abs)) {
      rejected.push(raw)
      continue
    }
    if (fsLike.existsSync(abs)) {
      let real: string
      try {
        real = fsLike.realpathSync(abs)
      } catch {
        rejected.push(raw)
        continue
      }
      if (!isWithin(realRoot, real)) {
        rejected.push(raw)
        continue
      }
    }
    accepted.push(norm)
  }
  return { accepted, rejected }
}
