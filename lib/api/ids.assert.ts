/**
 * Run: npx -y tsx@4.23.15 lib/api/ids.assert.ts
 */
import { isUuid, notAnId } from "./ids"

let failed = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}

eq("an id as the database writes it", isUuid("255d189c-3f0e-4a51-9c1e-0d2b6f7a8e90"), true)
eq("capital letters are the same id", isUuid("255D189C-3F0E-4A51-9C1E-0D2B6F7A8E90"), true)
eq("the all-zero id is still shaped like one", isUuid("00000000-0000-0000-0000-000000000000"), true)
eq("the word seen on production", isUuid("not-a-uuid"), false)
eq("the short form shown on cards", isUuid("255d189c"), false)
eq("nothing", isUuid(""), false)
eq("no dashes", isUuid("255d189c3f0e4a519c1e0d2b6f7a8e90"), false)
eq("one character short", isUuid("255d189c-3f0e-4a51-9c1e-0d2b6f7a8e9"), false)
eq("one character over", isUuid("255d189c-3f0e-4a51-9c1e-0d2b6f7a8e901"), false)
eq("a letter that is not hex", isUuid("255d189g-3f0e-4a51-9c1e-0d2b6f7a8e90"), false)
eq("space around it", isUuid(" 255d189c-3f0e-4a51-9c1e-0d2b6f7a8e90"), false)
eq("a second line after it", isUuid("255d189c-3f0e-4a51-9c1e-0d2b6f7a8e90\nx"), false)
eq("SQL after it", isUuid("255d189c-3f0e-4a51-9c1e-0d2b6f7a8e90' OR 1=1"), false)
eq("braces around it", isUuid("{255d189c-3f0e-4a51-9c1e-0d2b6f7a8e90}"), false)
eq("undefined", isUuid(undefined), false)
eq("null", isUuid(null), false)
eq("a number", isUuid(255), false)
eq("a list holding one", isUuid(["255d189c-3f0e-4a51-9c1e-0d2b6f7a8e90"]), false)
eq("the sentence for a malformed id in a body or a query names the field", notAnId("dependsOnId"), "dependsOnId is not a valid id")

console.log(failed ? `\n${failed} FAILED` : "\nall passed")
if (failed) process.exit(1)
