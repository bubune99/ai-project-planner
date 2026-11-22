/* Run: npx -y tsx@4.23.15 lib/catalog/resolve-user.assert.ts */
import { NO_CATALOG_USER, resolveCatalogUserId } from "./resolve-user"

let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got:  ${a}\n  want: ${b}`) } }
const throws = (n: string, fn: () => unknown, msg: string) => { let got = "(no throw)"; try { fn() } catch (e: any) { got = e.message } eq(n, got, msg) }

eq("an explicit user wins over the env", resolveCatalogUserId("u-1", { CATALOG_DEFAULT_USER_ID: "u-env" }), "u-1")
eq("an explicit user is trimmed", resolveCatalogUserId("  u-1 ", {}), "u-1")
eq("no explicit user falls back to the env", resolveCatalogUserId(undefined, { CATALOG_DEFAULT_USER_ID: "u-env" }), "u-env")
eq("null falls back to the env", resolveCatalogUserId(null, { CATALOG_DEFAULT_USER_ID: " u-env " }), "u-env")
eq("a blank explicit user falls back to the env", resolveCatalogUserId("   ", { CATALOG_DEFAULT_USER_ID: "u-env" }), "u-env")
throws("neither given: a clear error", () => resolveCatalogUserId(undefined, {}), NO_CATALOG_USER)
throws("both blank: a clear error", () => resolveCatalogUserId("", { CATALOG_DEFAULT_USER_ID: "  " }), NO_CATALOG_USER)
eq("the error says what to do", NO_CATALOG_USER, "No catalog user: pass userId explicitly or set CATALOG_DEFAULT_USER_ID")

console.log(`resolve-user: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
