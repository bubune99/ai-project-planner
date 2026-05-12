"use client"

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

type Tab = "profile" | "mcp" | "ai" | "appearance" | "integrations" | "data"

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "mcp", label: "MCP Server" },
  { id: "ai", label: "AI" },
  { id: "appearance", label: "Appearance" },
  { id: "integrations", label: "Integrations" },
  { id: "data", label: "Data & Export" },
]

const MCP_ENDPOINT = "https://faridea.dev/mcp"

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
    <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.45 0 0)", margin: "0 0 10px", fontWeight: 600 }}>
      {children}
    </p>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, color: "oklch(0.556 0 0)", fontWeight: 500 }}>{label}</label>
      {children}
    </div>
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
        background: readOnly ? "oklch(1 0 0 / 0.02)" : "oklch(1 0 0 / 0.04)",
        border: "1px solid var(--j-ring)", borderRadius: 8,
        padding: "8px 12px", color: readOnly ? "oklch(0.556 0 0)" : "oklch(0.860 0 0)",
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
            flex: 1, background: "oklch(1 0 0 / 0.02)", border: "1px solid var(--j-ring)",
            borderRadius: 8, padding: "8px 12px", color: "oklch(0.556 0 0)",
            fontSize: 13, fontFamily: "var(--font-geist-mono, monospace)", outline: "none",
          }}
        />
        <button
          className="j-btn j-btn-ghost"
          style={{ flexShrink: 0, fontSize: 12 }}
          onClick={() => copyText(value, `${label} copied`)}
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
        <p className="j-muted" style={{ fontSize: 11, marginTop: 12, margin: "12px 0 0" }}>
          Account details are managed via your auth provider. Contact support to change your email.
        </p>
      </div>

      <div className="j-card">
        <SectionLabel>Preferences</SectionLabel>
        <Field label="Timezone">
          <select
            defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
            style={{
              background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)",
              borderRadius: 8, padding: "8px 12px", color: "oklch(0.860 0 0)",
              fontSize: 13, fontFamily: "inherit", outline: "none",
            }}
          >
            {(typeof Intl !== "undefined" && "supportedValuesOf" in Intl
              ? (Intl as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("timeZone")
              : ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"]
            ).map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </select>
        </Field>
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

  const fetchKeys = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/api-keys")
      if (res.ok) {
        const data = await res.json()
        setKeys(data.keys || [])
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const createKey = async () => {
    if (!newKeyName.trim()) return
    try {
      setIsCreating(true)
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: ["read", "write"], expiresIn: newKeyExpiry }),
      })
      if (!res.ok) throw new Error("Failed to create key")
      const data = await res.json()
      setRevealedKey(data.key)
      setShowCreate(false)
      setNewKeyName("")
      setNewKeyExpiry("never")
      fetchKeys()
    } catch {
      toast.error("Failed to create API key")
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
            57 tools — projects, todos, ideas, finance, calendar, agents, memory, workers, sources
          </p>
        </div>
      </div>

      {/* Claude Code config */}
      <div className="j-card">
        <div className="j-row j-between" style={{ marginBottom: 12 }}>
          <SectionLabel>Claude Code Config</SectionLabel>
          <button className="j-btn j-btn-ghost" style={{ fontSize: 11 }} onClick={() => copyText(claudeConfig, "Config copied")}>Copy</button>
        </div>
        <pre style={{
          background: "oklch(0.09 0 0)", borderRadius: 8, padding: "12px 14px",
          fontSize: 12, fontFamily: "var(--font-geist-mono, monospace)", color: "oklch(0.780 0 0)",
          margin: 0, overflow: "auto", lineHeight: 1.6,
        }}>
          {claudeConfig}
        </pre>
        {!revealedKey && (
          <p className="j-muted" style={{ fontSize: 11, marginTop: 8, margin: "8px 0 0" }}>
            Generate an API key below, then copy the config with your key filled in.
          </p>
        )}
      </div>

      {/* Revealed key banner */}
      {revealedKey && (
        <div className="j-card" style={{ background: "oklch(0.870 0.045 252 / 0.08)", boxShadow: "0 0 0 1px oklch(0.870 0.045 252 / 0.3)" }}>
          <p style={{ fontSize: 12, color: "var(--j-accent)", fontWeight: 600, margin: "0 0 8px" }}>⚠ Save this key — it won't be shown again</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              readOnly
              value={revealedKey}
              style={{
                flex: 1, background: "oklch(0.09 0 0)", border: "1px solid oklch(0.870 0.045 252 / 0.4)",
                borderRadius: 8, padding: "8px 12px", color: "oklch(0.870 0.045 252)",
                fontSize: 12, fontFamily: "var(--font-geist-mono, monospace)", outline: "none",
              }}
            />
            <button className="j-btn j-btn-ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => copyText(revealedKey, "Key copied")}>Copy</button>
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
          <div className="j-card" style={{ background: "oklch(1 0 0 / 0.03)", marginBottom: 16 }}>
            <div className="j-grid j-cols-2" style={{ gap: 12, marginBottom: 12 }}>
              <Field label="Key name">
                <Input value={newKeyName} onChange={setNewKeyName} placeholder="e.g. Claude Code local" />
              </Field>
              <Field label="Expires">
                <select
                  value={newKeyExpiry}
                  onChange={e => setNewKeyExpiry(e.target.value)}
                  style={{ background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)", borderRadius: 8, padding: "8px 12px", color: "oklch(0.860 0 0)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
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
              disabled={!newKeyName.trim() || isCreating}
              style={{ opacity: (!newKeyName.trim() || isCreating) ? 0.5 : 1 }}
            >
              {isCreating ? "Generating…" : "Generate key"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="j-col" style={{ gap: 8 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 48, background: "oklch(1 0 0 / 0.04)", borderRadius: 8 }} />)}
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
                  borderRadius: 8, background: key.isActive ? "transparent" : "oklch(1 0 0 / 0.02)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="j-row" style={{ gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: key.isActive ? "oklch(0.860 0 0)" : "oklch(0.45 0 0)" }}>
                      {key.name}
                    </span>
                    {!key.isActive && <span className="j-pill" style={{ fontSize: 9, background: "oklch(0.545 0.199 27 / 0.15)", color: "var(--j-neg)" }}>Revoked</span>}
                  </div>
                  <div className="j-row" style={{ gap: 12 }}>
                    <span style={{ fontSize: 11, fontFamily: "var(--font-geist-mono, monospace)", color: "oklch(0.556 0 0)" }}>
                      {key.keyPrefix}••••
                    </span>
                    <span className="j-muted" style={{ fontSize: 11 }}>Last used: {relativeDate(key.lastUsedAt)}</span>
                    {key.expiresAt && (
                      <span className="j-muted" style={{ fontSize: 11 }}>Expires: {new Date(key.expiresAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                {key.isActive && (
                  <button
                    className="j-btn j-btn-ghost"
                    style={{ fontSize: 11, color: "var(--j-neg)", flexShrink: 0 }}
                    onClick={() => revokeKey(key.id, key.name)}
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
  const [modelPref, setModelPref] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("jarvis_model_pref") ?? "claude-sonnet-4-6" : "claude-sonnet-4-6"
  )

  const save = () => {
    localStorage.setItem("jarvis_model_pref", modelPref)
    toast.success("Model preference saved")
  }

  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <SectionLabel>Default Model</SectionLabel>
        <div className="j-col" style={{ gap: 12 }}>
          {[
            { id: "claude-opus-4-7", label: "Claude Opus 4.7", sub: "Deepest reasoning — complex architecture, research" },
            { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", sub: "Best coding model — recommended default" },
            { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", sub: "Fast, lightweight — quick lookups and summaries" },
          ].map(m => (
            <label
              key={m.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
                borderRadius: 9, cursor: "pointer",
                background: modelPref === m.id ? "oklch(0.870 0.045 252 / 0.1)" : "oklch(1 0 0 / 0.03)",
                boxShadow: `0 0 0 1px ${modelPref === m.id ? "oklch(0.870 0.045 252 / 0.4)" : "var(--j-ring)"}`,
              }}
            >
              <input
                type="radio"
                name="model"
                value={m.id}
                checked={modelPref === m.id}
                onChange={() => setModelPref(m.id)}
                style={{ marginTop: 2, accentColor: "var(--j-accent)" }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{m.label}</div>
                <div className="j-muted" style={{ fontSize: 12 }}>{m.sub}</div>
              </div>
            </label>
          ))}
          <button className="j-btn j-btn-primary" style={{ alignSelf: "flex-start" }} onClick={save}>Save preference</button>
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
                  flex: 1, background: "oklch(1 0 0 / 0.02)", border: "1px solid var(--j-ring)",
                  borderRadius: 8, padding: "8px 12px", color: "oklch(0.45 0 0)",
                  fontSize: 13, fontFamily: "inherit", outline: "none",
                }}
              />
              <span className="j-pill" style={{ alignSelf: "center", background: "oklch(0.264 0.189 142 / 0.15)", color: "var(--j-pos)", fontSize: 11, flexShrink: 0 }}>Active</span>
            </div>
          </Field>
          <p className="j-muted" style={{ fontSize: 11, margin: 0 }}>
            The API key is set server-side via Vercel environment variables. To rotate it, update <code style={{ fontFamily: "var(--font-geist-mono, monospace)" }}>ANTHROPIC_API_KEY</code> in your Vercel project settings.
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
                background: density === d ? "oklch(0.870 0.045 252 / 0.12)" : "oklch(1 0 0 / 0.04)",
                boxShadow: `0 0 0 1px ${density === d ? "oklch(0.870 0.045 252 / 0.4)" : "var(--j-ring)"}`,
                color: density === d ? "var(--j-accent)" : "oklch(0.780 0 0)",
                textTransform: "capitalize", fontWeight: density === d ? 500 : 400, fontSize: 13,
              }}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="j-muted" style={{ fontSize: 11, marginTop: 10, margin: "10px 0 0" }}>
          Controls spacing throughout the app. Takes effect immediately.
        </p>
      </div>
    </div>
  )
}

function IntegrationsTab() {
  const PLANNED = [
    { icon: "📅", name: "Google", description: "Sync calendar events, contacts, and Drive documents", status: "planned" },
    { icon: "⬡", name: "GitHub", description: "Link projects to repositories, sync issues as todos", status: "planned" },
    { icon: "🗓", name: "Calendly", description: "Embed scheduling links and sync booked appointments", status: "planned" },
  ]

  return (
    <div className="j-col j-gap-4">
      <div className="j-card" style={{ textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔌</div>
        <h3 style={{ margin: "0 0 8px", fontWeight: 500 }}>Integrations coming soon</h3>
        <p className="j-muted" style={{ fontSize: 13, margin: 0, maxWidth: 400, marginInline: "auto" }}>
          Connect JARVIS to external tools. The integrations below are planned for an upcoming release.
        </p>
      </div>

      <div className="j-grid j-cols-3">
        {PLANNED.map(p => (
          <div key={p.name} className="j-card" style={{ opacity: 0.7 }}>
            <div className="j-row" style={{ gap: 12, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "oklch(1 0 0 / 0.04)", display: "grid", placeItems: "center", fontSize: 20 }}>
                {p.icon}
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                <span className="j-pill" style={{ fontSize: 10, background: "oklch(0.870 0.045 252 / 0.1)", color: "var(--j-accent)" }}>Planned</span>
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
  const [isExporting, setIsExporting] = useState<string | null>(null)

  const exportData = async (type: string) => {
    setIsExporting(type)
    await new Promise(r => setTimeout(r, 800))
    setIsExporting(null)
    toast.info(`${type} export coming soon`)
  }

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
              padding: "12px 14px", borderRadius: 9, background: "oklch(1 0 0 / 0.03)", boxShadow: "0 0 0 1px var(--j-ring)"
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{item.label}</div>
                <div className="j-muted" style={{ fontSize: 11 }}>{item.sub}</div>
              </div>
              <div className="j-row" style={{ gap: 6, flexShrink: 0 }}>
                <button className="j-btn j-btn-ghost" style={{ fontSize: 11 }} onClick={() => exportData(`${item.label} (JSON)`)}>
                  {isExporting === `${item.label} (JSON)` ? "…" : "JSON"}
                </button>
                <button className="j-btn j-btn-ghost" style={{ fontSize: 11 }} onClick={() => exportData(`${item.label} (CSV)`)}>
                  {isExporting === `${item.label} (CSV)` ? "…" : "CSV"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="j-card" style={{ boxShadow: "0 0 0 1px oklch(0.545 0.199 27 / 0.3)" }}>
        <SectionLabel>Danger Zone</SectionLabel>
        <div className="j-row j-between">
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Delete account</div>
            <div className="j-muted" style={{ fontSize: 11 }}>Permanently remove your account and all data</div>
          </div>
          <button
            className="j-btn j-btn-ghost"
            style={{ fontSize: 12, color: "var(--j-neg)", boxShadow: "0 0 0 1px oklch(0.545 0.199 27 / 0.4)", flexShrink: 0 }}
            onClick={() => toast.error("Please contact support to delete your account")}
          >
            Delete account
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const user = useUser()
  const [activeTab, setActiveTab] = useState<Tab>("profile")

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4">
        {/* Tab bar */}
        <div className="j-row" style={{ gap: 4, borderBottom: "1px solid var(--j-hairline)", paddingBottom: 0, marginBottom: -4 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: "none", border: "none", fontFamily: "inherit", cursor: "pointer",
                fontSize: 13, fontWeight: activeTab === t.id ? 500 : 400,
                color: activeTab === t.id ? "oklch(0.985 0 0)" : "oklch(0.556 0 0)",
                padding: "8px 14px",
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
        {activeTab === "mcp" && <McpTab />}
        {activeTab === "ai" && <AiTab />}
        {activeTab === "appearance" && <AppearanceTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "data" && <DataTab />}
      </div>
    </DashboardLayout>
  )
}
