/* Run: npx -y tsx@4.23.15 lib/redis-key.assert.ts */
import { scopedKey } from "./redis-key"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, what: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.log(`FAIL ${what}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`) }
}

eq(scopedKey("ai:messages:abc", "production"), "ai:messages:abc", "production keys are unchanged, so its cache survives the change")
eq(scopedKey("ai:messages:abc", "preview"), "preview:ai:messages:abc", "staging and previews write their own keys")
eq(scopedKey("ai:messages:abc", "development"), "development:ai:messages:abc", "a local run with vercel env writes its own")
eq(scopedKey("ai:messages:abc", undefined), "local:ai:messages:abc", "no environment at all is never production")
eq(scopedKey("ai:session:v1", "preview") === scopedKey("ai:session:v1", "production"), false, "the same id in two environments is two keys")
eq(scopedKey("k", "pre:view"), "preview:k", "an odd environment name cannot inject a separator")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
