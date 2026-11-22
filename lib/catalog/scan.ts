/**
 * Catalog AST scanner - Idea H Wave 1.
 *
 * Scans the planner's own codebase and emits DetectedSurface + DetectedDependency
 * records for every surface kind the planner cares about.
 *
 * Ported from Memory-Agent's module-relationship-analyzer.ts (buildExportRelations,
 * detectCircularDependencies patterns). MA's repo is NOT imported at runtime;
 * this is an independent copy of the relevant logic.
 *
 * No DB calls here - the caller (persist.ts or an API route) does the DB work.
 *
 * Surface kinds detected:
 *   db_table, db_column, db_enum, db_matview  - SQL migration files, applied in name order (sql-parse.ts)
 *   api_route                                  - any route.ts(x) under app/, one per exported method,
 *                                                each read on its own (route-handlers.ts)
 *   mcp_tool                                   - server.tool calls in lib/mcp/*.ts and app/mcp
 *   middleware                                 - middleware.ts at root
 *   ui_page                                    - any page.tsx under app/, the root page included
 *   ui_component                               - components: exported functions, consts and export lists
 *   env_var                                    - .env* files, NAMES ONLY
 *   config_file                                - next.config.*, vercel.json, tailwind.config.*
 *   type_export                                - export type/interface in lib
 *   zod_schema                                 - exported z.object vars in lib
 *   react_hook                                 - exported use* functions and consts in lib and components
 *   webhook_endpoint                           - api_route sub-kind; adds is_webhook to sig
 *
 * Edges: reads_from / writes_to (handler to table), imports (import-edges.ts), mirrors (route and tool that do
 * the same thing). Every id is emitted once and every edge once.
 *
 * Not detected: nav_link, feature_flag, helper, integration, plain SQL views, lib-to-lib imports.
 */

import * as fs from "fs"
import * as path from "path"
import * as ts from "typescript"
import fg from "fast-glob"
import { confineFiles } from "./confine"
import { detectImportEdges } from "./import-edges"
import { authChecksIn, readRouteHandlers, validatesBody } from "./route-handlers"
import { readMigrations, sqlAccess, stripSqlComments } from "./sql-parse"
import type {
  ScanResult,
  ScanType,
  DetectedSurface,
  DetectedDependency,
} from "./types"

// ============================================================================
// Skip dirs (never descend)
// ============================================================================

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".vercel",
  ".turbo",
  "out",
])

// ============================================================================
// Public API
// ============================================================================

export interface ScanOptions {
  /** Absolute path to the project root */
  projectRoot: string
  /**
   * Relative file paths to scan.
   * If omitted, the scanner does a full-tree discovery.
   */
  files?: string[]
  /**
   * Folders (relative to the root) a full-tree discovery must not enter, on top of the built-in ones
   * (node_modules, .next, ...). Ignored when `files` is given: a caller naming files has already chosen.
   */
  skipDirs?: string[]
  /** Git commit SHA for first/last_seen stamping - passed through to warnings only; callers embed in DetectedSurface via persist layer */
  commitSha?: string
  /** Branch name - same */
  branch?: string
}

export async function scanPaths(opts: ScanOptions): Promise<ScanResult> {
  const start = Date.now()
  const warnings: string[] = []
  const detectedSurfaces: DetectedSurface[] = []
  const detectedDependencies: DetectedDependency[] = []

  const { files } = opts
  // Work from the root's real path so symlink checks compare like with like.
  const projectRoot = fs.realpathSync(path.resolve(opts.projectRoot))
  const scanType: ScanType = files ? "targeted" : "full"

  // ---- Resolve file list ----
  // Every path is confined to projectRoot before anything is read: no
  // absolute paths, no `..` segments, no symlinks resolving outside the tree.
  let candidates: string[] = []
  if (files && files.length > 0) {
    candidates = files
  } else {
    candidates = await discoverAllFiles(projectRoot, opts.skipDirs ?? [])
  }
  const { accepted: scanFiles, rejected } = confineFiles(projectRoot, candidates)
  for (const rel of rejected) {
    warnings.push(`skipped ${JSON.stringify(rel)}: outside the project root`)
  }

  // ---- Group files by scanner kind ----
  const sqlFiles: string[] = []
  const apiRouteFiles: string[] = []
  const mcpRouteFiles: string[] = []
  const middlewareFiles: string[] = []
  const pageFiles: string[] = []
  const componentFiles: string[] = []
  const envFiles: string[] = []
  const configFiles: string[] = []
  const libTsFiles: string[] = []

  const isCheckFile = (f: string): boolean => /\.(test|spec|assert)\.tsx?$/.test(f)
  for (const rel of scanFiles) {
    const norm = rel.replace(/\\/g, "/")
    if (/^lib\/db\/migrations\/[^/]+\.sql$/.test(norm)) {
      sqlFiles.push(norm)
    } else if (/^app\/(.+\/)?route\.tsx?$/.test(norm)) {
      // Any route handler is an entry point, not only those under app/api (app/mcp/route.ts, app/.well-known/...).
      apiRouteFiles.push(norm)
      if (/^app\/mcp\//.test(norm)) mcpRouteFiles.push(norm)
    } else if (/^app\/mcp\/.+\.tsx?$/.test(norm) && !isCheckFile(norm)) {
      mcpRouteFiles.push(norm)
    } else if (/^lib\/mcp\/[^/]+\.tsx?$/.test(norm) && !isCheckFile(norm)) {
      // The tools are declared here (server.tool in lib/mcp/*.ts), not in app/mcp/route.ts, which only wires them
      // up: reading route.ts alone found 0 of them (card d101bb88). These files are lib code too.
      mcpRouteFiles.push(norm)
      libTsFiles.push(norm)
    } else if (/^middleware\.tsx?$/.test(norm)) {
      middlewareFiles.push(norm)
    } else if (/^app\/(.+\/)?page\.tsx?$/.test(norm)) {
      pageFiles.push(norm)
    } else if (/^components\/.+\.tsx?$/.test(norm)) {
      if (!isCheckFile(norm)) componentFiles.push(norm)
    } else if (/^\.env(\..+)?$/.test(norm)) {
      envFiles.push(norm)
    } else if (
      /^next\.config\.(js|mjs|ts|cjs)$/.test(norm) ||
      /^vercel\.(json|ts)$/.test(norm) ||
      /^tailwind\.config\.(js|mjs|ts|cjs)$/.test(norm)
    ) {
      configFiles.push(norm)
    } else if (/^lib\/.*\.tsx?$/.test(norm) && !isCheckFile(norm)) {
      libTsFiles.push(norm)
    }
  }

  // ---- Run each scanner ----
  const sqlResult = scanSqlMigrations(sqlFiles, projectRoot, warnings)
  detectedSurfaces.push(...sqlResult.surfaces)
  detectedDependencies.push(...sqlResult.deps)

  const routeUsers = new Map<string, Array<{ id: string; uses: Set<string> | null }>>()
  for (const rel of apiRouteFiles) {
    try {
      const result = scanApiRoute(rel, projectRoot, warnings)
      detectedSurfaces.push(...result.surfaces)
      detectedDependencies.push(...result.deps)
      routeUsers.set(rel, result.users)
    } catch (e) {
      warnings.push(`api_route scan failed for ${rel}: ${String(e)}`)
    }
  }

  for (const rel of mcpRouteFiles) {
    try {
      const result = scanMcpRoute(rel, projectRoot, warnings)
      detectedSurfaces.push(...result.surfaces)
      detectedDependencies.push(...result.deps)
    } catch (e) {
      warnings.push(`mcp_tool scan failed for ${rel}: ${String(e)}`)
    }
  }

  for (const rel of middlewareFiles) {
    try {
      const result = scanMiddleware(rel, projectRoot, warnings)
      detectedSurfaces.push(...result.surfaces)
    } catch (e) {
      warnings.push(`middleware scan failed for ${rel}: ${String(e)}`)
    }
  }

  for (const rel of pageFiles) {
    try {
      const result = scanUiPage(rel, projectRoot, warnings)
      detectedSurfaces.push(...result.surfaces)
    } catch (e) {
      warnings.push(`ui_page scan failed for ${rel}: ${String(e)}`)
    }
  }

  for (const rel of componentFiles) {
    try {
      const result = scanUiComponent(rel, projectRoot, warnings)
      detectedSurfaces.push(...result.surfaces)
    } catch (e) {
      warnings.push(`ui_component scan failed for ${rel}: ${String(e)}`)
    }
  }

  for (const rel of envFiles) {
    try {
      const result = scanEnvFile(rel, projectRoot, warnings)
      detectedSurfaces.push(...result.surfaces)
    } catch (e) {
      warnings.push(`env_var scan failed for ${rel}: ${String(e)}`)
    }
  }

  for (const rel of configFiles) {
    try {
      const result = scanConfigFile(rel, projectRoot, warnings)
      detectedSurfaces.push(...result.surfaces)
    } catch (e) {
      warnings.push(`config_file scan failed for ${rel}: ${String(e)}`)
    }
  }

  for (const rel of libTsFiles) {
    try {
      const result = scanLibTs(rel, projectRoot, warnings)
      detectedSurfaces.push(...result.surfaces)
      detectedDependencies.push(...result.deps)
    } catch (e) {
      warnings.push(`lib_ts scan failed for ${rel}: ${String(e)}`)
    }
  }

  // ---- Detect cross-file import edges ----
  try {
    detectedDependencies.push(
      ...importEdges({
        projectRoot,
        scanned: new Set(scanFiles.map((f) => f.replace(/\\/g, "/"))),
        surfaces: detectedSurfaces,
        routeUsers,
        pageFiles,
        componentFiles,
        libTsFiles,
      })
    )
  } catch (e) {
    warnings.push(`import edge detection failed: ${String(e)}`)
  }

  // ---- Detect api_route ↔ mcp_tool mirrors ----
  try {
    detectedDependencies.push(...detectMirrors(detectedSurfaces))
  } catch (e) {
    warnings.push(`mirror detection failed: ${String(e)}`)
  }

  // ---- A query against a materialized view points at the view ----
  // Handlers name what they read; whether that name is a table or a view is only known once migrations are read.
  const tableIds = new Set(detectedSurfaces.filter((s) => s.kind === "db_table").map((s) => s.canonical_id))
  const matviewIds = new Set(detectedSurfaces.filter((s) => s.kind === "db_matview").map((s) => s.canonical_id))
  for (const d of detectedDependencies) {
    if (d.kind !== "reads_from" && d.kind !== "writes_to") continue
    const asMatview = d.to_canonical_id.replace(/^db:/, "matview:")
    if (!tableIds.has(d.to_canonical_id) && matviewIds.has(asMatview)) d.to_canonical_id = asMatview
  }

  // ---- One of each ----
  // The save step keeps the first row for an id and the first edge for a (from, to, kind): do the same here so
  // the result says what would be saved, and say so when something was dropped.
  const surfaces: DetectedSurface[] = []
  const seenIds = new Set<string>()
  for (const s of detectedSurfaces) {
    if (seenIds.has(s.canonical_id)) {
      warnings.push(`${s.canonical_id} was found more than once; kept the first`)
      continue
    }
    seenIds.add(s.canonical_id)
    surfaces.push(s)
  }
  const dependencies: DetectedDependency[] = []
  const seenEdges = new Set<string>()
  for (const d of detectedDependencies) {
    const key = JSON.stringify([d.from_canonical_id, d.to_canonical_id, d.kind])
    if (d.from_canonical_id === d.to_canonical_id || seenEdges.has(key)) continue
    seenEdges.add(key)
    dependencies.push(d)
  }

  const duration_ms = Date.now() - start

  return {
    scanned_files: scanFiles,
    scan_type: scanType,
    detected_surfaces: surfaces,
    detected_dependencies: dependencies,
    warnings,
    duration_ms,
  }
}

// ============================================================================
// File discovery
// ============================================================================

async function discoverAllFiles(projectRoot: string, skipDirs: readonly string[]): Promise<string[]> {
  const skipDirPatterns = Array.from(SKIP_DIRS).map((d) => `!**/${d}/**`)
  const patterns = [
    "lib/db/migrations/*.sql",
    "app/**/route.ts",
    "app/**/route.tsx",
    "app/mcp/**/*.ts",
    "app/mcp/**/*.tsx",
    "middleware.ts",
    "middleware.tsx",
    "app/**/page.tsx",
    "app/**/page.ts",
    "components/**/*.tsx",
    "components/**/*.ts",
    ".env",
    ".env.*",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "next.config.cjs",
    "vercel.json",
    "vercel.ts",
    "tailwind.config.js",
    "tailwind.config.mjs",
    "tailwind.config.ts",
    "lib/**/*.ts",
    "lib/**/*.tsx",
    ...skipDirPatterns,
  ]

  const found = await fg(patterns, {
    cwd: projectRoot,
    dot: true,
    followSymbolicLinks: false,
    ignore: [
      ...Array.from(SKIP_DIRS).map((d) => `**/${d}/**`),
      ...skipDirs.map((d) => `${fg.escapePath(d.replace(/\\/g, "/").replace(/\/+$/, ""))}/**`),
    ],
  })
  return found
}

// ============================================================================
// SQL migration scanner - db_table, db_column, db_enum, db_matview
// ============================================================================

interface ScannerResult {
  surfaces: DetectedSurface[]
  deps: DetectedDependency[]
}

function scanSqlMigrations(
  files: string[],
  projectRoot: string,
  warnings: string[]
): ScannerResult {
  const surfaces: DetectedSurface[] = []
  const deps: DetectedDependency[] = []
  const read: Array<{ file: string; sql: string }> = []

  // Migrations apply in name order; a later one may add to or drop what an earlier one made.
  for (const rel of [...files].sort()) {
    try {
      read.push({ file: rel, sql: fs.readFileSync(path.join(projectRoot, rel), "utf8") })
    } catch (e) {
      warnings.push(`SQL read error ${rel}: ${String(e)}`)
    }
  }

  for (const { file: rel, sql: raw } of read) {
    const sql = stripSqlComments(raw)

    // --- db_enum ---
    const enumRe = /CREATE\s+TYPE\s+"?(\w+)"?\s+AS\s+ENUM\s*\(([^)]+)\)/gi
    let em: RegExpExecArray | null
    while ((em = enumRe.exec(sql)) !== null) {
      const name = em[1]
      const values = em[2]
        .split(",")
        .map((v) => v.trim().replace(/^'|'$/g, ""))
        .filter(Boolean)

      surfaces.push({
        canonical_id: `enum:${name}`,
        kind: "db_enum",
        location: { file_path: rel, table_name: name },
        signature: { values },
      })
    }

    // --- db_matview ---
    const matviewRe =
      /CREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+AS\s+([\s\S]+?)(?:;|$)/gi
    let mv: RegExpExecArray | null
    while ((mv = matviewRe.exec(sql)) !== null) {
      surfaces.push({
        canonical_id: `matview:${mv[1]}`,
        kind: "db_matview",
        location: { file_path: rel, table_name: mv[1] },
        signature: { depends_on_tables: sqlAccess(mv[2]).reads },
      })
    }
  }

  // --- db_table + db_column ---
  const columnSignature = (c: { type: string; nullable: boolean; default?: string; check?: string; references?: string }) => ({
    type: c.type,
    nullable: c.nullable,
    ...(c.default !== undefined ? { default: c.default } : {}),
    ...(c.check ? { check: c.check } : {}),
    ...(c.references ? { references: c.references } : {}),
  })

  const schema = readMigrations(read)
  for (const table of schema.tables) {
    surfaces.push({
      canonical_id: `db:${table.name}`,
      kind: "db_table",
      location: { file_path: table.file, table_name: table.name },
      signature: {
        columns: table.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable })),
        primary_key: table.primaryKey,
        indexes_inline: [],
        constraints: table.constraints,
      },
    })
    for (const col of table.columns) {
      surfaces.push({
        canonical_id: `db:${table.name}.${col.name}`,
        kind: "db_column",
        location: { file_path: col.file, table_name: table.name, column_name: col.name },
        signature: columnSignature(col),
      })
    }
  }
  // A column added to a table these files do not create (a targeted scan of a later migration).
  for (const col of schema.looseColumns) {
    surfaces.push({
      canonical_id: `db:${col.table}.${col.name}`,
      kind: "db_column",
      location: { file_path: col.file, table_name: col.table, column_name: col.name },
      signature: columnSignature(col),
    })
  }

  return { surfaces, deps }
}

// ============================================================================
// API route scanner - api_route (+ webhook_endpoint subkind)
// ============================================================================

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const

/**
 * The address a file under app/ answers at. Route groups "(name)" and
 * parallel-route slots "@name" are folders, not part of the address.
 *   app/api/skills/[id]/route.ts → /api/skills/[id]
 *   app/(auth)/sign-in/page.tsx  → /sign-in
 *   app/page.tsx                 → /
 */
function deriveAppPath(relFilePath: string): string {
  const segments = relFilePath
    .replace(/\\/g, "/")
    .replace(/^app\/?/, "")
    .replace(/(^|\/)(route|page)\.tsx?$/, "")
    .split("/")
    .filter((seg) => seg && !/^\(.*\)$/.test(seg) && !seg.startsWith("@"))
  return "/" + segments.join("/")
}

function scanApiRoute(
  rel: string,
  projectRoot: string,
  warnings: string[]
): ScannerResult & { users: Array<{ id: string; uses: Set<string> | null }> } {
  const surfaces: DetectedSurface[] = []
  const deps: DetectedDependency[] = []
  const users: Array<{ id: string; uses: Set<string> | null }> = []

  const absPath = path.join(projectRoot, rel)
  const source = readSourceFile(absPath, warnings)
  if (!source) return { surfaces, deps, users }
  const sourceFile = parseTs(absPath, source, warnings)
  if (!sourceFile) return { surfaces, deps, users }

  const urlPath = deriveAppPath(rel)
  const isWebhook = /\/webhooks?(\/|$)/.test(urlPath)
  const dynamicSegments = [...urlPath.matchAll(/\[\[?([^\]]+)\]\]?/g)].map((m) => m[1])

  // Each handler is read on its own: what it checks and touches, not what its neighbours do.
  for (const handler of readRouteHandlers(sourceFile, HTTP_METHODS)) {
    const canonicalId = `route:${handler.method} ${urlPath}`
    const authVia = authChecksIn(handler.text)

    surfaces.push({
      canonical_id: canonicalId,
      kind: "api_route",
      location: { file_path: rel, url_pattern: urlPath },
      signature: {
        method: handler.method,
        path: urlPath,
        dynamic_segments: dynamicSegments,
        body_validation: handler.elsewhere ? "unknown" : validatesBody(handler.text) ? "present" : "absent",
        auth_check: handler.elsewhere ? "unknown" : authVia.length > 0 ? "present" : "absent",
        auth_via: authVia,
        ...(isWebhook ? { is_webhook: true } : {}),
      },
    })
    users.push({ id: canonicalId, uses: handler.elsewhere ? new Set() : handler.identifiers })

    // reads_from / writes_to edges, inferred from the SQL the handler reaches in this file (not 100% certain).
    const reads = new Set<string>()
    const writes = new Set<string>()
    for (const text of handler.sql) {
      const access = sqlAccess(text)
      access.reads.forEach((t) => reads.add(t))
      access.writes.forEach((t) => writes.add(t))
    }
    for (const table of [...reads].sort()) {
      deps.push({ from_canonical_id: canonicalId, to_canonical_id: `db:${table}`, kind: "reads_from", confidence: 0.85 })
    }
    for (const table of [...writes].sort()) {
      deps.push({ from_canonical_id: canonicalId, to_canonical_id: `db:${table}`, kind: "writes_to", confidence: 0.85 })
    }
  }

  return { surfaces, deps, users }
}

// ============================================================================
// MCP tool scanner - mcp_tool
// ============================================================================

/** Text of a string, a template (holes kept as written) or strings joined with +. Null for anything else. */
function staticText(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => "${" + s.expression.getText() + "}" + s.literal.text).join("")
  }
  if (ts.isParenthesizedExpression(node)) return staticText(node.expression)
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticText(node.left)
    const right = staticText(node.right)
    return left !== null && right !== null ? left + right : null
  }
  return null
}

function scanMcpRoute(
  rel: string,
  projectRoot: string,
  warnings: string[]
): ScannerResult {
  const surfaces: DetectedSurface[] = []
  const deps: DetectedDependency[] = []

  const absPath = path.join(projectRoot, rel)
  const source = readSourceFile(absPath, warnings)
  if (!source) return { surfaces, deps }

  const sourceFile = parseTs(absPath, source, warnings)
  if (!sourceFile) return { surfaces, deps }

  // Walk AST for server.tool("name", "description", schema, handler)
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "tool"
    ) {
      const args = node.arguments
      if (args.length >= 2) {
        const nameArg = args[0]

        if (ts.isStringLiteral(nameArg)) {
          const toolName = nameArg.text
          const description = staticText(args[1]) ?? "(see source)"

          // Extract Zod schema arg names from 3rd argument (best effort)
          const inputArgNames: string[] = []
          if (args.length >= 3) {
            const schemaArg = args[2]
            extractZodArgNames(schemaArg, inputArgNames)
          }

          surfaces.push({
            canonical_id: `mcp:${toolName}`,
            kind: "mcp_tool",
            location: { file_path: rel },
            signature: {
              description: description.slice(0, 200), // truncate - descriptions can be long
              input_arg_names: inputArgNames,
            },
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return { surfaces, deps }
}

function extractZodArgNames(node: ts.Node, out: string[]): void {
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        out.push(prop.name.text)
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        out.push(prop.name.text)
      }
    }
  }
}

// ============================================================================
// Middleware scanner
// ============================================================================

function scanMiddleware(
  rel: string,
  projectRoot: string,
  warnings: string[]
): ScannerResult {
  const surfaces: DetectedSurface[] = []

  const absPath = path.join(projectRoot, rel)
  const source = readSourceFile(absPath, warnings)
  if (!source) return { surfaces, deps: [] }

  const matcherPaths: string[] = []

  // Extract config.matcher from the source text (regex-based; good enough)
  const configBlockMatch = source.match(/export\s+const\s+config\s*=\s*\{([^}]+)\}/s)
  if (configBlockMatch) {
    const matcherMatch = configBlockMatch[1].match(/matcher\s*:\s*(\[[^\]]+\]|'[^']+'|"[^"]+")/)
    if (matcherMatch) {
      const raw = matcherMatch[1]
      if (raw.startsWith("[")) {
        const innerMatches = raw.matchAll(/'([^']+)'|"([^"]+)"/g)
        for (const m of innerMatches) {
          matcherPaths.push(m[1] ?? m[2])
        }
      } else {
        const inner = raw.replace(/^['"]|['"]$/g, "")
        matcherPaths.push(inner)
      }
    }
  }

  surfaces.push({
    canonical_id: "middleware:root",
    kind: "middleware",
    location: { file_path: rel },
    signature: { matcher_paths: matcherPaths },
  })

  return { surfaces, deps: [] }
}

// ============================================================================
// UI page scanner
// ============================================================================

function scanUiPage(
  rel: string,
  projectRoot: string,
  warnings: string[]
): ScannerResult {
  const surfaces: DetectedSurface[] = []

  const absPath = path.join(projectRoot, rel)
  const source = readSourceFile(absPath, warnings)
  if (!source) return { surfaces, deps: [] }

  const urlPath = deriveAppPath(rel)
  const hasUseClient = /^['"]use client['"]/m.test(source)

  // Layout chain: infer from directory structure
  const layoutChain = buildLayoutChain(rel)

  surfaces.push({
    canonical_id: `ui:${urlPath}`,
    kind: "ui_page",
    location: { file_path: rel, url_pattern: urlPath },
    signature: {
      route: urlPath,
      layout_chain: layoutChain,
      has_use_client: hasUseClient,
    },
  })

  return { surfaces, deps: [] }
}

function buildLayoutChain(pageRel: string): string[] {
  // Walk up the directory tree; each directory that COULD have a layout.tsx is a chain member
  const parts = pageRel.replace(/\\/g, "/").split("/")
  const chain: string[] = []
  for (let i = 1; i < parts.length - 1; i++) {
    chain.push(parts.slice(0, i + 1).join("/").replace(/^app/, ""))
  }
  return chain.length ? chain : ["/"]
}

// ============================================================================
// Exports shared by the component and lib scanners
// ============================================================================

const isExported = (node: ts.Node): boolean =>
  (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
const isDefaultExport = (node: ts.Node): boolean =>
  (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false

/** A function, or something that makes one: an arrow, a function expression, a call (memo, forwardRef, styled). */
function makesFunction(init: ts.Expression | undefined): boolean {
  if (!init) return false
  if (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) {
    return makesFunction(init.expression)
  }
  return ts.isArrowFunction(init) || ts.isFunctionExpression(init) || ts.isCallExpression(init)
}

interface NamedExport {
  /** The name other files import. */
  name: string
  /** The node that defines it: a function or class declaration, or a variable declaration. */
  node: ts.Node
  isDefault: boolean
}

/**
 * Top-level functions, classes and function-valued consts a file exports,
 * whether exported where they are declared or in a list (export { A, b as C }).
 * Names re-exported from another file are not this file's and are left out.
 */
function exportedCallables(sourceFile: ts.SourceFile): NamedExport[] {
  const local = new Map<string, ts.Node>()
  const out: NamedExport[] = []
  for (const stmt of sourceFile.statements) {
    if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) {
      local.set(stmt.name.text, stmt)
      if (isExported(stmt)) {
        const isDefault = isDefaultExport(stmt)
        out.push({ name: isDefault ? "default" : stmt.name.text, node: stmt, isDefault })
      }
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !makesFunction(decl.initializer)) continue
        local.set(decl.name.text, decl)
        if (isExported(stmt)) out.push({ name: decl.name.text, node: decl, isDefault: false })
      }
    }
  }
  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        const node = local.get((el.propertyName ?? el.name).text)
        if (node) out.push({ name: el.name.text, node, isDefault: el.name.text === "default" })
      }
    }
  }
  return out
}

/** The name a callable was declared with (for a renamed or default export, not the exported name). */
function declaredName(node: ts.Node): string {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
    return node.name.text
  }
  return ""
}

function hookSurfaces(sourceFile: ts.SourceFile, rel: string): DetectedSurface[] {
  const surfaces: DetectedSurface[] = []
  for (const exp of exportedCallables(sourceFile)) {
    if (exp.isDefault || !/^use[A-Z]/.test(exp.name) || ts.isClassDeclaration(exp.node)) continue
    const fn = ts.isFunctionDeclaration(exp.node)
      ? exp.node
      : ts.isVariableDeclaration(exp.node) && exp.node.initializer && (ts.isArrowFunction(exp.node.initializer) || ts.isFunctionExpression(exp.node.initializer))
        ? exp.node.initializer
        : null
    surfaces.push({
      canonical_id: `hook:${rel}:${exp.name}`,
      kind: "react_hook",
      location: { file_path: rel },
      signature: { name: exp.name, has_params: (fn?.parameters.length ?? 0) > 0 },
    })
  }
  return surfaces
}

// ============================================================================
// UI component scanner
// ============================================================================

function scanUiComponent(
  rel: string,
  projectRoot: string,
  warnings: string[]
): ScannerResult {
  const surfaces: DetectedSurface[] = []

  const absPath = path.join(projectRoot, rel)
  const source = readSourceFile(absPath, warnings)
  if (!source) return { surfaces, deps: [] }

  const sourceFile = parseTs(absPath, source, warnings)
  if (!sourceFile) return { surfaces, deps: [] }

  const hasUseClient = /^['"]use client['"]/m.test(source)
  const component = (name: string, propsTypeName?: string): DetectedSurface => ({
    canonical_id: `component:${rel}:${name}`,
    kind: "ui_component",
    location: { file_path: rel },
    signature: {
      export_name: name,
      has_use_client: hasUseClient,
      ...(propsTypeName ? { props_type_name: propsTypeName } : {}),
    },
  })

  // A component is an exported function (or a const that makes one) named like one: a capital, and not an
  // ALL_CAPS constant. A default export counts whatever it is called.
  for (const exp of exportedCallables(sourceFile)) {
    const named = exp.isDefault ? declaredName(exp.node) || "Default" : exp.name
    if (!exp.isDefault && (!/^[A-Z]/.test(named) || /^[A-Z0-9_]+$/.test(named))) continue
    surfaces.push(component(exp.name, ts.isFunctionDeclaration(exp.node) ? findPropsTypeName(exp.node) : undefined))
  }
  // export default <expression>
  if (sourceFile.statements.some((s) => ts.isExportAssignment(s) && !s.isExportEquals) && !surfaces.some((s) => s.signature.export_name === "default")) {
    surfaces.push(component("default"))
  }
  surfaces.push(...hookSurfaces(sourceFile, rel))

  return { surfaces, deps: [] }
}

function findPropsTypeName(fn: ts.FunctionDeclaration): string | undefined {
  if (!fn.parameters.length) return undefined
  const firstParam = fn.parameters[0]
  if (!firstParam.type) return undefined
  if (ts.isTypeReferenceNode(firstParam.type)) {
    const typeName = firstParam.type.typeName
    if (ts.isIdentifier(typeName)) return typeName.text
  }
  return undefined
}

// ============================================================================
// Env file scanner
// ============================================================================

function scanEnvFile(
  rel: string,
  projectRoot: string,
  warnings: string[]
): ScannerResult {
  const surfaces: DetectedSurface[] = []

  const absPath = path.join(projectRoot, rel)
  let content: string
  try {
    content = fs.readFileSync(absPath, "utf8")
  } catch (e) {
    warnings.push(`env read error ${rel}: ${String(e)}`)
    return { surfaces, deps: [] }
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^export\s+/, "")
    if (!trimmed || trimmed.startsWith("#")) continue

    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue

    const name = trimmed.slice(0, eqIdx).trim()
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(name)) continue

    // NEVER emit the value - security rule. It is looked at only to say whether there is one, and is not kept.
    const hasDefault = !/^(""|'')?\s*(#.*)?$/.test(trimmed.slice(eqIdx + 1).trim())

    surfaces.push({
      canonical_id: `env:${name}`,
      kind: "env_var",
      location: { file_path: rel },
      signature: {
        required: true,
        has_default: hasDefault,
      },
    })
  }

  return { surfaces, deps: [] }
}

// ============================================================================
// Config file scanner
// ============================================================================

function propertyNames(obj: ts.ObjectLiteralExpression): string[] {
  const keys: string[] = []
  for (const prop of obj.properties) {
    if ((ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) && prop.name) {
      if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) keys.push(prop.name.text)
    }
  }
  return keys
}

/** Top-level keys of the object a JS/TS config file exports (export default {...} | name, module.exports = ...). */
function configKeys(sourceFile: ts.SourceFile): string[] {
  const consts = new Map<string, ts.Expression>()
  let exported: ts.Expression | undefined
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) consts.set(decl.name.text, decl.initializer)
      }
    } else if (ts.isExportAssignment(stmt)) {
      exported = stmt.expression
    } else if (
      ts.isExpressionStatement(stmt) &&
      ts.isBinaryExpression(stmt.expression) &&
      stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      stmt.expression.left.getText() === "module.exports"
    ) {
      exported = stmt.expression.right
    }
  }
  // Unwrap `x as T`, `x satisfies T`, (x), a wrapper call's first argument, and a const's name: a few steps at most.
  let node = exported
  for (let i = 0; node && i < 6; i++) {
    if (ts.isObjectLiteralExpression(node)) return propertyNames(node)
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression
    else if (ts.isIdentifier(node)) node = consts.get(node.text)
    else if (ts.isCallExpression(node)) node = node.arguments[0]
    else break
  }
  return []
}

function scanConfigFile(
  rel: string,
  projectRoot: string,
  warnings: string[]
): ScannerResult {
  const surfaces: DetectedSurface[] = []

  const absPath = path.join(projectRoot, rel)
  const fileName = path.basename(rel)

  let keys: string[] = []

  if (rel.endsWith(".json")) {
    try {
      const raw = fs.readFileSync(absPath, "utf8")
      const parsed = JSON.parse(raw)
      if (typeof parsed === "object" && parsed !== null) {
        keys = Object.keys(parsed)
      }
    } catch (e) {
      warnings.push(`config JSON parse error ${rel}: ${String(e)}`)
    }
  } else {
    const source = readSourceFile(absPath, warnings)
    const sourceFile = source ? parseTs(absPath, source, warnings) : null
    if (sourceFile) keys = configKeys(sourceFile)
  }

  surfaces.push({
    canonical_id: `config:${fileName}`,
    kind: "config_file",
    location: { file_path: rel },
    signature: { keys },
  })

  return { surfaces, deps: [] }
}

// ============================================================================
// Lib TS scanner - type_export, zod_schema, react_hook
// ============================================================================

function scanLibTs(
  rel: string,
  projectRoot: string,
  warnings: string[]
): ScannerResult {
  const surfaces: DetectedSurface[] = []
  const deps: DetectedDependency[] = []

  const absPath = path.join(projectRoot, rel)
  const source = readSourceFile(absPath, warnings)
  if (!source) return { surfaces, deps }

  const sourceFile = parseTs(absPath, source, warnings)
  if (!sourceFile) return { surfaces, deps }

  for (const stmt of sourceFile.statements) {
    if (!isExported(stmt)) continue

    // --- type_export: export type X = ... | export interface X { ... } ---
    if (ts.isTypeAliasDeclaration(stmt)) {
      const name = stmt.name.text
      surfaces.push({
        canonical_id: `type:${rel}:${name}`,
        kind: "type_export",
        location: { file_path: rel },
        signature: {
          name,
          is_interface: false,
          extends_count: 0,
          member_count: 0,
        },
      })
    } else if (ts.isInterfaceDeclaration(stmt)) {
      const name = stmt.name.text
      const extendsCount = stmt.heritageClauses?.reduce(
        (acc, hc) => acc + hc.types.length,
        0
      ) ?? 0
      const memberCount = stmt.members.length
      surfaces.push({
        canonical_id: `type:${rel}:${name}`,
        kind: "type_export",
        location: { file_path: rel },
        signature: {
          name,
          is_interface: true,
          extends_count: extendsCount,
          member_count: memberCount,
        },
      })
    }

    // --- zod_schema: exported const with z.object / z.ZodObject initializer ---
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue
        const name = decl.name.text
        if (!decl.initializer) continue

        if (isZodObjectCall(decl.initializer)) {
          const topLevelKeys = extractZodObjectKeys(decl.initializer)
          const hasStrictOrPassthrough = checkZodStrictPassthrough(decl.initializer)

          surfaces.push({
            canonical_id: `zod:${rel}:${name}`,
            kind: "zod_schema",
            location: { file_path: rel },
            signature: {
              name,
              top_level_keys_count: topLevelKeys,
              has_strict_or_passthrough: hasStrictOrPassthrough,
            },
          })
        }
      }
    }
  }

  // --- react_hook: exported use[A-Z] function or function-valued const ---
  surfaces.push(...hookSurfaces(sourceFile, rel))

  return { surfaces, deps }
}

function isZodObjectCall(node: ts.Expression): boolean {
  if (ts.isCallExpression(node)) {
    const exp = node.expression
    // z.object(...)
    if (
      ts.isPropertyAccessExpression(exp) &&
      ts.isIdentifier(exp.expression) &&
      exp.expression.text === "z" &&
      exp.name.text === "object"
    ) {
      return true
    }
    // z.object(...).strict() or .passthrough() chains
    if (ts.isPropertyAccessExpression(exp)) {
      return isZodObjectCall(exp.expression as ts.Expression)
    }
  }
  return false
}

function extractZodObjectKeys(node: ts.Expression): number {
  if (!ts.isCallExpression(node)) return 0
  const exp = node.expression
  if (
    ts.isPropertyAccessExpression(exp) &&
    ts.isIdentifier(exp.expression) &&
    exp.expression.text === "z" &&
    exp.name.text === "object"
  ) {
    const firstArg = node.arguments[0]
    if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
      return firstArg.properties.length
    }
    return 0
  }
  // Chain: recurse into base
  if (ts.isPropertyAccessExpression(exp)) {
    return extractZodObjectKeys(exp.expression as ts.Expression)
  }
  return 0
}

function checkZodStrictPassthrough(node: ts.Expression): boolean {
  const str = node.getText ? node.getText() : ""
  return /\.strict\(\)|\.passthrough\(\)/.test(str)
}

// ============================================================================
// Import edges - see import-edges.ts for the rules
// ============================================================================

/** The name a surface is exported under, for the kinds another file can import. */
function exportNameOf(surface: DetectedSurface): string | null {
  if (surface.kind === "ui_component") return (surface.signature.export_name as string) ?? null
  if (surface.kind === "type_export" || surface.kind === "zod_schema" || surface.kind === "react_hook") {
    return (surface.signature.name as string) ?? null
  }
  return null
}

function importEdges(input: {
  projectRoot: string
  scanned: Set<string>
  surfaces: DetectedSurface[]
  routeUsers: Map<string, Array<{ id: string; uses: Set<string> | null }>>
  pageFiles: string[]
  componentFiles: string[]
  libTsFiles: string[]
}): DetectedDependency[] {
  const { projectRoot, scanned } = input
  const quiet: string[] = [] // reading a file only to resolve an import must not add warnings to the result

  const byFile = new Map<string, DetectedSurface[]>()
  for (const s of input.surfaces) {
    const file = s.location.file_path
    if (typeof file !== "string") continue
    if (!byFile.has(file)) byFile.set(file, [])
    byFile.get(file)!.push(s)
  }

  // A file outside this scan (a targeted scan) is read, confined to the root, so its ids are the real ones.
  const allowed = new Map<string, boolean>()
  const exists = (file: string): boolean => {
    if (scanned.has(file)) return true
    if (!allowed.has(file)) {
      allowed.set(file, fs.existsSync(path.join(projectRoot, file)) && confineFiles(projectRoot, [file]).accepted.length === 1)
    }
    return allowed.get(file)!
  }
  const surfacesOf = (file: string): DetectedSurface[] => {
    if (!byFile.has(file)) {
      const found = scanned.has(file)
        ? []
        : file.startsWith("components/")
          ? scanUiComponent(file, projectRoot, quiet).surfaces
          : file.startsWith("lib/")
            ? scanLibTs(file, projectRoot, quiet).surfaces
            : []
      byFile.set(file, found)
    }
    return byFile.get(file)!
  }
  const parsed = new Map<string, ts.SourceFile | null>()
  const parse = (file: string): ts.SourceFile | null => {
    if (!parsed.has(file)) {
      const abs = path.join(projectRoot, file)
      const source = exists(file) ? readSourceFile(abs, quiet) : null
      parsed.set(file, source ? parseTs(abs, source, quiet) : null)
    }
    return parsed.get(file)!
  }

  const users = (file: string, kinds: readonly string[]) =>
    surfacesOf(file).filter((s) => kinds.includes(s.kind)).map((s) => ({ id: s.canonical_id, uses: null }))

  return detectImportEdges({
    importers: [
      ...[...input.routeUsers].map(([file, from]) => ({ file, from })),
      ...input.pageFiles.map((file) => ({ file, from: users(file, ["ui_page"]) })),
      ...input.componentFiles.map((file) => ({ file, from: users(file, ["ui_component", "react_hook"]) })),
      ...input.libTsFiles.map((file) => ({ file, from: users(file, ["react_hook"]) })),
    ],
    parse,
    exists,
    declared: (file) => {
      const out = new Map<string, string[]>()
      for (const s of surfacesOf(file)) {
        const name = exportNameOf(s)
        if (!name) continue
        if (!out.has(name)) out.set(name, [])
        out.get(name)!.push(s.canonical_id)
      }
      return out
    },
  })
}

// ============================================================================
// Mirror detection - an api_route and an mcp_tool that do the same thing to the same resource
// ============================================================================

const VERB_METHODS: Record<string, { methods: readonly string[]; one: boolean }> = {
  list: { methods: ["GET"], one: false },
  search: { methods: ["GET"], one: false },
  get: { methods: ["GET"], one: true },
  read: { methods: ["GET"], one: true },
  create: { methods: ["POST"], one: false },
  add: { methods: ["POST"], one: false },
  update: { methods: ["PATCH", "PUT"], one: true },
  delete: { methods: ["DELETE"], one: true },
  remove: { methods: ["DELETE"], one: true },
}

/** "skills" and "skill" are the same resource; "categories" and "category" too. */
const singular = (word: string): string =>
  word.endsWith("ies") ? word.slice(0, -3) + "y" : word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word

function detectMirrors(surfaces: DetectedSurface[]): DetectedDependency[] {
  const deps: DetectedDependency[] = []

  const routes = surfaces
    .filter((s) => s.kind === "api_route")
    .map((s) => {
      const segments = ((s.signature.path as string) ?? "").replace(/^\/api\//, "").split("/").filter(Boolean)
      return {
        id: s.canonical_id,
        method: s.signature.method as string,
        // /api/library/skills/[id] → "library_skill"; a word with - or _ in it counts as its parts.
        resource: segments.filter((seg) => !seg.startsWith("[")).flatMap((seg) => seg.toLowerCase().split(/[-_]/)).map(singular).join("_"),
        one: segments.length > 0 && segments[segments.length - 1].startsWith("["),
      }
    })

  for (const tool of surfaces.filter((s) => s.kind === "mcp_tool")) {
    // library_list_skills → verb "list", resource "library_skill"
    const words = tool.canonical_id.replace(/^mcp:/, "").toLowerCase().split(/[-_]/)
    const verbAt = words.findIndex((w) => w in VERB_METHODS)
    if (verbAt === -1) continue
    const verb = VERB_METHODS[words[verbAt]]
    const resource = words.filter((_, i) => i !== verbAt).map(singular).join("_")
    if (!resource) continue

    // "list" and "create" act on /things, never on /things/[id]. "get", "update" and "delete" act on
    // /things/[id] when the project has it, else on /things (a resource there is one of, like /dashboard).
    const same = routes.filter((r) => r.resource === resource && verb.methods.includes(r.method) && (verb.one || !r.one))
    const exact = same.filter((r) => r.one === verb.one)
    for (const route of exact.length > 0 ? exact : same) {
      deps.push({ from_canonical_id: route.id, to_canonical_id: tool.canonical_id, kind: "mirrors", confidence: 0.7 })
    }
  }

  return deps
}

// ============================================================================
// Shared TS parsing utilities
// ============================================================================

function readSourceFile(absPath: string, warnings: string[]): string | null {
  try {
    return fs.readFileSync(absPath, "utf8")
  } catch (e) {
    warnings.push(`file read error ${absPath}: ${String(e)}`)
    return null
  }
}

function parseTs(
  absPath: string,
  source: string,
  warnings: string[]
): ts.SourceFile | null {
  try {
    return ts.createSourceFile(
      absPath,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TSX
    )
  } catch (e) {
    warnings.push(`TS parse error ${absPath}: ${String(e)}`)
    return null
  }
}
