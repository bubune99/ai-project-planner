"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/navigation"
import { Icon } from "@/components/jarvis/icons"

interface LibraryCount {
  active: number
  draft: number
  deprecated: number
  total: number
}

interface LibraryOverview {
  skills: LibraryCount
  templates: LibraryCount
  protocols: LibraryCount
}

const EMPTY: LibraryCount = { active: 0, draft: 0, deprecated: 0, total: 0 }

export default function LibraryPage() {
  const [overview, setOverview] = useState<LibraryOverview>({
    skills: EMPTY,
    templates: EMPTY,
    protocols: EMPTY,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [sRes, tRes, pRes] = await Promise.all([
          fetch("/api/skills"),
          fetch("/api/feature-templates"),
          fetch("/api/protocols"),
        ])
        const [sJson, tJson, pJson] = await Promise.all([
          sRes.json().catch(() => null),
          tRes.json().catch(() => null),
          pRes.json().catch(() => null),
        ])
        if (cancelled) return
        setOverview({
          skills:    sJson?.meta?.counts || EMPTY,
          templates: tJson?.meta?.counts || EMPTY,
          protocols: pJson?.meta?.counts || EMPTY,
        })
      } catch { /* best-effort */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const cards: {
    title: string
    description: string
    href: string
    counts: LibraryCount
    icon: React.ReactNode
    accentClass: string
  }[] = [
    {
      title: "Skills",
      description: "Atomic capability definitions — the building blocks of every feature template.",
      href: "/library/skills",
      counts: overview.skills,
      accentClass: "j-proj",
      icon: <Icon name="bolt" size={20} />,
    },
    {
      title: "Templates",
      description: "Reusable feature blueprints that compose skills into step-by-step work plans.",
      href: "/library/templates",
      counts: overview.templates,
      accentClass: "j-pos",
      icon: <Icon name="layers" size={20} />,
    },
    {
      title: "Protocols",
      description: "Sequenced enforcement rules that fire at key trigger events to keep work safe.",
      href: "/library/protocols",
      counts: overview.protocols,
      accentClass: "j-warn",
      icon: <Icon name="shield" size={20} />,
    },
  ]

  return (
    <DashboardLayout>
      <div className="j-content">
        {/* Header */}
        <div className="j-col" style={{ gap: 4 }}>
          <div className="j-row" style={{ gap: 10 }}>
            <Icon name="library" size={20} />
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Library</h1>
          </div>
          <p className="j-card-sub" style={{ fontSize: 13 }}>
            Managed knowledge base — skills, feature templates, and protocols that power your work orders.
          </p>
        </div>

        {/* Summary stats */}
        {!loading && (
          <div className="j-row j-wrap" style={{ gap: 8 }}>
            <span className="j-tab" style={{ cursor: "default" }}>
              Skills <b style={{ marginLeft: 6 }}>{overview.skills.total}</b>
            </span>
            <span className="j-tab" style={{ cursor: "default" }}>
              Templates <b style={{ marginLeft: 6 }}>{overview.templates.total}</b>
            </span>
            <span className="j-tab" style={{ cursor: "default" }}>
              Protocols <b style={{ marginLeft: 6 }}>{overview.protocols.total}</b>
            </span>
          </div>
        )}

        {/* Entity cards */}
        <div className="j-grid j-cols-3" style={{ gap: 14 }}>
          {cards.map(card => (
            <Link
              key={card.href}
              href={card.href}
              style={{ textDecoration: "none" }}
            >
              <div
                className="j-card"
                style={{ height: "100%", cursor: "pointer", transition: "box-shadow .15s" }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 0 0 1px var(--j-accent), 0 2px 12px oklch(0 0 0 / 0.3)"
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow = ""
                }}
              >
                <div className="j-col" style={{ gap: 10, height: "100%" }}>
                  {/* Icon + title */}
                  <div className="j-row" style={{ gap: 10 }}>
                    <span className={`j-pill ${card.accentClass}`} style={{ padding: "6px 8px" }}>
                      {card.icon}
                    </span>
                    <p className="j-card-title" style={{ fontSize: 15 }}>{card.title}</p>
                  </div>

                  <p className="j-card-sub" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                    {card.description}
                  </p>

                  {/* Count row */}
                  <div className="j-row j-wrap" style={{ gap: 6, marginTop: "auto", paddingTop: 8 }}>
                    {loading ? (
                      <span className="j-muted" style={{ fontSize: 12 }}>Loading…</span>
                    ) : (
                      <>
                        <span className="j-pill j-pos" style={{ fontSize: 11 }}>
                          {card.counts.active} active
                        </span>
                        {card.counts.draft > 0 && (
                          <span className="j-pill j-warn" style={{ fontSize: 11 }}>
                            {card.counts.draft} draft
                          </span>
                        )}
                        {card.counts.deprecated > 0 && (
                          <span className="j-pill j-muted" style={{ fontSize: 11 }}>
                            {card.counts.deprecated} deprecated
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="j-row" style={{ gap: 6, color: "var(--j-accent)", fontSize: 12.5 }}>
                    <span>Open {card.title}</span>
                    <Icon name="arrow" size={12} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}
