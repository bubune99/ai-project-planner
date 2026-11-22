"use client"

/*
 * Launch tab: is this project ready to launch? A checklist from the readiness
 * catalog, arranged by gate and then by domain. Health, the current gate and
 * every count are worked out on the server (lib/readiness/model) and read from
 * GET /api/projects/[id]/readiness; nothing here sets them. With no launch
 * profile yet, the tab explains itself and asks for one. Display only: the
 * words, the grouping and what still needs doing come from lib/readiness/view.
 */

import { useMemo, useState } from "react"
import type { Profile, Readiness } from "@/lib/readiness/model"
import { ADVICE_LINE, DOMAIN_WORD, LAUNCH_TYPE_WORD, TRAIT_WORD, countsLine, gateLine, groupItems, healthWords, todoCount, type HistoryRow, type Show } from "@/lib/readiness/view"
import { Failed, Loading, Section, Seg, unwrap, useJson } from "./shared"
import { LaunchItem } from "./LaunchItem"
import { LaunchProfileForm } from "./LaunchProfileForm"

interface Data { profile: Profile | null; readiness: Readiness | null; history?: HistoryRow[] }

const word = (map: Record<string, string>, key: string) => map[key] ?? key

function profileLine(p: Profile): string {
  const parts = [
    word(LAUNCH_TYPE_WORD, p.launchType),
    `Regions: ${p.regions.length ? p.regions.join(", ") : "–"}`,
    `Traits: ${p.traits.length ? p.traits.map((t) => word(TRAIT_WORD, t)).join(", ") : "none"}`,
  ]
  if (p.domain) parts.push(`Domain: ${p.domain}`)
  if (p.siteUrl) parts.push(`Site: ${p.siteUrl}`)
  return parts.join(" · ")
}

export function LaunchTab({ projectId }: { projectId: string }) {
  const { data: raw, loading, error, reload } = useJson(`/api/projects/${projectId}/readiness`)
  const [editing, setEditing] = useState(false)
  const [show, setShow] = useState<Show>("todo")
  const data = raw ? unwrap<Data>(raw) : null
  const readiness = data?.readiness ?? null
  const groups = useMemo(() => (readiness ? groupItems(readiness.validations, readiness.gates, show) : []), [readiness, show])
  /** The project's latest changes, by item, newest first: enough to offer "Put back" on an item just decided. */
  const recent = useMemo(() => {
    const by = new Map<string, HistoryRow[]>()
    for (const h of data?.history ?? []) by.set(h.item_id, [...(by.get(h.item_id) ?? []), h])
    return by
  }, [data?.history])

  if (loading && !data) return <Loading what="launch readiness" />
  if (error && !data) return <Failed what="launch readiness" error={error} retry={reload} />
  if (!data) return null

  const saved = () => { setEditing(false); reload() }

  if (!data.profile || !readiness) {
    return (
      <div className="opx-col" style={{ gap: 12 }}>
        <Section title="Launch readiness">
          <p className="opx-ck-meta">
            Launch readiness is a checklist of what this project needs before it goes live and after: code, business and legal items, arranged in gates
            from the foundation to after launch. Each item is not started, proposed, passed, failed or waived. Agents and scanners record checks: an
            agent can pass a code item on a check's result and can only propose the rest. You pass, fail or waive. Health and the current gate are worked out from the items and are never set by hand.
          </p>
          <p className="opx-ck-meta opx-muted">This project has no launch profile yet. Set one below to see the items that apply to it.</p>
          <p className="opx-ck-meta opx-muted">{ADVICE_LINE}</p>
        </Section>
        <LaunchProfileForm projectId={projectId} initial={null} onSaved={saved} />
      </div>
    )
  }

  if (editing) return <LaunchProfileForm projectId={projectId} initial={data.profile} onSaved={saved} onCancel={() => setEditing(false)} />

  const health = healthWords(readiness)
  const total = readiness.validations.length
  const todo = todoCount(readiness.validations)

  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <section className="opx-sec opx-ck-head" aria-label="Launch readiness">
        <div className="opx-pf-head">
          <h3 className="opx-row"><i className={`opx-pf-dot ${health.tone}`} aria-hidden />{health.head}</h3>
          <div className="opx-row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="opx-btn" onClick={() => setEditing(true)}>Change the launch profile</button>
            <a className="opx-btn" href={`/api/projects/${projectId}/readiness/export`} download>Export as Markdown</a>
          </div>
        </div>
        <p className="opx-ck-meta">Current gate: <b>{health.gate}</b> · {health.cleared}</p>
        <p className="opx-ck-meta opx-muted">{countsLine(readiness.counts)}</p>
        <p className="opx-ck-meta opx-muted">{profileLine(data.profile)}</p>
        <p className="opx-ck-meta opx-muted">{ADVICE_LINE}</p>
        {error && <p role="alert" className="opx-ch-need">Couldn't refresh: {error} <button type="button" className="opx-btn sm" onClick={reload}>Try again</button></p>}
      </section>

      <section className="opx-sec opx-ch-top">
        <Seg value={show} label="Which items" options={[["todo", `Still to do (${todo})`], ["all", `All that apply (${total})`]]} onChange={setShow} />
        <span className="opx-muted">Still to do is everything not passed and not waived.</span>
      </section>

      {total === 0 ? (
        <div className="opx-empty">No catalog item applies to this launch profile. Change the launch profile if that is not right.</div>
      ) : groups.map((g) => (
        <Section key={g.gate.gate} title={`Gate ${g.gate.gate} · ${g.gate.name}`} count={g.gate.gate === readiness.currentGate ? "Current gate" : undefined}>
          <p className="opx-ck-meta opx-muted">{gateLine(g.gate)}</p>
          {g.shown === 0 ? <p className="opx-ck-meta">Nothing is left to do at this gate.</p> : (
            <div className="opx-dp" style={{ marginTop: 12 }}>
              {g.domains.map((d) => (
                <div key={d.domain}>
                  <h3 className="opx-pf-h">{DOMAIN_WORD[d.domain]} <span className="opx-n">{d.done} of {d.total} passed or waived</span></h3>
                  <ul className="opx-dir-list">
                    {d.items.map((v) => <LaunchItem key={v.item.id} projectId={projectId} v={v} recent={recent.get(v.item.id) ?? []} onChanged={reload} />)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>
      ))}

      {readiness.openItems.length > 0 && (
        <Section title="Verify before relying on these" count={readiness.openItems.length}>
          <p className="opx-ck-meta opx-muted">Open questions the catalog carries, as written there.</p>
          <ul className="opx-dir-list">
            {readiness.openItems.map((o) => (
              <li key={o.id} className="opx-dir-item">
                <div className="opx-dir-head"><b>{o.item}</b></div>
                <p>{o.why}</p>
                <p className="opx-muted opx-dir-small">Resolve with: {o.resolveWith}{o.blocks?.length ? ` · Blocks: ${o.blocks.join(", ")}` : ""}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
