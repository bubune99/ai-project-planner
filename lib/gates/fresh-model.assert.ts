// npx -y tsx@4.23.15 lib/gates/fresh-model.assert.ts
import assert from "node:assert/strict"
import { ShipError, freshness, parseShip, routeCovers, routeOfFile, shipTouches, staleCount, type Ship } from "./fresh-model"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }

t("a page file gives its route; groups and api do not appear", () => {
  assert.equal(routeOfFile("app/todos/page.tsx"), "/todos")
  assert.equal(routeOfFile("app/page.tsx"), "/")
  assert.equal(routeOfFile("app/project/[id]/page.tsx"), "/project/[id]")
  assert.equal(routeOfFile("src/app/(app)/settings/page.tsx"), "/settings")
  assert.equal(routeOfFile("app/api/push/test/route.ts"), null)
  assert.equal(routeOfFile("components/x.tsx"), null)
})

t("with imports resolved by the sender, a component marks only the pages it was sent with", () => {
  const p = parseShip({ sha: "f2b658d6", env: "production", reach: "imports", routes: ["/project/[id]"], everywhere: false, files: ["components/board/card.tsx", "lib/mcp/x.ts"] })
  assert.deepEqual([p.routes, p.everywhere], [["/project/[id]"], false])
  const none = parseShip({ sha: "f2b658d6", env: "production", reach: "imports", routes: [], everywhere: false, files: ["lib/mcp/resolve-step-id.ts"] })
  assert.deepEqual([none.routes, none.everywhere], [[], false]) // an MCP-only change reaches no page
  // styles, assets and named shared files still count as every page; so does the sender saying so
  assert.equal(parseShip({ sha: "f2b658d6", env: "staging", reach: "imports", routes: [], files: ["app/globals.css"] }).everywhere, true)
  assert.equal(parseShip({ sha: "f2b658d6", env: "staging", reach: "imports", routes: ["/"], everywhere: true, files: ["components/nav.tsx"] }).everywhere, true)
  // an older sender (no reach) keeps the old rule
  assert.equal(parseShip({ sha: "f2b658d6", env: "staging", files: ["components/board/card.tsx"] }).everywhere, true)
})

t("what a ship touches: named pages, or everywhere for anything shared", () => {
  assert.deepEqual(shipTouches(["app/todos/page.tsx", "docs/a.md", "lib/x.assert.ts"]), { routes: ["/todos"], everywhere: false })
  assert.equal(shipTouches(["app/opx-skin.css"]).everywhere, true)
  assert.equal(shipTouches(["components/settings/NotificationsTab.tsx"]).everywhere, true) // cannot name its pages from here
  assert.equal(shipTouches(["app/layout.tsx"]).everywhere, true)
  assert.deepEqual(shipTouches(["app/api/push/subscribe/route.ts", "lib/db/migrations/070.sql", "README.md"]), { routes: [], everywhere: false })
})

t("a ship's route covers the same page and its dynamic forms only", () => {
  assert.ok(routeCovers("/todos", "/todos"))
  assert.ok(routeCovers("/project/[id]", "/project/abc-123"))
  assert.ok(routeCovers("/settings", "/settings?tab=notifications"))
  assert.ok(!routeCovers("/project/[id]", "/projects"))
  assert.ok(!routeCovers("/todos", "/todos/1"))
})

const ship = (at: string, routes: string[], everywhere = false): Ship => ({ sha: "abc1234", env: "production", routes, everywhere, at })

t("behind when a ship touched the page after the picture; counts and dates them", () => {
  const f = freshness({ capturedAt: "2026-11-13T12:00:00Z", route: "/todos", projectReports: true, ships: [ship("2026-11-12T00:00:00Z", ["/todos"]), ship("2026-11-14T10:00:00Z", ["/todos"]), ship("2026-11-14T22:00:00Z", [], true), ship("2026-11-14T23:00:00Z", ["/ideas"])] })
  assert.equal(f.state, "behind"); assert.equal(f.behindBy, 2); assert.equal(f.since, "2026-11-14T10:00:00Z")
  assert.match(f.line, /^Out of date: taken Nov 13, and 2 changes have shipped on this page/)
  const one = freshness({ capturedAt: "2026-11-13T12:00:00Z", route: "/todos", projectReports: true, ships: [ship("2026-11-14T10:00:00Z", ["/todos"])] })
  assert.match(one.line, /1 change has shipped on this page since \(Nov 14\)\./)
})

t("current only when the project reports ships and none touched the page since", () => {
  const ships = [ship("2026-11-12T00:00:00Z", ["/todos"]), ship("2026-11-14T10:00:00Z", ["/ideas"])]
  assert.equal(freshness({ capturedAt: "2026-11-13T12:00:00Z", route: "/todos", projectReports: true, ships }).state, "current")
})

t("never claims current without reports, or without a picture", () => {
  const u = freshness({ capturedAt: "2026-11-13T12:00:00Z", route: "/todos", projectReports: false, ships: [] })
  assert.equal(u.state, "unknown"); assert.match(u.line, /cannot be confirmed current/)
  assert.equal(freshness({ capturedAt: null, route: "/todos", projectReports: true, ships: [] }).state, "unknown")
})

t("the project line says who deals with it", () => {
  const mk = (state: "current" | "behind" | "unknown") => ({ state, behindBy: 0, since: null, line: "" })
  assert.match(staleCount([mk("behind"), mk("current"), mk("behind")]).line, /^2 of 3 pages have pictures older than what is live\. An agent rescans them; nothing here needs you\.$/)
  assert.match(staleCount([mk("current")]).line, /^All 1 page is pictured as live\.$/)
  assert.equal(staleCount([]).line, "")
})

t("a ship report is cleaned, and a bad one is refused with the reason", () => {
  const p = parseShip({ sha: "58C8E5B", env: "production", files: ["app/todos/page.tsx", "app/opx-skin.css"], at: "2026-11-14T22:00:00Z" })
  assert.deepEqual([p.sha, p.env, p.routes, p.everywhere, p.files], ["58c8e5b", "production", ["/todos"], true, 2])
  assert.throws(() => parseShip({ sha: "nope", env: "production", files: [] }), ShipError)
  assert.throws(() => parseShip({ sha: "58c8e5b", env: "preview", files: [] }), ShipError)
  assert.throws(() => parseShip({ sha: "58c8e5b", env: "staging" }), ShipError)
  assert.equal(parseShip({ sha: "58c8e5b", env: "staging", everywhere: true }).everywhere, true)
})

t("a report on the page makes it behind too, and says so", () => {
  const f = freshness({ capturedAt: "2026-11-13T12:00:00Z", route: "/sops", projectReports: true, ships: [
    { sha: "report:1", env: "report", routes: ["/sops"], everywhere: false, at: "2026-11-15T12:00:00Z" },
    { sha: "abc", env: "production", routes: ["/sops"], everywhere: false, at: "2026-11-14T12:00:00Z" },
  ] })
  assert.equal(f.state, "behind")
  assert.equal(f.behindBy, 2)
  assert.match(f.line, /1 change has shipped and 1 report was made on this page since \(Nov 14 to Nov 15\)\./)
})

console.log(`\n${n} fresh-model checks passed`)
