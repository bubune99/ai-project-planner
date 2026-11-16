"use client"
import { Calendar, CalendarClock, GitBranch, Plug } from "lucide-react"
import { NotificationsTab } from "@/components/settings/NotificationsTab"

import { useState, useEffect, useCallback } from "react"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { toast } from "sonner"

// ─── types ───────────────────────────────────────────────────────────────────

type ApiKey = {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  expiresAt: string | null
  createdAt: string
  lastUsedAt: string | null
  isActive: boolean
}

type Tab = "profile" | "notifications" | "mcp" | "ai" | "appearance" | "integrations" | "data"

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "mcp", label: "MCP Server" },
  { id: "ai", label: "Assistant" },
  { id: "appearance", label: "Appearance" },
  { id: "integrations", label: "Integrations" },
  { id: "data", label: "Data & Export" },
]

/** The MCP address is this planner's own. It used to name faridea.dev, which does not serve the planner. */
const MCP_PATH = "/mcp"

// ─── helpers ─────────────────────────────────────────────────────────────────

function copyText(text: string, label = "Copied") {
  navigator.clipboard.writeText(text).then(() => toast.success(label))
}

function relativeDate(iso: string | null) {
  if (!iso) return "Never"
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--opx-muted)", margin: "0 0 10px", fontWeight: 600 }}>
      {children}
    </p>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // The label wraps its field, so the field is named by it for a screen reader and a press on the words focuses it.
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--opx-muted)", fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  )
}

function Input({ value, onChange, placeholder, readOnly, type = "text" }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={e => onChange?.(e.target.value)}
      style={{
        background: readOnly ? "var(--opx-soft)" : "var(--opx-soft)",
        border: "1px solid var(--j-ring)", borderRadius: 8,
        padding: "8px 12px", color: readOnly ? "var(--opx-muted)" : "var(--opx-ink)",
        fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%",
        cursor: readOnly ? "default" : "text",
      }}
    />
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          readOnly
          value={value}
          style={{
            flex: 1, background: "var(--opx-soft)", border: "1px solid var(--j-ring)",
            borderRadius: 8, padding: "8px 12px", color: "var(--opx-muted)",
            fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
        />
        <button
          className="j-btn j-btn-ghost"
          style={{ flexShrink: 0, fontSize: 12 }}
          onClick={() => copyText(value, `${label} copied`)}
          aria-label={`Copy the ${label.toLowerCase()}`}
        >
          Copy
        </button>
      </div>
    </Field>
  )
}

// ─── tab panels ───────────────────────────────────────────────────────────────

function ProfileTab({ user }: { user: ReturnType<typeof useUser> }) {
  const displayName = user?.displayName ?? ""
  const email = user?.primaryEmail ?? ""

  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <SectionLabel>Account</SectionLabel>
        <div className="j-grid j-cols-2" style={{ gap: 16 }}>
          <Field label="Display name">
            <Input value={displayName} readOnly placeholder="Your name" />
          </Field>
          <Field label="Email">
            <Input value={email} readOnly type="email" />
          </Field>
        </div>
        <p className="j-muted" style={{ fontSize: 12, marginTop: 12, margin: "12px 0 0" }}>
          Account details are managed via your auth provider. Contact support to change your email.
        </p>
      </div>

      <div className="j-card">
        <SectionLabel>Preferences</SectionLabel>
        {/* There was a timezone picker here that kept nothing and changed nothing. What is true is said instead. */}
        <div className="j-row j-between j-wrap" style={{ gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Timezone</div>
            <div className="j-muted" style={{ fontSize: 12 }}>Dates and times are shown in this device&apos;s timezone: {typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ") : "unknown"}. Choosing another is not built yet.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function McpTab() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyExpiry, setNewKeyExpiry] = useState("never")
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  /** Generate pressed with no name: said in words rather than a dimmed button. */
  const [needName, setNeedName] = useState(false)

  const fetchKeys = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/api-keys")
      if (res.ok) {
        const data = await res.json()
        setKeys(((data.apiKeys || []) as (Omit<ApiKey, "isActive"> & { isRevoked?: boolean; isExpired?: boolean })[]).map((k) => ({ ...k, isActive: !k.isRevoked && !k.isExpired })))
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const createKey = async () => {
    if (!newKeyName.trim()) { setNeedName(true); return }
    setNeedName(false)
    try {
      setIsCreating(true)
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: ["read", "write"], expiresIn: newKeyExpiry }),
      })
      const data = await res.json().catch(() => null)
      // The server says why (for one, "Maximum of 10 active API keys allowed"). The page used to hide that.
      if (!res.ok) throw new Error(data?.error || "The key was not made")
      const made = data?.apiKey?.key
      if (!made) throw new Error("The key was made but not returned")
      setRevealedKey(made)
      setShowCreate(false)
      setNewKeyName("")
      setNewKeyExpiry("never")
      fetchKeys()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The key was not made")
    } finally {
      setIsCreating(false)
    }
  }

  const revokeKey = async (id: string, name: string) => {
    if (!confirm(`Revoke "${name}"? Any agents using this key will stop working.`)) return
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("API key revoked")
      fetchKeys()
    } catch {
      toast.error("Failed to revoke key")
    }
  }

  const [origin, setOrigin] = useState("")
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const MCP_ENDPOINT = `${origin}${MCP_PATH}`
  const claudeConfig = revealedKey
    ? JSON.stringify({ mcpServers: { jarvis: { url: MCP_ENDPOINT, headers: { Authorization: `Bearer ${revealedKey}` } } } }, null, 2)
    : `{\n  "mcpServers": {\n    "jarvis": {\n      "url": "${MCP_ENDPOINT}",\n      "headers": { "Authorization": "Bearer aipp_..." }\n    }\n  }\n}`

  return (
    <div className="j-col j-gap-4">
      {/* Connection info */}
      <div className="j-card">
        <SectionLabel>MCP Endpoint</SectionLabel>
        <div className="j-col" style={{ gap: 12 }}>
          <CopyField label="Server URL" value={MCP_ENDPOINT} />
          <p className="j-muted" style={{ fontSize: 12, margin: 0 }}>
            Tools for projects, tasks, todos, ideas, documents, finance, calendar, agents and memory.
          </p>
        </div>
      </div>

      {/* Claude Code config */}
      <div className="j-card">
        <div className="j-row j-between" style={{ marginBottom: 12 }}>
          <SectionLabel>Claude Code Config</SectionLabel>
          <button className="j-btn j-btn-ghost" style={{ fontSize: 12 }} onClick={() => copyText(claudeConfig, "Config copied")} aria-label="Copy the Claude Code config">Copy</button>
        </div>
        <pre style={{
          background: "var(--opx-soft)", borderRadius: 8, padding: "12px 14px",
          fontSize: 12, fontFamily: "inherit", color: "var(--opx-ink)",
          margin: 0, overflow: "auto", lineHeight: 1.6,
        }}>
          {claudeConfig}
        </pre>
        {!revealedKey && (
          <p className="j-muted" style={{ fontSize: 12, marginTop: 8, margin: "8px 0 0" }}>
            Generate an API key below, then copy the config with your key filled in.
          </p>
        )}
      </div>

      {/* Revealed key banner */}
      {revealedKey && (
        <div className="j-card" style={{ background: "color-mix(in srgb, var(--opx-accent) 10%, transparent)", boxShadow: "0 0 0 1px color-mix(in srgb, var(--opx-accent) 40%, transparent)" }}>
          <p style={{ fontSize: 12, color: "var(--j-accent)", fontWeight: 600, margin: "0 0 8px" }}>Save this key — it won't be shown again</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              readOnly
              value={revealedKey}
              style={{
                flex: 1, background: "var(--opx-soft)", border: "1px solid color-mix(in srgb, var(--opx-accent) 45%, transparent)",
                borderRadius: 8, padding: "8px 12px", color: "var(--opx-ink)",
                fontSize: 12, fontFamily: "inherit", outline: "none",
              }}
            />
            <button className="j-btn j-btn-ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => copyText(revealedKey, "Key copied")} aria-label="Copy the new key">Copy</button>
            <button className="j-btn j-btn-ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => setRevealedKey(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* API keys list */}
      <div className="j-card">
        <div className="j-row j-between" style={{ marginBottom: 12 }}>
          <SectionLabel>API Keys</SectionLabel>
          <button className="j-btn j-btn-primary" style={{ fontSize: 12 }} onClick={() => setShowCreate(s => !s)}>
            {showCreate ? "Cancel" : "+ New key"}
          </button>
        </div>

        {showCreate && (
          <div className="j-card" style={{ background: "var(--opx-soft)", marginBottom: 16 }}>
            <div className="j-grid j-cols-2" style={{ gap: 12, marginBottom: 12 }}>
              <Field label="Key name">
                <Input value={newKeyName} onChange={setNewKeyName} placeholder="e.g. Claude Code local" />
              </Field>
              <Field label="Expires">
                <select
                  value={newKeyExpiry}
                  onChange={e => setNewKeyExpiry(e.target.value)}
                  style={{ background: "var(--opx-soft)", border: "1px solid var(--j-ring)", borderRadius: 8, padding: "8px 12px", color: "var(--opx-ink)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                >
                  <option value="never">Never</option>
                  <option value="30d">30 days</option>
                  <option value="6m">6 months</option>
                  <option value="1y">1 year</option>
                </select>
              </Field>
            </div>
            <button
              className="j-btn j-btn-primary"
              onClick={createKey}
              disabled={isCreating}
              style={{ opacity: isCreating ? 0.5 : 1 }}
            >
              {isCreating ? "Generating…" : "Generate key"}
            </button>
            {needName && !newKeyName.trim() && <p role="alert" className="opx-ch-need" style={{ margin: "8px 0 0" }}>Give the key a name first, so you can tell it apart later.</p>}
          </div>
        )}

        {isLoading ? (
          <div className="j-col" style={{ gap: 8 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 48, background: "var(--opx-soft)", borderRadius: 8 }} />)}
          </div>
        ) : keys.length === 0 ? (
          <p className="j-muted" style={{ fontSize: 13, textAlign: "center", padding: "24px 0" }}>
            No API keys yet. Generate one to connect Claude Code or other agents.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {keys.map(key => (
              <div
                key={key.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                  borderRadius: 8, background: key.isActive ? "transparent" : "var(--opx-soft)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="j-row" style={{ gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: key.isActive ? "var(--opx-ink)" : "var(--opx-muted)" }}>
                      {key.name}
                    </span>
                    {!key.isActive && <span className="j-pill j-neg" style={{ fontSize: 12 }}>No longer works</span>}
                  </div>
                  <div className="j-row" style={{ gap: 12 }}>
                    <span style={{ fontSize: 12, fontFamily: "inherit", color: "var(--opx-muted)" }}>
                      {key.keyPrefix}••••
                    </span>
                    <span className="j-muted" style={{ fontSize: 12 }}>Last used: {relativeDate(key.lastUsedAt)}</span>
                    {key.expiresAt && (
                      <span className="j-muted" style={{ fontSize: 12 }}>Expires: {new Date(key.expiresAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                {key.isActive && (
                  <button
                    className="j-btn j-btn-ghost"
                    style={{ fontSize: 12, color: "color-mix(in srgb, var(--opx-hot) 55%, var(--opx-ink))", flexShrink: 0 }}
                    onClick={() => revokeKey(key.id, key.name)}
                    aria-label={`Revoke ${key.name}`}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AiTab() {
  return (
    <div className="j-col j-gap-4">
      {/* A "Default model" picker used to sit here. It saved a choice in this browser that nothing ever read, and
          listed models the assistants no longer run on. What is true is said instead. */}
      <div className="j-card">
        <SectionLabel>Assistant model</SectionLabel>
        <div className="j-row j-between j-wrap" style={{ gap: 10 }}>
          <div className="j-muted" style={{ fontSize: 13 }}>The model each assistant runs on is set by the planner. Choosing it here is not built yet.</div>
          <span className="j-pill j-ghost" style={{ fontSize: 12, flexShrink: 0 }}>Not built yet</span>
        </div>
      </div>

      <div className="j-card">
        <SectionLabel>API Configuration</SectionLabel>
        <div className="j-col" style={{ gap: 10 }}>
          <Field label="Anthropic API key">
            <div style={{ display: "flex", gap: 8 }}>
              <input
                readOnly
                value="Configured via environment variable"
                style={{
                  flex: 1, background: "var(--opx-soft)", border: "1px solid var(--j-ring)",
                  borderRadius: 8, padding: "8px 12px", color: "var(--opx-muted)",
                  fontSize: 13, fontFamily: "inherit", outline: "none",
                }}
              />
            </div>
          </Field>
          <p className="j-muted" style={{ fontSize: 12, margin: 0 }}>
            The API key is set server-side via Vercel environment variables. To rotate it, update <code style={{ fontFamily: "inherit" }}>ANTHROPIC_API_KEY</code> in your Vercel project settings.
          </p>
        </div>
      </div>
    </div>
  )
}

function AppearanceTab() {
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable")

  const applyDensity = (d: typeof density) => {
    setDensity(d)
    const val = d === "compact" ? "0.8" : d === "spacious" ? "1.2" : "1"
    document.documentElement.style.setProperty("--j-density", val)
    localStorage.setItem("jarvis_density", d)
  }

  useEffect(() => {
    const saved = localStorage.getItem("jarvis_density") as typeof density | null
    if (saved) {
      setDensity(saved)
      const val = saved === "compact" ? "0.8" : saved === "spacious" ? "1.2" : "1"
      document.documentElement.style.setProperty("--j-density", val)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <SectionLabel>Density</SectionLabel>
        <div className="j-row" style={{ gap: 10 }}>
          {(["compact", "comfortable", "spacious"] as const).map(d => (
            <button
              key={d}
              onClick={() => applyDensity(d)}
              style={{
                flex: 1, padding: "16px 12px", borderRadius: 10, cursor: "pointer",
                border: "none", fontFamily: "inherit",
                background: density === d ? "color-mix(in srgb, var(--opx-accent) 16%, transparent)" : "var(--opx-soft)",
                boxShadow: `0 0 0 1px ${density === d ? "color-mix(in srgb, var(--opx-accent) 45%, transparent)" : "var(--j-ring)"}`,
                color: "var(--opx-ink)",
                textTransform: "capitalize", fontWeight: density === d ? 600 : 400, fontSize: 13,
              }}
              aria-pressed={density === d}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="j-muted" style={{ fontSize: 12, marginTop: 10, margin: "10px 0 0" }}>
          Controls spacing throughout the app. Takes effect immediately.
        </p>
      </div>
    </div>
  )
}

function IntegrationsTab() {
  const PLANNED = [
    { icon: <Calendar size={20} strokeWidth={1.8} />, name: "Google", description: "Sync calendar events, contacts, and Drive documents", status: "planned" },
    { icon: <GitBranch size={20} strokeWidth={1.8} />, name: "GitHub", description: "Link projects to repositories, sync issues as todos", status: "planned" },
    { icon: <CalendarClock size={20} strokeWidth={1.8} />, name: "Calendly", description: "Embed scheduling links and sync booked appointments", status: "planned" },
  ]

  return (
    <div className="j-col j-gap-4">
      <div className="j-card" style={{ textAlign: "center", padding: 32 }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "center", color: "var(--opx-muted)" }}><Plug size={28} strokeWidth={1.7} /></div>
        <h3 style={{ margin: "0 0 8px", fontWeight: 500 }}>Integrations coming soon</h3>
        <p className="j-muted" style={{ fontSize: 13, margin: 0, maxWidth: 400, marginInline: "auto" }}>
          Connect the planner to external tools. The integrations below are planned for an upcoming release.
        </p>
      </div>

      <div className="j-grid j-cols-3">
        {PLANNED.map(p => (
          <div key={p.name} className="j-card" style={{ opacity: 0.7 }}>
            <div className="j-row" style={{ gap: 12, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--opx-soft)", display: "grid", placeItems: "center", fontSize: 20 }}>
                {p.icon}
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                <span className="j-pill j-ghost" style={{ fontSize: 12 }}>Planned</span>
              </div>
            </div>
            <p className="j-muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>{p.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function DataTab() {
  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <SectionLabel>Export</SectionLabel>
        <div className="j-col" style={{ gap: 10 }}>
          {[
            { key: "projects", label: "Projects & tasks", sub: "All projects, steps, phases, and progress notes" },
            { key: "ideas", label: "Ideas", sub: "All ideas, facets, tags, and lifecycle history" },
            { key: "todos", label: "Todos", sub: "All tasks with completion status" },
            { key: "finance", label: "Finance", sub: "Accounts, transactions, and summaries" },
          ].map(item => (
            <div key={item.key} className="j-row j-between" style={{
              padding: "12px 14px", borderRadius: 9, background: "var(--opx-soft)", boxShadow: "0 0 0 1px var(--j-ring)"
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{item.label}</div>
                <div className="j-muted" style={{ fontSize: 12 }}>{item.sub}</div>
              </div>
              <span className="j-pill j-ghost" style={{ fontSize: 12, flexShrink: 0 }}>Not built yet</span>
            </div>
          ))}
        </div>
      </div>

      <div className="j-card">
        <SectionLabel>Delete account</SectionLabel>
        <div className="j-row j-between">
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Delete account</div>
            <div className="j-muted" style={{ fontSize: 12 }}>Permanently remove your account and all data</div>
          </div>
          <span className="j-pill j-ghost" style={{ fontSize: 12, flexShrink: 0 }}>Not built yet</span>
        </div>
      </div>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const user = useUser()
  const [activeTab, setActiveTab] = useState<Tab>(() => (typeof window !== "undefined" && TABS.some((x) => x.id === new URLSearchParams(window.location.search).get("tab")) ? (new URLSearchParams(window.location.search).get("tab") as Tab) : "profile"))

  const pickTab = (id: Tab) => { setActiveTab(id); const u = new URL(window.location.href); u.searchParams.set("tab", id); window.history.replaceState(null, "", u) }

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4">
        {/* On a narrow screen seven tabs do not fit and the ones past the edge gave no sign they were there: a picker
            names every section instead. Owner, 2026-11-15: "Chips that are more than 3 options or cause the need to be
            stacked is not ideal". */}
        <label className="opx-setpick">
          <span className="j-muted" style={{ fontSize: 13 }}>Section</span>
          <select className="opx-input" aria-label="Settings section" value={activeTab} onChange={(e) => pickTab(e.target.value as Tab)}>
            {TABS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </label>
        {/* Tab bar */}
        <div className="j-row opx-settabs" role="tablist" aria-label="Settings" style={{ gap: 4, borderBottom: "1px solid var(--j-hairline)", paddingBottom: 0, marginBottom: -4, overflowX: "auto", scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab" aria-selected={activeTab === t.id}
              onClick={() => pickTab(t.id)}
              style={{
                background: "none", border: "none", fontFamily: "inherit", cursor: "pointer",
                fontSize: 13, fontWeight: activeTab === t.id ? 500 : 400,
                color: activeTab === t.id ? "var(--opx-ink)" : "var(--opx-muted)",
                padding: "8px 14px", minHeight: 44, flex: "none", whiteSpace: "nowrap",
                borderBottom: `2px solid ${activeTab === t.id ? "var(--j-accent)" : "transparent"}`,
                marginBottom: -1,
                transition: "color 0.12s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {activeTab === "profile" && <ProfileTab user={user} />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "mcp" && <McpTab />}
        {activeTab === "ai" && <AiTab />}
        {activeTab === "appearance" && <AppearanceTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "data" && <DataTab />}
      </div>
    </DashboardLayout>
  )
}
