/* Run: npx -y tsx@4.23.15 lib/catalog/local-scan.assert.ts */
import { envValuesOf, leakedEnvNames, parseLocalScanArgs, summarizeScan, summaryLines } from "./local-scan"
import type { ScanResult } from "./types"

let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got:  ${a}\n  want: ${b}`) } }

// ---- arguments ----
eq("folder and output", parseLocalScanArgs(["/repo", "/tmp/out.json"]), { ok: true, folder: "/repo", out: "/tmp/out.json", skip: [] })
eq("skip list, trimmed, slashes normalised", parseLocalScanArgs(["/repo", "out.json", "--skip", "apps/idea-incubator/, lib/old"]), { ok: true, folder: "/repo", out: "out.json", skip: ["apps/idea-incubator", "lib/old"] })
eq("missing output is refused", parseLocalScanArgs(["/repo"]).ok, false)
eq("no arguments is refused", parseLocalScanArgs([]).ok, false)
eq("an unknown flag is refused", parseLocalScanArgs(["/repo", "o.json", "--write-db"]), { ok: false, error: "Unknown option --write-db" })
eq("--skip without a value is refused", parseLocalScanArgs(["/repo", "o.json", "--skip"]), { ok: false, error: "--skip needs a comma-separated list of folders" })
eq("a skip that climbs out is refused", parseLocalScanArgs(["/repo", "o.json", "--skip", "../x"]), { ok: false, error: "--skip takes folders inside the scanned folder: ../x" })

// ---- summary ----
const result: ScanResult = {
  scanned_files: ["a.ts", "b.ts", "c.sql"],
  scan_type: "full",
  detected_surfaces: [
    { canonical_id: "db:t", kind: "db_table", location: {}, signature: {} },
    { canonical_id: "db:t.id", kind: "db_column", location: {}, signature: {} },
    { canonical_id: "db:t.id", kind: "db_column", location: {}, signature: {} },
    { canonical_id: "route:GET /api/x", kind: "api_route", location: {}, signature: {} },
  ],
  detected_dependencies: [
    { from_canonical_id: "route:GET /api/x", to_canonical_id: "db:t", kind: "reads_from" },
    { from_canonical_id: "route:GET /api/x", to_canonical_id: "db:gone", kind: "writes_to" },
    { from_canonical_id: "route:GET /api/x", to_canonical_id: "db:t", kind: "reads_from" },
  ],
  warnings: ["w1"],
  duration_ms: 12,
}
const s = summarizeScan(result)
eq("files", s.files, 3)
eq("surfaces counted as found", s.surfaces, 4)
eq("distinct surfaces", s.distinctSurfaces, 3)
eq("by kind, most first then by name", s.surfacesByKind, [["db_column", 2], ["api_route", 1], ["db_table", 1]])
eq("repeated ids named once each with their count", s.repeatedIds, [["db:t.id", 2]])
eq("edges by kind", s.edgesByKind, [["reads_from", 2], ["writes_to", 1]])
eq("distinct edges", s.distinctEdges, 2)
eq("edges whose two ends were both found", s.edgesWithBothEnds, 1)
eq("warnings", s.warnings, 1)
eq("summary lines", summaryLines(s), [
  "Files scanned: 3",
  "Surfaces: 4 found, 3 distinct",
  "  db_column: 2",
  "  api_route: 1",
  "  db_table: 1",
  "Repeated ids: 1 (only the first of each would be saved)",
  "  db:t.id x2",
  "Edges: 3 found, 2 distinct, 1 with both ends found",
  "  reads_from: 2",
  "  writes_to: 1",
  "Warnings: 1",
])
const empty = summarizeScan({ ...result, scanned_files: [], detected_surfaces: [], detected_dependencies: [], warnings: [] })
eq("nothing found reads plainly", summaryLines(empty), ["Files scanned: 0", "Surfaces: 0 found, 0 distinct", "Edges: 0 found, 0 distinct, 0 with both ends found", "Warnings: 0"])

// ---- no env value in the output ----
// Made-up values, joined from halves so no key-shaped literal sits in this file (the repo's secret scan reads it too).
const fakeKey = "sk_" + "live_" + "abcdef123456"
const fakeHook = "whsec" + "_zyxwvu987654"
const envText = [
  "# comment",
  "DATABASE_URL=postgres://user:hunter2hunter2@host/db",
  `QUOTED="${fakeKey}"`,
  `SINGLE='${fakeHook}' # trailing note`,
  "export EXPORTED=exported-value-1",
  "SHORT=abc",
  "EMPTY=",
  "not a line",
].join("\r\n")
eq("values long enough to be told apart, with their names", envValuesOf(envText), [
  { name: "DATABASE_URL", value: "postgres://user:hunter2hunter2@host/db" },
  { name: "QUOTED", value: fakeKey },
  { name: "SINGLE", value: fakeHook },
  { name: "EXPORTED", value: "exported-value-1" },
])
const values = envValuesOf(envText)
eq("a clean result leaks nothing", leakedEnvNames(JSON.stringify({ canonical_id: "env:DATABASE_URL", signature: { has_default: true } }), values), [])
eq("a value in the output is caught, by name only", leakedEnvNames(JSON.stringify({ a: `x ${fakeKey} y`, b: fakeHook }), values), ["QUOTED", "SINGLE"])
eq("a value hidden by JSON escaping is still caught", leakedEnvNames(JSON.stringify({ a: 'say "hello" there' }), [{ name: "Q", value: 'say "hello" there' }]), ["Q"])

console.log(`local-scan: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
