/* Run: npx -y tsx@4.23.15 lib/rich-text.assert.ts */
import { prepareRichText, refLabel } from "./rich-text"
let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got:  ${a}\n  want: ${b}`) } }

eq("single newline becomes a paragraph break", prepareRichText("One thought.\nAnother."), "One thought.\n\nAnother.")
eq("existing paragraph break untouched", prepareRichText("A\n\nB"), "A\n\nB")
eq("CRLF normalised", prepareRichText("A\r\nB"), "A\n\nB")
eq("list items stay contiguous", prepareRichText("- a\n- b\n- c"), "- a\n- b\n- c")
eq("ordered list stays contiguous", prepareRichText("1. a\n2. b"), "1. a\n2. b")
eq("text then list gets a separating blank line", prepareRichText("Steps:\n- a\n- b"), "Steps:\n\n- a\n- b")
eq("table rows stay contiguous", prepareRichText("| a | b |\n|---|---|\n| 1 | 2 |"), "| a | b |\n|---|---|\n| 1 | 2 |")
eq("fenced code untouched", prepareRichText("```\nx = 1\ny = 2\n```"), "```\nx = 1\ny = 2\n```")
eq("text after code fence split, fence closed off cleanly", prepareRichText("```\nx\n```\nA\nB"), "```\nx\n```\n\nA\n\nB")

eq("id + title ref", prepareRichText("See [[dae457ea browser relay decision layer]]."), "See [browser relay decision layer](#ref:dae457ea).")
eq("slug ref", prepareRichText("[[farxplor-policy-manifest-contract]]"), "[farxplor policy manifest contract](#ref:farxplor-policy-manifest-contract)")
eq("bare id ref", prepareRichText("[[dae457ea]]"), "[dae457ea](#ref:dae457ea)")
eq("two refs on a line", prepareRichText("[[a1b2c3d4 one]] and [[b33a4700 two]]"), "[one](#ref:a1b2c3d4) and [two](#ref:b33a4700)")
eq("unclosed brackets left alone", prepareRichText("[[not closed"), "[[not closed")
eq("refLabel id+title", refLabel("dae457ea browser relay"), { token: "dae457ea", label: "browser relay" })
eq("refLabel non-hex first word is a slug", refLabel("hello world"), { token: "hello world", label: "hello world" })

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1)
