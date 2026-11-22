/*
 * Finds calls to the browser's own boxes: confirm(), alert() and prompt(). They are not the product's dialog, cannot
 * be closed by pressing outside, and freeze the whole tab until answered. Pure: source text in, hits out. The source
 * is parsed, so the same words in a comment, a string or as a method of something else (toast.confirm) are not hits.
 * What to use instead: lib/ui/ask.ts (askConfirm, askText).
 */

import ts from "typescript"

export interface BoxHit { line: number; call: string }

const BOXES = new Set(["confirm", "alert", "prompt"])
const GLOBALS = new Set(["window", "globalThis", "self"])

function boxName(callee: ts.Expression): string | null {
  if (ts.isIdentifier(callee)) return BOXES.has(callee.text) ? callee.text : null
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && GLOBALS.has(callee.expression.text) && BOXES.has(callee.name.text)) {
    return `${callee.expression.text}.${callee.name.text}`
  }
  return null
}

export function findBrowserBoxes(source: string, fileName = "file.tsx"): BoxHit[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hits: BoxHit[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const call = boxName(node.expression)
      if (call) hits.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, call })
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return hits
}
