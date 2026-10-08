/* Run: npx -y tsx@4.23.15 lib/auth/mcp-binding.assert.ts
 *
 * In-app agent runs are bound to the project the owner has open: project
 * writes elsewhere are refused no matter which ids the model passes. API-key
 * callers (no binding) are unaffected. No database needed: the binding is
 * decided from the request context alone.
 */
import { runWithMcpContext, mcpWriteBindingError, type McpContext } from "./mcp-context"

let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got:  ${a}\n  want: ${b}`) } }

const base: McpContext = { userId: "u1", apiKeyId: "k1", scopes: ["read", "write"] }
const inCtx = <T,>(ctx: McpContext, fn: () => T) => runWithMcpContext(ctx, fn) as T

eq("outside any MCP context: no binding", mcpWriteBindingError("p-other"), null)
eq("API-key caller (binding undefined): any project allowed", inCtx(base, () => mcpWriteBindingError("p-other")), null)

const bound = { ...base, apiKeyId: "in-app:jarvis", writeBoundProjectId: "p-open" }
eq("in-app run: the open project is allowed", inCtx(bound, () => mcpWriteBindingError("p-open")), null)
eq("in-app run: another project is refused", inCtx(bound, () => mcpWriteBindingError("p-other")) !== null, true)
eq("in-app run: a null/absent project is refused", inCtx(bound, () => mcpWriteBindingError(null)) !== null, true)

const none = { ...base, apiKeyId: "in-app:jarvis", writeBoundProjectId: null }
eq("in-app run with no project open: every project is refused", inCtx(none, () => mcpWriteBindingError("p-open")) !== null, true)

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1)
