/*
 * What each exported handler of a route file does, read from its own code.
 *
 * A route file exports one function per HTTP method. Whether a handler checks
 * auth, validates its body, or touches a table is a fact about THAT handler
 * and the same-file code it reaches, not about the file: a file whose GET
 * checks auth and whose DELETE does not is exactly the case the catalog must
 * be able to show.
 *
 * For each method this returns the handler's "reach": its own code plus every
 * top-level function or const in the same file it refers to, followed as deep
 * as it goes. Code in other files is not followed.
 */

import * as ts from "typescript"

export interface HandlerReach {
  method: string
  /** The handler's code and the same-file code it reaches, joined. Empty when the handler is re-exported from another file. */
  text: string
  /** Every identifier used in that code. */
  identifiers: Set<string>
  /** Each SQL statement or fragment found in it, dynamic parts replaced by " ? ". */
  sql: string[]
  /** True when the handler's code is in another file (export { GET } from "..."), so nothing is known about it. */
  elsewhere: boolean
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some((m) => m.kind === kind) ?? false

/** Top-level names of a file mapped to the node that defines them. */
function topLevelNames(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const names = new Map<string, ts.Node>()
  for (const stmt of sourceFile.statements) {
    if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) {
      names.set(stmt.name.text, stmt)
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.set(decl.name.text, decl)
      }
    }
  }
  return names
}

/** Identifiers that refer to something: not the `b` of `a.b`, not the key of `{ b: 1 }`. */
function identifiersIn(node: ts.Node, out: Set<string>): void {
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const parent = n.parent
      const isMemberName = parent && ts.isPropertyAccessExpression(parent) && parent.name === n
      const isKey = parent && ts.isPropertyAssignment(parent) && parent.name === n
      if (!isMemberName && !isKey) out.add(n.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
}

const SQL_TAG = /^(?:\w+\.)*sql$/
const SQL_CALL = /^(?:(?:\w+\.)*(?:sql|client|pool|db|tx)\.(?:query|unsafe)|sql)$/

function templateText(node: ts.TemplateLiteral | ts.StringLiteral): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return node.head.text + node.templateSpans.map((s) => " ? " + s.literal.text).join("")
}

function sqlIn(node: ts.Node, out: string[]): void {
  const visit = (n: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(n) && SQL_TAG.test(n.tag.getText())) {
      out.push(templateText(n.template))
    } else if (ts.isCallExpression(n) && SQL_CALL.test(n.expression.getText())) {
      const first = n.arguments[0]
      if (first && (ts.isStringLiteral(first) || ts.isTemplateLiteral(first))) out.push(templateText(first))
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
}

/** The reach of each exported handler named in `methods`, in the order of `methods`. */
export function readRouteHandlers(sourceFile: ts.SourceFile, methods: readonly string[]): HandlerReach[] {
  const names = topLevelNames(sourceFile)
  const roots = new Map<string, ts.Node | null>()

  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      if (methods.includes(stmt.name.text)) roots.set(stmt.name.text, stmt)
    } else if (ts.isVariableStatement(stmt) && hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && methods.includes(decl.name.text)) roots.set(decl.name.text, decl)
      }
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        if (!methods.includes(el.name.text)) continue
        const local = (el.propertyName ?? el.name).text
        roots.set(el.name.text, stmt.moduleSpecifier ? null : names.get(local) ?? null)
      }
    }
  }

  const out: HandlerReach[] = []
  for (const method of methods) {
    if (!roots.has(method)) continue
    const root = roots.get(method) ?? null
    if (!root) {
      out.push({ method, text: "", identifiers: new Set(), sql: [], elsewhere: true })
      continue
    }
    const reached = new Set<ts.Node>([root])
    const identifiers = new Set<string>()
    const queue: ts.Node[] = [root]
    while (queue.length > 0) {
      const found = new Set<string>()
      identifiersIn(queue.pop()!, found)
      for (const name of found) {
        identifiers.add(name)
        const target = names.get(name)
        if (target && !reached.has(target)) {
          reached.add(target)
          queue.push(target)
        }
      }
    }
    const sql: string[] = []
    const parts: string[] = []
    for (const node of reached) {
      sqlIn(node, sql)
      parts.push(node.getText(sourceFile))
    }
    out.push({ method, text: parts.join("\n"), identifiers, sql, elsewhere: false })
  }
  return out
}

/**
 * Names that count as an auth or authorization check when a handler reaches
 * them. CRON_SECRET is the name of the secret a scheduled route compares its
 * bearer token with; only the name is ever read.
 */
const AUTH_NAME =
  /\b(getAuthContext|authenticateRequest|validateMcpApiKey|requireMcpScope|require(?:Admin|Auth|User|Owner|Role|Session)\w*|verify[A-Z]\w*|CRON_SECRET)\b/g

/** The checks a handler reaches, by name, sorted. Empty means none was found. */
export function authChecksIn(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(AUTH_NAME)) found.add(m[1])
  if (/\bsession\s*\?\s*\./.test(text)) found.add("session")
  return [...found].sort()
}

export function validatesBody(text: string): boolean {
  return /(?<!JSON)\.parse\(|\.safeParse\(|z\.object\(/.test(text)
}
