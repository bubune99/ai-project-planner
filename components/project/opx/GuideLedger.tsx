"use client"

/*
 * One statement's numbers, in words, on its card. Display only: what is counted, and how nothing recorded is told
 * apart from a count, is decided in lib/gates/guide-ledger.ts.
 */

import { ledgerWords, type Ledger } from "@/lib/gates/guide-ledger"
import { fmtDate } from "./shared"

const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
const day = (iso: string) => fmtDate(iso, DAY) || "–"

/** `ledger` is missing while loading and when the numbers could not be loaded; then a dash stands, never a number. */
export function LedgerLines({ ledger, loading, onTrial }: { ledger: Ledger | undefined; loading: boolean; onTrial: boolean }) {
  if (!ledger) return <span className="opx-muted">{loading ? "Loading its numbers…" : "Its numbers: –"}</span>
  const w = ledgerWords(ledger, day)
  return (
    <>
      <span className="opx-muted">{w.wording} {w.checks}</span>
      {onTrial && w.trial && <span className="opx-muted">{w.trial}</span>}
    </>
  )
}
