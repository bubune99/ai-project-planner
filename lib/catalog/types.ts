/**
 * Catalog type definitions — Idea H Tier 1.
 *
 * Storage shape mirrors migration 048. See memory:idea-h-catalog-first.
 *
 * The catalog IS the source of truth. Scans verify; agents declare.
 */

import type { Documentation5WH } from "@/lib/validation/documentation-5wh"

// ============================================================================
// Surface kinds (matches migration 048 CHECK constraint)
// ============================================================================

export const SURFACE_KINDS = [
  "db_table",
  "db_column",
  "db_enum",
  "db_matview",
  "db_function",
  "api_route",
  "mcp_tool",
  "middleware",
  "ui_page",
  "ui_component",
  "nav_link",
  "env_var",
  "feature_flag",
  "config_file",
  "integration",
  "webhook_endpoint",
  "helper",
  "type_export",
  "zod_schema",
  "react_hook",
] as const

export type SurfaceKind = (typeof SURFACE_KINDS)[number]

// ============================================================================
// Edge kinds (matches migration 048)
// ============================================================================

export const DEPENDENCY_KINDS = [
  "reads_from",
  "writes_to",
  "calls",
  "renders",
  "mounts_at",
  "imports",
  "extends",
  "mirrors",
  "gated_by",
  "declares",
  "fires_event",
  "uses_env",
  "integrates_with",
] as const

export type DependencyKind = (typeof DEPENDENCY_KINDS)[number]

// ============================================================================
// Surface row shape
// ============================================================================

export interface SurfaceLocation {
  file_path?: string
  line_start?: number
  line_end?: number
  url_pattern?: string
  table_name?: string
  column_name?: string
  // Free-form additions per kind:
  [key: string]: unknown
}

/**
 * Signature is the canonical declaration of a surface. Its sha256 is the content_hash.
 * Shape varies by kind:
 * - db_table: { columns: [{name, type, nullable}], indexes: [...], ... }
 * - api_route: { method, path, params: { query, body, response }, auth: ... }
 * - mcp_tool: { name, description, input_schema, output_shape }
 * - ui_page: { route, layout, has_use_client }
 * - env_var: { name, required, default? }
 */
export interface SurfaceSignature {
  [key: string]: unknown
}

export type SurfaceStatus = "fresh" | "needs_revalidation" | "stale" | "deprecated"

export type AutoDetectedBy = "scan_targeted" | "scan_full" | "agent_artifact" | "manual"

export type LastVerifiedMethod =
  | "agent_artifact"
  | "scan_targeted"
  | "scan_full"
  | "manual"

export interface Surface {
  id: string
  canonical_id: string
  kind: SurfaceKind
  project_id: string | null
  location: SurfaceLocation
  signature: SurfaceSignature
  content_hash: string | null
  first_seen_commit_sha: string | null
  last_seen_commit_sha: string | null
  deprecated_in_commit_sha: string | null
  status: SurfaceStatus
  auto_detected_by: AutoDetectedBy
  last_verified_at: string | null
  last_verified_method: LastVerifiedMethod | null
  user_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  metadata: Record<string, unknown>
  documentation_5wh: Partial<Documentation5WH> | Record<string, unknown>
}

// ============================================================================
// Surface dependency edge shape
// ============================================================================

export interface SurfaceDependency {
  id: string
  from_surface_id: string
  to_surface_id: string
  kind: DependencyKind
  confidence: number
  auto_detected_by: AutoDetectedBy
  first_seen_commit_sha: string | null
  last_seen_commit_sha: string | null
  deprecated_in_commit_sha: string | null
  user_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  documentation_5wh: Record<string, unknown>
  metadata: Record<string, unknown>
}

// ============================================================================
// Catalog scan event shape
// ============================================================================

export type ScanType = "targeted" | "full" | "skipped"

export type ScanTrigger =
  | "github_webhook"
  | "vercel_deploy"
  | "manual_mcp_call"
  | "agent_artifact_listener"
  | "bootstrap"

export interface CatalogScanEvent {
  id: string
  project_id: string | null
  commit_sha: string | null
  branch: string | null
  scan_type: ScanType
  scanned_files: string[]
  skip_reason: string | null
  surfaces_added: string[]
  surfaces_modified: string[]
  surfaces_removed: string[]
  scan_duration_ms: number | null
  triggered_by: ScanTrigger
  user_id: string
  scanned_at: string
  metadata: Record<string, unknown>
}

// ============================================================================
// Validation contract shape
// ============================================================================

export type ValidationTriggerEvent = "on_create" | "on_modify" | "on_delete" | "always"

export interface ValidationContract {
  id: string
  surface_kind: SurfaceKind | string  // string for forward-compat
  validator_tool: string
  required: boolean
  trigger_event: ValidationTriggerEvent
  invoke_args_template: Record<string, unknown>
  description: string | null
  user_id: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
  documentation_5wh: Record<string, unknown>
}

// ============================================================================
// Scan output (what the scanner returns; the persistence layer maps to Surface rows)
// ============================================================================

/**
 * Structured output from scanning N files. Used to compute the diff against
 * the current catalog state and produce catalog_scan_events rows.
 */
export interface ScanResult {
  scanned_files: string[]
  scan_type: ScanType
  detected_surfaces: DetectedSurface[]
  detected_dependencies: DetectedDependency[]
  warnings: string[]
  duration_ms: number
}

/**
 * One detected surface from a scan — not yet a Surface row.
 * The persistence layer assigns ids, compares hashes, sets status.
 */
export interface DetectedSurface {
  canonical_id: string
  kind: SurfaceKind
  location: SurfaceLocation
  signature: SurfaceSignature
  // signature is hashed at persist time; scanner doesn't compute the hash
}

/**
 * One detected dependency edge.
 */
export interface DetectedDependency {
  from_canonical_id: string
  to_canonical_id: string
  kind: DependencyKind
  confidence?: number  // default 1.00 for explicit, <1.00 for inferred
}

// ============================================================================
// Scannable file patterns + non-scannable filter
// ============================================================================

/**
 * File patterns that DO trigger a targeted scan when they appear in a push diff.
 */
export const SCANNABLE_PATTERNS: RegExp[] = [
  /^lib\/db\/migrations\/[^/]+\.sql$/,
  /^app\/api\/.+\/route\.tsx?$/,
  /^app\/mcp\/.+\.tsx?$/,
  /^app\/.+\/page\.tsx?$/,
  /^components\/.+\.tsx?$/,
  /^lib\/(?!.*\.test\.).*\.tsx?$/,
  /^middleware\.tsx?$/,
  /^next\.config\.(js|mjs|ts)$/,
  /^vercel\.(json|ts)$/,
  /^\.env(\..+)?$/,
]

/**
 * File patterns that DO NOT trigger a scan even if they're in a push.
 * The push still produces a catalog_scan_events row with scan_type='skipped'
 * for observability — we audit our own filtering.
 */
export const NON_SCANNABLE_PATTERNS: RegExp[] = [
  /^README\.md$/i,
  /\.md$/i,
  /^\.github\//,
  /^\.vscode\//,
  /^\.idea\//,
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /^__tests__\//,
  /^tests?\//,
  /^public\//,
  /^LICENSE$/i,
  /^NOTICE$/i,
  /^CHANGELOG\.md$/i,
]

/**
 * Decide whether to scan based on a list of changed files from a push event.
 * Returns the subset of files that ARE scannable, plus a flag.
 */
export function filterScannableFiles(changedFiles: string[]): {
  shouldScan: boolean
  scannable: string[]
  skipReason: string | null
} {
  const scannable = changedFiles.filter((f) => {
    if (NON_SCANNABLE_PATTERNS.some((re) => re.test(f))) return false
    return SCANNABLE_PATTERNS.some((re) => re.test(f))
  })
  if (scannable.length === 0) {
    return {
      shouldScan: false,
      scannable: [],
      skipReason: changedFiles.length === 0
        ? "no files in commit"
        : "no scannable files in commit",
    }
  }
  return { shouldScan: true, scannable, skipReason: null }
}
