/**
 * Catalog AST scanner — Idea H Wave 1.
 *
 * Scans the planner's own codebase and emits DetectedSurface + DetectedDependency
 * records for every surface kind the planner cares about.
 *
 * Ported from Memory-Agent's module-relationship-analyzer.ts (buildExportRelations,
 * detectCircularDependencies patterns). MA's repo is NOT imported at runtime;
 * this is an independent copy of the relevant logic.
 *
 * No DB calls here — the caller (persist.ts or an API route) does the DB work.
 *
 * Surface kinds detected:
 *   db_table, db_column, db_enum, db_matview  — SQL migration files
 *   api_route                                  — app/api/**/route.ts(x)
 *   mcp_tool                                   — app/mcp/route.ts (server.tool calls)
 *   middleware                                 — middleware.ts at root
 *   ui_page                                    — app/**/page.tsx
 *   ui_component                               — components/**/*.tsx default/named exports
 *   env_var                                    — .env* files
 *   config_file                                — next.config.*, vercel.json, tailwind.config.*
 *   type_export                                — export type/interface in lib/**/*.ts
 *   zod_schema                                 — exported z.object/z.ZodObject vars
 *   react_hook                                 — exported use* functions in lib/**/*.ts(x)
 *   webhook_endpoint                           — api_route sub-kind; adds is_webhook to sig
 *
 * Deferred to v2: nav_link, feature_flag, helper, integration
 */

import * as fs from "fs"
import * as path from "path"
import * as ts from "typescript"
import fg from "fast-glob"
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
  /** Git commit SHA for first/last_seen stamping — passed through to warnings only; callers embed in DetectedSurface via persist layer */
  commitSha?: string
  /** Branch name — same */
  branch?: string
}

export async function scanPaths(opts: ScanOptions): Promise<ScanResult> {
  const start = Date.now()
  const warnings: string[] = []
  const detectedSurfaces: DetectedSurface[] = []
  const detectedDependencies: DetectedDependency[] = []

  const { projectRoot, files } = opts
  const scanType: ScanType = files ? "targeted" : "full"

  // ---- Resolve file list ----
  let scanFiles: string[] = []
  if (files && files.length > 0) {
    scanFiles = files
  } else {
    scanFiles = await discoverAllFiles(projectRoot)
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

  for (const rel of scanFiles) {
    const norm = rel.replace(/\\/g, "/")
    if (/^lib\/db\/migrations\/[^/]+\.sql$/.test(norm)) {
      sqlFiles.push(norm)
    } else if (/^app\/api\/.+\/route\.tsx?$/.test(norm)) {
      apiRouteFiles.push(norm)
    } else if (/^app\/mcp\/.*route\.tsx?$/.test(norm) || norm === "app/mcp/route.ts" || norm === "app/mcp/route.tsx") {
      mcpRouteFiles.push(norm)
    } else if (/^middleware\.tsx?$/.test(norm)) {
      middlewareFiles.push(norm)
    } else if (/^app\/.+\/page\.tsx?$/.test(norm)) {
      pageFiles.push(norm)
    } else if (/^components\/.+\.tsx?$/.test(norm)) {
      componentFiles.push(norm)
    } else if (/^\.env(\..+)?$/.test(norm)) {
      envFiles.push(norm)
    } else if (
      /^next\.config\.(js|mjs|ts|cjs)$/.test(norm) ||
      /^vercel\.(json|ts)$/.test(norm) ||
      /^tailwind\.config\.(js|mjs|ts|cjs)$/.test(norm)
    ) {
      configFiles.push(norm)
    } else if (/^lib\/(?!.*\.test\.)(?!.*\.spec\.).*\.tsx?$/.test(norm)) {
      libTsFiles.push(norm)
    }
  }

  // ---- Run each scanner ----
  const sqlResult = scanSqlMigrations(sqlFiles, projectRoot, warnings)
  detectedSurfaces.push(...sqlResult.surfaces)
  detectedDependencies.push(...sqlResult.deps)

  for (const rel of apiRouteFiles) {
    try {
      const result = scanApiRoute(rel, projectRoot, warnings)
      detectedSurfaces.push(...result.surfaces)
      detectedDependencies.push(...result.deps)
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
    const importDeps = detectImportEdges(
      [...apiRouteFiles, ...pageFiles, ...componentFiles, ...libTsFiles, ...mcpRouteFiles],
      projectRoot,
      warnings
    )
    detectedDependencies.push(...importDeps)
  } catch (e) {
    warnings.push(`import edge detection failed: ${String(e)}`)
  }

  // ---- Detect api_route ↔ mcp_tool mirrors ----
  try {
    const mirrorDeps = detectMirrors(detectedSurfaces, warnings)
    detectedDependencies.push(...mirrorDeps)
  } catch (e) {
    warnings.push(`mirror detection failed: ${String(e)}`)
  }

  const duration_ms = Date.now() - start

  return {
    scanned_files: scanFiles,
    scan_type: scanType,
    detected_surfaces: detectedSurfaces,
    detected_dependencies: detectedDependencies,
    warnings,
    duration_ms,
  }
}

// ============================================================================
// File discovery
// ============================================================================

async function discoverAllFiles(projectRoot: string): Promise<string[]> {
  const skipDirPatterns = Array.from(SKIP_DIRS).map((d) => `!**/${d}/**`)
  const patterns = [
    "lib/db/migrations/*.sql",
    "app/api/**/route.ts",
    "app/api/**/route.tsx",
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
    ignore: Array.from(SKIP_DIRS).map((d) => `**/${d}/**`),
  })
  return found
}

// ============================================================================
// SQL migration scanner — db_table, db_column, db_enum, db_matview
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

  for (const rel of files) {
    const absPath = path.join(projectRoot, rel)
    let sql: string
    try {
      sql = fs.readFileSync(absPath, "utf8")
    } catch (e) {
      warnings.push(`SQL read error ${rel}: ${String(e)}`)
      continue
    }

    // --- db_enum ---
    const enumRe = /CREATE\s+TYPE\s+"?(\w+)"?\s+AS\s+ENUM\s*\(([^)]+)\)/gi
    let em: RegExpExecArray | null
    while ((em = enumRe.exec(sql)) !== null) {
      const name = em[1]
      const valuesRaw = em[2]
      const values = valuesRaw
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
      const name = mv[1]
      const body = mv[2]
      const tableRefs = extractFromClauseTables(body)
      surfaces.push({
        canonical_id: `matview:${name}`,
        kind: "db_matview",
        location: { file_path: rel, table_name: name },
        signature: { depends_on_tables: tableRefs },
      })
    }

    // --- db_table + db_column ---
    const tableRe =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s*\(([^;]+?)\)\s*;/gis
    let tm: RegExpExecArray | null
    while ((tm = tableRe.exec(sql)) !== null) {
      const tableName = tm[1]
      const body = tm[2]

      const { columns, primaryKey, inlineIndexes, inlineConstraints } =
        parseTableBody(body, warnings)

      surfaces.push({
        canonical_id: `db:${tableName}`,
        kind: "db_table",
        location: { file_path: rel, table_name: tableName },
        signature: {
          columns: columns.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: c.nullable,
          })),
          primary_key: primaryKey,
          indexes_inline: inlineIndexes,
          constraints: inlineConstraints,
        },
      })

      for (const col of columns) {
        surfaces.push({
          canonical_id: `db:${tableName}.${col.name}`,
          kind: "db_column",
          location: {
            file_path: rel,
            table_name: tableName,
            column_name: col.name,
          },
          signature: {
            type: col.type,
            nullable: col.nullable,
            ...(col.default !== undefined ? { default: col.default } : {}),
            ...(col.check ? { check: col.check } : {}),
            ...(col.references ? { references: col.references } : {}),
          },
        })
      }
    }
  }

  return { surfaces, deps }
}

interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  default?: string
  check?: string
  references?: string
}

function parseTableBody(
  body: string,
  warnings: string[]
): {
  columns: ColumnInfo[]
  primaryKey: string[]
  inlineIndexes: string[]
  inlineConstraints: string[]
} {
  const columns: ColumnInfo[] = []
  const primaryKey: string[] = []
  const inlineIndexes: string[] = []
  const inlineConstraints: string[] = []

  // Split lines roughly (nested parens are rare in CREATE TABLE, handle best-effort)
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    const clean = line.replace(/,$/, "").trim()
    if (!clean) continue

    // PRIMARY KEY constraint line
    if (/^(CONSTRAINT\s+\w+\s+)?PRIMARY\s+KEY\s*\(/i.test(clean)) {
      const m = clean.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i)
      if (m) {
        primaryKey.push(
          ...m[1].split(",").map((c) => c.trim().replace(/"/g, ""))
        )
      }
      inlineConstraints.push(clean)
      continue
    }
    // CONSTRAINT or UNIQUE or CHECK (not column def)
    if (/^CONSTRAINT\s+\w+/i.test(clean) || /^UNIQUE\s*\(/i.test(clean)) {
      inlineConstraints.push(clean)
      continue
    }
    // CHECK at table level (no column prefix)
    if (/^CHECK\s*\(/i.test(clean)) {
      inlineConstraints.push(clean)
      continue
    }

    // Column definition: identifier type [constraints...]
    const colMatch = clean.match(/^"?(\w+)"?\s+(\w+(?:\s*\(\s*[\d,\s]+\s*\))?(?:\s+\w+)?)/i)
    if (!colMatch) continue

    const colName = colMatch[1].toUpperCase()
    // Skip SQL keywords that appear as "column names" in this position
    if (
      /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|INDEX|REFERENCES|ON|CREATE|ALTER|WITH|USING)$/i.test(
        colName
      )
    ) {
      continue
    }

    const colType = colMatch[2].trim().toUpperCase()
    const nullable = !/NOT\s+NULL/i.test(clean)
    const defaultMatch = clean.match(/DEFAULT\s+(.+?)(?:\s+(?:NOT\s+NULL|NULL|CHECK|REFERENCES|PRIMARY|CONSTRAINT)|$)/i)
    const checkMatch = clean.match(/CHECK\s*\(([^)]+)\)/i)
    const refMatch = clean.match(/REFERENCES\s+"?(\w+)"?\s*(?:\("?(\w+)"?\))?/i)

    columns.push({
      name: colMatch[1], // preserve original case
      type: colType,
      nullable,
      ...(defaultMatch ? { default: defaultMatch[1].trim() } : {}),
      ...(checkMatch ? { check: checkMatch[1].trim() } : {}),
      ...(refMatch ? { references: `${refMatch[1]}${refMatch[2] ? `.${refMatch[2]}` : ""}` } : {}),
    })
  }

  return { columns, primaryKey, inlineIndexes, inlineConstraints }
}

function extractFromClauseTables(sql: string): string[] {
  const tables: string[] = []
  const re = /FROM\s+"?(\w+)"?(?:\s+(?:AS\s+)?\w+)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    const t = m[1]
    if (!["SELECT", "WITH", "WHERE", "ON", "AND", "OR", "NOT"].includes(t.toUpperCase())) {
      tables.push(t)
    }
  }
  const joinRe = /JOIN\s+"?(\w+)"?/gi
  while ((m = joinRe.exec(sql)) !== null) {
    tables.push(m[1])
  }
  return [...new Set(tables)]
}

// ============================================================================
// API route scanner — api_route (+ webhook_endpoint subkind)
// ============================================================================

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

function deriveUrlPath(relFilePath: string): string {
  // app/api/skills/[id]/route.ts → /api/skills/[id]
  return relFilePath
    .replace(/^app/, "")
    .replace(/\/route\.tsx?$/, "")
    .replace(/\\/g, "/")
}

function scanApiRoute(
  rel: string,
  projectRoot: string,
  warnings: string[]
): ScannerResult {
  const surfaces: DetectedSurface[] = []
  const deps: DetectedDependency[] = []

  const absPath = path.join(projectRoot, rel)
  const source = readSourceFile(absPath, warnings)
  if (!source) return { surfaces, deps }

  const urlPath = deriveUrlPath(rel)
  const isWebhook = /\/webhooks?\//.test(urlPath)
  const dynamicSegments = (urlPath.match(/\[([^\]]+)\]/g) || []).map((s) =>
    s.replace(/^\[|\]$/g, "")
  )

  const sqlPatterns: Array<{method: string, table: string}> = extractSqlPatterns(source)

  const exported = getExportedNames(source)

  for (const method of HTTP_METHODS) {
    if (!exported.has(method)) continue

    const canonicalId = `route:${method} ${urlPath}`
    const authCheck = hasAuthCheck(source) ? "present" : "absent"
    const bodyValidation = hasBodyValidation(source) ? "present" : "absent"

    surfaces.push({
      canonical_id: canonicalId,
      kind: "api_route",
      location: { file_path: rel, url_pattern: urlPath },
      signature: {
        method,
        path: urlPath,
        dynamic_segments: dynamicSegments,
        body_validation: bodyValidation,
        auth_check: authCheck,
        ...(isWebhook ? { is_webhook: true } : {}),
      },
    })

    // reads_from / writes_to edges for SQL patterns
    for (const { method: sqlMethod, table } of sqlPatterns) {
      const tableCanonicalId = `db:${table}`
      const depKind =
        sqlMethod === "SELECT" ? "reads_from" : "writes_to"
      deps.push({
        from_canonical_id: canonicalId,
        to_canonical_id: tableCanonicalId,
        kind: depKind,
        confidence: 0.85, // inferred from SQL template literal; not 100% certain
      })
    }
  }

  return { surfaces, deps }
}

function extractSqlPatterns(source: string): Array<{method: string, table: string}> {
  const results: Array<{method: string, table: string}> = []
  // Match template literals: sql`SELECT ... FROM table`
  const re = /sql(?:\.unsafe)?\s*`([^`]+)`/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const body = m[1]
    const sqlUpper = body.toUpperCase().trim()
    let method = ""
    if (sqlUpper.startsWith("SELECT")) method = "SELECT"
    else if (sqlUpper.startsWith("INSERT")) method = "INSERT"
    else if (sqlUpper.startsWith("UPDATE")) method = "UPDATE"
    else if (sqlUpper.startsWith("DELETE")) method = "DELETE"
    if (!method) continue

    const fromMatch = body.match(/FROM\s+"?(\w+)"?/i) || body.match(/(?:INTO|UPDATE)\s+"?(\w+)"?/i)
    if (fromMatch) {
      results.push({ method, table: fromMatch[1] })
    }
  }
  return results
}

function hasAuthCheck(source: string): boolean {
  return (
    /getAuthContext|verifyProjectOwnership|requireMcpScope|validateMcpApiKey|session\s*\?\s*\./i.test(
      source
    )
  )
}

function hasBodyValidation(source: string): boolean {
  return /\.parse\(|\.safeParse\(|z\.object\(/i.test(source)
}

// ============================================================================
// MCP tool scanner — mcp_tool
// ============================================================================

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
        const descArg = args[1]

        if (
          ts.isStringLiteral(nameArg) ||
          (ts.isNoSubstitutionTemplateLiteral && ts.isStringLiteral(nameArg))
        ) {
          const toolName = (nameArg as ts.StringLiteral).text
          const description = ts.isStringLiteral(descArg)
            ? (descArg as ts.StringLiteral).text
            : "(see source)"

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
              description: description.slice(0, 200), // truncate — descriptions can be long
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

  const urlPath = deriveUiPath(rel)
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

function deriveUiPath(rel: string): string {
  return rel
    .replace(/^app/, "")
    .replace(/\/page\.tsx?$/, "")
    .replace(/\\/g, "/") || "/"
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

  // Collect exported top-level declarations starting with uppercase
  for (const stmt of sourceFile.statements) {
    const exports = extractComponentExports(stmt)
    for (const exp of exports) {
      surfaces.push({
        canonical_id: `component:${rel}:${exp.name}`,
        kind: "ui_component",
        location: { file_path: rel },
        signature: {
          export_name: exp.name,
          has_use_client: hasUseClient,
          ...(exp.propsTypeName ? { props_type_name: exp.propsTypeName } : {}),
        },
      })
    }
  }

  return { surfaces, deps: [] }
}

interface ComponentExport {
  name: string
  propsTypeName?: string
}

function extractComponentExports(stmt: ts.Statement): ComponentExport[] {
  const results: ComponentExport[] = []

  const hasExport =
    stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
  const isDefault =
    stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false

  if (ts.isFunctionDeclaration(stmt) && stmt.name) {
    const name = stmt.name.text
    if (!hasExport) return results
    if (!isDefault && !/^[A-Z]/.test(name)) return results
    const exportName = isDefault ? "default" : name
    results.push({
      name: exportName,
      propsTypeName: findPropsTypeName(stmt),
    })
  } else if (ts.isVariableStatement(stmt) && hasExport) {
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const name = decl.name.text
        if (!/^[A-Z]/.test(name)) continue
        results.push({ name, propsTypeName: undefined })
      }
    }
  } else if (ts.isExportAssignment(stmt)) {
    // export default ...
    results.push({ name: "default" })
  }

  return results
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

  const lines = content.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue

    const name = trimmed.slice(0, eqIdx).trim()
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(name)) continue

    const rawValue = trimmed.slice(eqIdx + 1).trim()
    const hasDefault = rawValue.length > 0

    surfaces.push({
      canonical_id: `env:${name}`,
      kind: "env_var",
      location: { file_path: rel },
      signature: {
        // NEVER emit the value — security rule
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
    // TS/JS config: extract top-level export keys heuristically
    const source = readSourceFile(absPath, warnings)
    if (source) {
      const topLevelRe = /(?:export\s+(?:default\s+)?(?:const|let|var)\s+(\w+)|module\.exports\s*=\s*\{([^}]*)\})/g
      let m: RegExpExecArray | null
      while ((m = topLevelRe.exec(source)) !== null) {
        if (m[1]) keys.push(m[1])
        if (m[2]) {
          const objKeys = m[2].matchAll(/(\w+)\s*:/g)
          for (const ok of objKeys) {
            keys.push(ok[1])
          }
        }
      }
    }
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
// Lib TS scanner — type_export, zod_schema, react_hook
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
    const hasExport =
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false

    if (!hasExport) continue

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

    // --- react_hook: exported function starting with use[A-Z] ---
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const name = stmt.name.text
      if (/^use[A-Z]/.test(name)) {
        const hasParams = (stmt.parameters?.length ?? 0) > 0
        surfaces.push({
          canonical_id: `hook:${rel}:${name}`,
          kind: "react_hook",
          location: { file_path: rel },
          signature: { name, has_params: hasParams },
        })
      }
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
// Import edge detection — imports edges across files
// ============================================================================

function detectImportEdges(
  files: string[],
  projectRoot: string,
  warnings: string[]
): DetectedDependency[] {
  const deps: DetectedDependency[] = []

  for (const rel of files) {
    const absPath = path.join(projectRoot, rel)
    const source = readSourceFile(absPath, warnings)
    if (!source) continue

    const sourceFile = parseTs(absPath, source, warnings)
    if (!sourceFile) continue

    const fromCanonical = fileToCanonicalId(rel)
    if (!fromCanonical) continue

    for (const stmt of sourceFile.statements) {
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const importPath = stmt.moduleSpecifier.text
        // Only local imports (not node_modules)
        if (!importPath.startsWith(".") && !importPath.startsWith("@/")) continue

        const toCanonical = resolveImportToCanonical(importPath, rel)
        if (!toCanonical) continue

        deps.push({
          from_canonical_id: fromCanonical,
          to_canonical_id: toCanonical,
          kind: "imports",
          confidence: 1.0,
        })
      }
    }
  }

  return deps
}

function fileToCanonicalId(rel: string): string | null {
  const norm = rel.replace(/\\/g, "/")
  if (/^app\/api\/.+\/route\.tsx?$/.test(norm)) {
    // Each method is a separate canonical; skip file-level
    return null
  }
  if (/^app\/.+\/page\.tsx?$/.test(norm)) {
    return `ui:${deriveUiPath(norm)}`
  }
  if (/^components\/.+\.tsx?$/.test(norm)) {
    return `component:${norm}:default`
  }
  if (/^lib\/.+\.tsx?$/.test(norm)) {
    return `type:${norm}:*`
  }
  return null
}

function resolveImportToCanonical(importPath: string, fromFile: string): string | null {
  const norm = fromFile.replace(/\\/g, "/")
  const dir = path.dirname(norm)

  let resolved: string
  if (importPath.startsWith("@/")) {
    resolved = importPath.replace("@/", "")
  } else {
    resolved = path.join(dir, importPath).replace(/\\/g, "/")
  }

  // Normalize extension
  resolved = resolved.replace(/\.(ts|tsx|js|jsx)$/, "")
  if (resolved.endsWith("/index")) resolved = resolved.slice(0, -6)

  if (resolved.startsWith("lib/")) return `type:${resolved}:*`
  if (resolved.startsWith("components/")) return `component:${resolved}:default`
  if (/app\/.+\/page$/.test(resolved)) return `ui:${deriveUiPath(resolved + ".tsx")}`
  return null
}

// ============================================================================
// Mirror detection — api_route ↔ mcp_tool with similar names
// ============================================================================

function detectMirrors(
  surfaces: DetectedSurface[],
  warnings: string[]
): DetectedDependency[] {
  const deps: DetectedDependency[] = []

  const apiRoutes = surfaces.filter((s) => s.kind === "api_route")
  const mcpTools = surfaces.filter((s) => s.kind === "mcp_tool")

  for (const route of apiRoutes) {
    const routePath: string = (route.signature.path as string) ?? ""
    // Normalize: /api/skills → "skills", /api/library/skills → "library_skills"
    const routeSlug = routePath
      .replace(/^\/api\//, "")
      .replace(/\//g, "_")
      .replace(/\[([^\]]+)\]/g, "") // remove dynamic segments
      .replace(/_+$/g, "")
      .toLowerCase()

    for (const tool of mcpTools) {
      const toolName = tool.canonical_id.replace(/^mcp:/, "").toLowerCase()
      // Check if tool name contains the route slug or vice versa
      if (
        routeSlug.length >= 3 &&
        (toolName.includes(routeSlug) || routeSlug.includes(toolName.replace(/[_-]/g, "")))
      ) {
        deps.push({
          from_canonical_id: route.canonical_id,
          to_canonical_id: tool.canonical_id,
          kind: "mirrors",
          confidence: 0.7,
        })
      }
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

function getExportedNames(source: string): Set<string> {
  const names = new Set<string>()
  const re = /export\s+(?:async\s+)?(?:function|const|let|var)\s+(\w+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    names.add(m[1])
  }
  return names
}
