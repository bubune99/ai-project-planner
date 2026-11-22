/*
 * Import edges for the catalog: which surface uses which.
 *
 * An edge is only worth emitting when both of its ends are real surfaces,
 * because the save step drops any edge whose end it cannot find. So an import
 * is resolved all the way: the file it points at (through @/ or a relative
 * path, an index file, export { } from and export * from), then the surface
 * in that file with the imported name.
 *
 * Who the edge is FROM depends on the importing file:
 *   - a page: the page;
 *   - a component file: each component and hook it exports (the file's imports
 *     cannot be told apart per export, so with more than one the edge is less
 *     sure);
 *   - a route file: only the handlers that use the imported name.
 * Files under lib/ are ends of edges, not starts: there is no surface that
 * stands for "this module", so lib-to-lib imports are not recorded.
 */

import * as path from "path"
import * as ts from "typescript"
import type { DetectedDependency } from "./types"

export interface ImportBinding {
  /** The name used in the importing file. */
  local: string
  /** The name exported by the other file: a name, or "default". */
  imported: string
  /** The module path as written. */
  spec: string
}

/** Named and default imports of local files (@/ or relative). Namespace imports are skipped. */
export function importBindings(sourceFile: ts.SourceFile): ImportBinding[] {
  const out: ImportBinding[] = []
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const spec = stmt.moduleSpecifier.text
    if (!spec.startsWith(".") && !spec.startsWith("@/")) continue
    const clause = stmt.importClause
    if (!clause) continue
    if (clause.name) out.push({ local: clause.name.text, imported: "default", spec })
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        out.push({ local: el.name.text, imported: (el.propertyName ?? el.name).text, spec })
      }
    }
  }
  return out
}

/** The project-relative file an import points at, or null. Never leaves the project. */
export function resolveImport(spec: string, fromFile: string, exists: (rel: string) => boolean): string | null {
  let base: string
  if (spec.startsWith("@/")) base = spec.slice(2)
  else base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec))
  if (base.startsWith("..") || path.posix.isAbsolute(base)) return null
  const noJs = base.replace(/\.(js|jsx|mjs)$/, "")
  const candidates = /\.(ts|tsx)$/.test(base)
    ? [base]
    : [`${noJs}.ts`, `${noJs}.tsx`, `${noJs}/index.ts`, `${noJs}/index.tsx`]
  return candidates.find(exists) ?? null
}

export interface ImportEdgeInput {
  /** Files whose imports become edges, with who the edges are from. */
  importers: Array<{
    file: string
    /** Canonical ids the file's imports belong to, each with the names it is known to use (null: all of them). */
    from: Array<{ id: string; uses: Set<string> | null }>
  }>
  parse: (file: string) => ts.SourceFile | null
  exists: (file: string) => boolean
  /** Export name to canonical ids for the surfaces declared in a file (not following re-exports). */
  declared: (file: string) => Map<string, string[]>
}

const MAX_REEXPORT_DEPTH = 5

export function detectImportEdges(input: ImportEdgeInput): DetectedDependency[] {
  const exportsCache = new Map<string, Map<string, string[]>>()

  /** Everything a file exports, following export { } from and export * from. */
  function exportsOf(file: string, depth: number): Map<string, string[]> {
    const cached = exportsCache.get(file)
    if (cached) return cached
    const out = new Map<string, string[]>()
    exportsCache.set(file, out) // also stops a cycle
    for (const [name, ids] of input.declared(file)) out.set(name, [...ids])
    if (depth >= MAX_REEXPORT_DEPTH) return out
    const sourceFile = input.parse(file)
    if (!sourceFile) return out
    for (const stmt of sourceFile.statements) {
      if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
      const target = resolveImport(stmt.moduleSpecifier.text, file, input.exists)
      if (!target || target === file) continue
      const theirs = exportsOf(target, depth + 1)
      if (!stmt.exportClause) {
        for (const [name, ids] of theirs) if (name !== "default" && !out.has(name)) out.set(name, ids)
      } else if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const ids = theirs.get((el.propertyName ?? el.name).text)
          if (ids && !out.has(el.name.text)) out.set(el.name.text, ids)
        }
      }
    }
    return out
  }

  const deps: DetectedDependency[] = []
  for (const { file, from } of input.importers) {
    if (from.length === 0) continue
    const sourceFile = input.parse(file)
    if (!sourceFile) continue
    const sure = from.length === 1 || from.every((f) => f.uses !== null)
    for (const binding of importBindings(sourceFile)) {
      const target = resolveImport(binding.spec, file, input.exists)
      if (!target || target === file) continue
      const ids = exportsOf(target, 0).get(binding.imported)
      if (!ids) continue
      for (const { id, uses } of from) {
        if (uses && !uses.has(binding.local)) continue
        for (const to of ids) {
          if (to !== id) deps.push({ from_canonical_id: id, to_canonical_id: to, kind: "imports", confidence: sure ? 1.0 : 0.8 })
        }
      }
    }
  }
  return deps
}
