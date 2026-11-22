/*
 * Rules for the offline catalog scan (scripts/catalog-scan-local.ts).
 *
 * The script runs the scanner over a folder and writes the result to a file:
 * no database, no network. What it decides lives here so it can be checked:
 * how its arguments are read, how a result is counted, and the guard that no
 * value from an env file is in what gets written (names only).
 *
 * Pure: no fs, no clock.
 */

import type { ScanResult } from "./types"

// ---- arguments ----

export type LocalScanArgs =
  | { ok: true; folder: string; out: string; skip: string[] }
  | { ok: false; error: string }

export const LOCAL_SCAN_USAGE =
  "Usage: npx -y tsx@4.23.15 scripts/catalog-scan-local.ts <folder> <result.json> [--skip folder,folder]"

export function parseLocalScanArgs(argv: readonly string[]): LocalScanArgs {
  const positional: string[] = []
  let skip: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--skip") {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, error: "--skip needs a comma-separated list of folders" }
      }
      skip = value.split(",").map((s) => s.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "")).filter(Boolean)
      const outside = skip.find((s) => s.startsWith("/") || s.split("/").includes(".."))
      if (outside) return { ok: false, error: `--skip takes folders inside the scanned folder: ${outside}` }
      i++
    } else if (arg.startsWith("--")) {
      return { ok: false, error: `Unknown option ${arg}` }
    } else {
      positional.push(arg)
    }
  }
  if (positional.length !== 2) return { ok: false, error: LOCAL_SCAN_USAGE }
  return { ok: true, folder: positional[0], out: positional[1], skip }
}

// ---- summary ----

export interface ScanSummary {
  files: number
  surfaces: number
  distinctSurfaces: number
  /** [kind, count], most first, then by name. */
  surfacesByKind: Array<[string, number]>
  /** [canonical id, times found] for ids found more than once: only the first of each can be saved. */
  repeatedIds: Array<[string, number]>
  edges: number
  distinctEdges: number
  /** Distinct edges whose two ends are both among the surfaces found: the ones that can be saved. */
  edgesWithBothEnds: number
  edgesByKind: Array<[string, number]>
  warnings: number
}

function tally(keys: readonly string[]): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

export function summarizeScan(result: ScanResult): ScanSummary {
  const ids = tally(result.detected_surfaces.map((s) => s.canonical_id))
  const known = new Set(ids.map(([id]) => id))
  const edgeKeys = new Map<string, boolean>()
  for (const d of result.detected_dependencies) {
    edgeKeys.set(
      JSON.stringify([d.from_canonical_id, d.to_canonical_id, d.kind]),
      known.has(d.from_canonical_id) && known.has(d.to_canonical_id),
    )
  }
  return {
    files: result.scanned_files.length,
    surfaces: result.detected_surfaces.length,
    distinctSurfaces: ids.length,
    surfacesByKind: tally(result.detected_surfaces.map((s) => s.kind)),
    repeatedIds: ids.filter(([, n]) => n > 1),
    edges: result.detected_dependencies.length,
    distinctEdges: edgeKeys.size,
    edgesWithBothEnds: [...edgeKeys.values()].filter(Boolean).length,
    edgesByKind: tally(result.detected_dependencies.map((d) => d.kind)),
    warnings: result.warnings.length,
  }
}

/** How many repeated ids the printed summary names before saying how many more there are. */
const REPEATED_SHOWN = 20

export function summaryLines(s: ScanSummary): string[] {
  const lines = [`Files scanned: ${s.files}`, `Surfaces: ${s.surfaces} found, ${s.distinctSurfaces} distinct`]
  for (const [kind, n] of s.surfacesByKind) lines.push(`  ${kind}: ${n}`)
  if (s.repeatedIds.length > 0) {
    lines.push(`Repeated ids: ${s.repeatedIds.length} (only the first of each would be saved)`)
    for (const [id, n] of s.repeatedIds.slice(0, REPEATED_SHOWN)) lines.push(`  ${id} x${n}`)
    if (s.repeatedIds.length > REPEATED_SHOWN) lines.push(`  and ${s.repeatedIds.length - REPEATED_SHOWN} more, in the result file`)
  }
  lines.push(`Edges: ${s.edges} found, ${s.distinctEdges} distinct, ${s.edgesWithBothEnds} with both ends found`)
  for (const [kind, n] of s.edgesByKind) lines.push(`  ${kind}: ${n}`)
  lines.push(`Warnings: ${s.warnings}`)
  return lines
}

// ---- no env value in the output ----

export interface EnvValue {
  name: string
  value: string
}

/** Shorter values (true, 3000, dev) cannot be told apart from ordinary text, so they are not searched for. */
const MIN_VALUE_LENGTH = 8

/** The values set in an env file's text, for the leak guard only. Never print or store what this returns. */
export function envValuesOf(envText: string): EnvValue[] {
  const out: EnvValue[] = []
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let value = m[2].trim()
    const quoted = value.match(/^(["'])(.*?)\1/)
    if (quoted) value = quoted[2]
    else value = value.replace(/\s+#.*$/, "").trim()
    if (value.length >= MIN_VALUE_LENGTH) out.push({ name: m[1], value })
  }
  return out
}

/**
 * Names of env vars whose VALUE appears in the serialized result. Must be
 * empty before a result is written anywhere. Returns names only.
 */
export function leakedEnvNames(serialized: string, values: readonly EnvValue[]): string[] {
  const names: string[] = []
  for (const { name, value } of values) {
    const escaped = JSON.stringify(value).slice(1, -1)
    if ((serialized.includes(value) || serialized.includes(escaped)) && !names.includes(name)) names.push(name)
  }
  return names
}
