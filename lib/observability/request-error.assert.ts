/* Run: npx -y tsx@4.23.15 lib/observability/request-error.assert.ts */
import { cleanPath, errorLine } from "./request-error"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, what: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.log(`FAIL ${what}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`) }
}

eq(cleanPath("/api/projects/abc/steps?token=secret#x"), "/api/projects/abc/steps", "query and fragment are dropped (they may carry tokens)")
eq(cleanPath(""), "/", "an empty path is the root")
const line = JSON.parse(errorLine(Object.assign(new Error("column  alternatives_considered\ndoes not exist"), { digest: "123" }), { path: "/api/projects/p/adrs?x=1", method: "POST" }, { routePath: "/api/projects/[id]/adrs", routeType: "route" }))
eq(line.route, "/api/projects/[id]/adrs", "the route pattern")
eq(line.path, "/api/projects/p/adrs", "the path without its query")
eq(line.method, "POST", "the method")
eq(line.message, "column alternatives_considered does not exist", "the message on one line")
eq(line.digest, "123", "the digest, to match the page's error")
eq(Object.keys(line).includes("headers") || Object.keys(line).includes("body"), false, "no headers or body are ever written")
eq(JSON.parse(errorLine("plain", { path: "/", method: "GET" }, {})).message, "plain", "a thrown string is kept")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
