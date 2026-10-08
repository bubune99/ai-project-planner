/* Run: npx -y tsx@4.23.15 lib/catalog/confine.assert.ts */
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { confineFiles, resolveAllowedRoot } from "./confine"
import { scanPaths } from "./scan"

let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got:  ${a}\n  want: ${b}`) } }
const throws = (n: string, fn: () => unknown, msg: string) => { let got = "(no throw)"; try { fn() } catch (e: any) { got = e.message } eq(n, got, msg) }

async function main() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "confine-")))
  const root = path.join(base, "app")
  const outside = path.join(base, "outside")
  fs.mkdirSync(path.join(root, "lib"), { recursive: true })
  fs.mkdirSync(outside, { recursive: true })
  fs.writeFileSync(path.join(root, ".env"), "INSIDE_KEY=1\n")
  fs.writeFileSync(path.join(root, "lib", "ok.ts"), "export const ok = 1\n")
  fs.writeFileSync(path.join(outside, ".env.x"), "SECRET_NAME=do-not-read\n")
  fs.symlinkSync(path.join(outside, ".env.x"), path.join(root, ".env.link"))
  fs.symlinkSync(outside, path.join(root, "lib", "escape"))
  fs.symlinkSync(path.join(root, "lib", "ok.ts"), path.join(root, "lib", "alias.ts"))

  // ---- resolveAllowedRoot ----
  eq("default root is the first allowed root", resolveAllowedRoot(undefined, [root]), root)
  eq("the allowed root itself is accepted", resolveAllowedRoot(root, [root]), root)
  eq("a directory inside the allowed root is accepted", resolveAllowedRoot(path.join(root, "lib"), [root]), path.join(root, "lib"))
  throws("a sibling directory is rejected", () => resolveAllowedRoot(outside, [root]), "project_root is outside the allowed scan root")
  throws("`..` out of the root is rejected", () => resolveAllowedRoot(path.join(root, ".."), [root]), "project_root is outside the allowed scan root")
  throws("a symlinked dir escaping the root is rejected", () => resolveAllowedRoot(path.join(root, "lib", "escape"), [root]), "project_root is outside the allowed scan root")
  throws("a relative root is rejected", () => resolveAllowedRoot("app", [root]), "project_root must be an absolute path")
  throws("a missing root is rejected", () => resolveAllowedRoot(path.join(root, "nope"), [root]), "project_root does not exist")
  throws("/ is rejected", () => resolveAllowedRoot("/", [root]), "project_root is outside the allowed scan root")

  // ---- confineFiles ----
  const r = confineFiles(root, [
    ".env", "lib/ok.ts", "lib/alias.ts", "lib/missing.ts",
    ".env./../../outside/.env.x", "lib/../../outside/missing.ts", "../outside/.env.x",
    "/etc/passwd", "C:\\Windows\\win.ini", "lib\\..\\..\\outside\\.env.x",
    ".env.link", "lib/escape/.env.x", "", "lib/a\0b.ts",
  ])
  eq("safe paths accepted (incl. in-tree symlink and not-yet-existing file)", r.accepted, [".env", "lib/ok.ts", "lib/alias.ts", "lib/missing.ts"])
  eq("traversal, absolute, backslash, symlink-escape and NUL paths rejected", r.rejected, [
    ".env./../../outside/.env.x", "lib/../../outside/missing.ts", "../outside/.env.x",
    "/etc/passwd", "C:\\Windows\\win.ini", "lib\\..\\..\\outside\\.env.x",
    ".env.link", "lib/escape/.env.x", "", "lib/a\0b.ts",
  ])

  // ---- scanPaths end to end: the audit's PoC no longer reads outside ----
  const targeted = await scanPaths({ projectRoot: root, files: [".env./../../outside/.env.x", ".env.link", ".env"] })
  const ids = targeted.detected_surfaces.map((s) => s.canonical_id)
  eq("targeted scan never surfaces the outside file's key", ids.some((id) => id.includes("SECRET_NAME")), false)
  eq("targeted scan still reads the in-tree .env", ids.some((id) => id.includes("INSIDE_KEY")), true)
  eq("rejected paths become warnings", targeted.warnings.filter((w) => w.includes("outside the project root")).length, 2)
  eq("scanned_files lists only accepted paths", targeted.scanned_files, [".env"])

  const full = await scanPaths({ projectRoot: root })
  eq("full scan does not follow the escaping symlinks", full.detected_surfaces.some((s) => s.canonical_id.includes("SECRET_NAME")), false)
  eq("full scan never lists a file outside the root", full.scanned_files.every((f) => !f.includes("escape") && f !== ".env.link"), true)

  fs.rmSync(base, { recursive: true, force: true })
  console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1)
}
main()
