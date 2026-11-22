/*
 * Offline catalog scan: run the catalog scanner over a folder and write what
 * it finds to a JSON file. No database, no network: it only reads files under
 * the folder and writes the one result file. Saving a result to the catalog
 * is a separate step.
 *
 *   npx -y tsx@4.23.15 scripts/catalog-scan-local.ts <folder> <result.json> [--skip folder,folder]
 *
 * node_modules, .next, .git and the other build folders are always skipped;
 * --skip adds more (for example apps/idea-incubator).
 *
 * The result holds env var NAMES only. Before the file is written, every
 * value set in the folder's .env* files is searched for in the result; if one
 * is found the script stops, names the variable (never the value) and writes
 * nothing.
 */

import * as fs from "fs"
import * as path from "path"
import { scanPaths } from "../lib/catalog/scan"
import {
  LOCAL_SCAN_USAGE,
  envValuesOf,
  leakedEnvNames,
  parseLocalScanArgs,
  summarizeScan,
  summaryLines,
  type EnvValue,
} from "../lib/catalog/local-scan"

async function main(): Promise<number> {
  const args = parseLocalScanArgs(process.argv.slice(2))
  if (!args.ok) {
    console.error(args.error)
    if (args.error !== LOCAL_SCAN_USAGE) console.error(LOCAL_SCAN_USAGE)
    return 2
  }

  const folder = path.resolve(args.folder)
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error(`Not a folder: ${folder}`)
    return 2
  }
  const out = path.resolve(args.out)
  if (!fs.existsSync(path.dirname(out))) {
    console.error(`The result file's folder does not exist: ${path.dirname(out)}`)
    return 2
  }

  const result = await scanPaths({ projectRoot: folder, skipDirs: args.skip })
  const summary = summarizeScan(result)
  const serialized = JSON.stringify({ project_root: folder, skipped: args.skip, summary, result }, null, 2)

  // Names only: no value from an env file may be in what is written.
  const values: EnvValue[] = []
  for (const rel of result.scanned_files) {
    if (!/^\.env(\..+)?$/.test(rel)) continue
    try {
      values.push(...envValuesOf(fs.readFileSync(path.join(folder, rel), "utf8")))
    } catch (e) {
      console.error(`Could not read ${rel} to check for leaked values: ${e instanceof Error ? e.message : String(e)}`)
      return 1
    }
  }
  const leaked = leakedEnvNames(serialized, values)
  if (leaked.length > 0) {
    console.error(`Stopped: the result contains the value of ${leaked.join(", ")}. Nothing was written.`)
    return 1
  }

  fs.writeFileSync(out, serialized + "\n", "utf8")

  console.log(`Scanned ${folder} in ${result.duration_ms} ms`)
  for (const line of summaryLines(summary)) console.log(line)
  console.log(`Env values checked: ${values.length}, none in the result`)
  console.log(`Result written to ${out}`)
  return 0
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Scan failed: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  },
)
