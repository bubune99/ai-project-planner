"use client"

import { DashboardLayout } from "@/components/navigation"

const SETTINGS_CATEGORIES = [
  { icon: "👤", title: "Profile", description: "Manage your account settings and preferences" },
  { icon: "🔔", title: "Notifications", description: "Configure alerts and notification preferences" },
  { icon: "🎨", title: "Appearance", description: "Customize theme, colors, and display options" },
  { icon: "🛡️", title: "Privacy & Security", description: "Manage security settings and data privacy" },
  { icon: "🔑", title: "API Keys", description: "Manage API keys and integrations" },
  { icon: "🗄️", title: "Data & Storage", description: "Export data, manage storage, and backups" },
]

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4">
        <div className="j-coming-soon">
          <div style={{ width: 64, height: 64, borderRadius: 16, display: "grid", placeItems: "center", background: "oklch(0.870 0.045 252 / 0.15)", boxShadow: "0 0 0 1px var(--j-ring-strong), 0 0 40px oklch(0.870 0.045 252 / 0.3)" }}>
            <span style={{ fontSize: 28 }}>⚙️</span>
          </div>
          <span className="j-eyebrow" style={{ color: "var(--j-accent)" }}>Coming soon</span>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" }}>Settings</h1>
          <p className="j-muted" style={{ maxWidth: 520, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Workspace, integrations, API keys, theming, data export, billing.
          </p>
        </div>

        <div className="j-grid j-cols-3">
          {SETTINGS_CATEGORIES.map((cat) => (
            <div key={cat.title} className="j-card" style={{ opacity: 0.6 }}>
              <div className="j-row" style={{ gap: 12, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "oklch(0.870 0.045 252 / 0.12)", display: "grid", placeItems: "center", fontSize: 18 }}>
                  {cat.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{cat.title}</div>
                  <span className="j-pill j-muted" style={{ fontSize: 10, marginTop: 2 }}>Soon</span>
                </div>
              </div>
              <p className="j-muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>{cat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}
