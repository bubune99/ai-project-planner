// npx -y tsx@4.23.15 lib/design/tokens.assert.ts
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { readTokens, undeclaredTokens } from "./tokens"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }

const sample = `
/* a comment with --opx-fake: red; in it */
:root {
  --opx-bg: #f0f0f0;
  --opx-ink:   #20355b ;
  /* --opx-commented: #000; */
  --opx-band: linear-gradient(180deg, #dde4ee, #e9edf2 70%);
  --opx-r: 26px;
  --j-bg: var(--opx-bg);
  color: red;
}
.dark {
  --opx-bg: #262626;
  --opx-ink: #e8ecf2;
  --j-idea: #e0b44a;
  color-scheme: dark;
}
:root, .dark { --opx-ring: var(--opx-ink); }
.opx-card { --opx-pad: 12px; background: var(--opx-card); color: var(--opx-ink); }
.dark .opx-card { --opx-pad: 14px; }
@media (max-width: 700px) { :root { --opx-r: 18px; } .opx-card { border-radius: var(--opx-r); outline-color: var(--opx-ghost, #000); } }
`

ok("the tokens are read into one record per theme, dark first and the default", () => {
  const t = readTokens(sample)
  assert.equal(t.defaultTheme, "dark")
  assert.deepEqual(Object.keys(t.themes), ["dark", "light"])
  assert.deepEqual(t.themes.light, { "--opx-bg": "#f0f0f0", "--opx-ink": "#20355b", "--opx-band": "linear-gradient(180deg, #dde4ee, #e9edf2 70%)", "--opx-r": "26px", "--opx-ring": "var(--opx-ink)" })
  // Dark is everything light has, with what .dark says in its place.
  assert.deepEqual(t.themes.dark, { "--opx-bg": "#262626", "--opx-ink": "#e8ecf2", "--opx-band": "linear-gradient(180deg, #dde4ee, #e9edf2 70%)", "--opx-r": "26px", "--opx-ring": "var(--opx-ink)" })
  assert.deepEqual(t.differ, ["--opx-bg", "--opx-ink"])
})

ok("only this system's tokens are read: not comments, not other names, not ordinary properties", () => {
  const all = Object.keys(readTokens(sample).themes.light)
  assert.ok(!all.includes("--opx-fake") && !all.includes("--opx-commented") && !all.includes("--j-bg") && !all.includes("color"))
  // Another prefix reads another system out of the same text.
  assert.deepEqual(readTokens(sample, { prefix: "--j-" }).themes, { dark: { "--j-bg": "var(--opx-bg)", "--j-idea": "#e0b44a" }, light: { "--j-bg": "var(--opx-bg)" } })
  assert.equal(readTokens(sample, { defaultTheme: "light" }).defaultTheme, "light")
})

ok("a token set on one component or inside a width rule is named, not mixed into the themes", () => {
  const t = readTokens(sample)
  assert.deepEqual(t.elsewhere, ["--opx-pad", "--opx-r"])
  assert.equal(t.themes.light["--opx-r"], "26px")
  assert.equal(t.themes.light["--opx-pad"], undefined)
})

ok("a token that is used but never given a value is found, with how often", () => {
  assert.deepEqual(undeclaredTokens(sample), [{ name: "--opx-card", uses: 1 }, { name: "--opx-ghost", uses: 1 }])
  assert.deepEqual(undeclaredTokens(":root { --opx-a: 1px; } .x { width: var(--opx-a); height: var( --opx-a ); }"), [])
})

ok("text with nothing in it, or cut off halfway, gives an empty record and does not throw", () => {
  for (const css of ["", "body { color: red; }", ":root { --opx-bg: #fff", "}}}{{{", ":root { --opx-bg: url(\"a;b}\"); --opx-ink: #000; }"]) assert.doesNotThrow(() => readTokens(css), css)
  assert.deepEqual(readTokens("").themes, { dark: {}, light: {} })
  assert.deepEqual(readTokens(":root { --opx-bg: #fff").themes.light, { "--opx-bg": "#fff" })
  // A semicolon or a brace inside quotes or brackets is part of the value.
  assert.deepEqual(readTokens(":root { --opx-bg: url(\"a;b}\"); --opx-ink: #000; }").themes.light, { "--opx-bg": "url(\"a;b}\")", "--opx-ink": "#000" })
})

// The real file. Nothing here pins a color: the owner changes those. It checks that the reader loses nothing.
const css = readFileSync(new URL("../../app/opx-skin.css", import.meta.url), "utf8").replace(/\r/g, "")
const real = readTokens(css)

ok("the planner's own skin: every --opx- token in the file is in the record, in both themes", () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const declared = [...new Set([...bare.matchAll(/(?:^|[{;\s])(--opx-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))].sort()
  assert.ok(declared.length >= 18, `found ${declared.length}`)
  assert.deepEqual([...new Set([...Object.keys(real.themes.light), ...real.elsewhere])].sort(), declared)
  assert.deepEqual(Object.keys(real.themes.dark).sort(), Object.keys(real.themes.light).sort())
  for (const theme of ["dark", "light"] as const) for (const [name, value] of Object.entries(real.themes[theme])) {
    assert.ok(value.length > 0 && !/[;{}]/.test(value) && value === value.trim(), `${theme} ${name}: "${value}"`)
  }
})

ok("the planner's own skin: the surfaces and the ink change with the theme, the corners do not", () => {
  for (const name of ["--opx-bg", "--opx-card", "--opx-soft", "--opx-ink", "--opx-muted", "--opx-line"]) {
    assert.ok(real.differ.includes(name), `${name} differs by theme`)
    assert.notEqual(real.themes.dark[name], real.themes.light[name])
  }
  for (const name of ["--opx-r", "--opx-r-md", "--opx-r-sm"]) {
    assert.ok(!real.differ.includes(name), name)
    assert.match(real.themes.dark[name], /^\d+px$/)
  }
  assert.deepEqual(real.differ, Object.keys(real.themes.light).filter((k) => real.themes.light[k] !== real.themes.dark[k]))
})

ok("the planner's own skin: whatever is reported as used but never set truly has no value in the file", () => {
  for (const u of undeclaredTokens(css)) {
    assert.ok(u.uses > 0)
    assert.ok(!new RegExp(`${u.name}\\s*:`).test(css), `${u.name} is declared after all`)
    assert.equal(real.themes.light[u.name], undefined)
  }
})

console.log(`\n${n} checks passed`)
console.log(`${Object.keys(real.themes.light).length} tokens, ${real.differ.length} differ by theme, default ${real.defaultTheme}; set elsewhere: ${real.elsewhere.join(", ") || "none"}; used but never set: ${undeclaredTokens(css).map((u) => `${u.name} (${u.uses})`).join(", ") || "none"}`)
