"use client"

/**
 * What a project's People and flows still lacks, at the top of the tab: each gap in one line, the agents' first and
 * then what waits on the owner. Rules in lib/people/gaps.ts; read from /api/projects/[id]/people/gaps.
 * Owner, 2026-11-24: People and flows was half filled on two projects and nothing said so.
 */
import { useEffect, useState } from "react"
import { Failed, Loading, useJson } from "./shared"
import type { Gap } from "@/lib/people/gaps"

type GapsData = { gaps: Gap[]; summary: { agent: number; owner: number; line: string } }
const SHOWN = 8

export function PeopleGaps({ projectId, version }: { projectId: string; version: number }) {
  const gaps = useJson<GapsData>(`/api/projects/${projectId}/people/gaps`)
  const [all, setAll] = useState(false)
  const { reload } = gaps
  // A save changes what is missing: read it again whenever the document's version moves.
  useEffect(() => { if (version > 0) reload() }, [version, reload])

  if (gaps.loading && !gaps.data) return <Loading what="what is missing" />
  if (gaps.error && !gaps.data) return <Failed what="what is missing" error={gaps.error} retry={gaps.reload} />
  if (!gaps.data) return null
  const { summary } = gaps.data
  const list = [...gaps.data.gaps].sort((a, b) => (a.who === b.who ? 0 : a.who === "agent" ? -1 : 1))
  const shown = all ? list : list.slice(0, SHOWN)
  return (
    <section className="opx-sec opx-pf-gaps" data-testid="people-gaps" aria-label="What is missing">
      <div className="opx-sech"><h2>What is missing</h2><span className="opx-n">{list.length}</span></div>
      <p className="opx-muted" data-testid="people-gaps-line">{summary.line}{summary.agent ? " Agents working on this project cannot finish until theirs are filled." : ""}</p>
      {list.length > 0 && (
        <ul>
          {shown.map((g, i) => (
            <li key={`${g.kind}-${g.where}-${i}`} data-kind={g.kind}>
              <span className={`opx-pf-gap-who ${g.who}`}>{g.who === "owner" ? "Needs you" : "Agents"}</span>
              <span>{g.what}</span>
            </li>
          ))}
        </ul>
      )}
      {list.length > SHOWN && <button type="button" className="opx-btn sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${list.length}`}</button>}
    </section>
  )
}
