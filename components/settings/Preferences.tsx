"use client"
/**
 * Settings: the timezone (Profile) and the assistant's default model (Assistant).
 *
 * Draws only. Both read and save through /api/settings/preferences, which also sends the two lists to choose
 * from, so the page offers exactly what the server accepts. What a value may be: lib/settings/preferences.ts.
 * A choice is saved when it is changed.
 */
import { useState } from "react"
import { Failed, Loading, unwrap, useJson } from "@/components/project/opx/shared"
import { zoneLabel, type ModelOption, type Preferences } from "@/lib/settings/preferences"

const PREFS_URL = "/api/settings/preferences"

interface Payload {
  preferences: Preferences
  zones: string[]
  models: ModelOption[]
  plannerModel: ModelOption
  assistantToday: string
}

type Field = keyof Preferences
type Save =
  | { kind: "idle" }
  | { kind: "saving"; value: string | null }
  | { kind: "saved" }
  | { kind: "failed"; value: string | null; why: string }

/** One preference: the loaded payload, the value to show, and a save that reports how it went. */
function usePreference(field: Field) {
  const { data, loading, error, reload } = useJson(PREFS_URL)
  const [fresh, setFresh] = useState<Payload | null>(null)
  const [save, setSave] = useState<Save>({ kind: "idle" })
  const loaded = data ? unwrap<Payload>(data) : null
  const payload = fresh ?? (loaded && loaded.preferences ? loaded : null)

  const change = async (value: string | null) => {
    setSave({ kind: "saving", value })
    try {
      const res = await fetch(PREFS_URL, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) })
      const body = (await res.json().catch(() => null)) as { data?: Payload; error?: { message?: string } } | null
      if (!res.ok || !body?.data?.preferences) throw new Error(body?.error?.message || `That choice was not saved (${res.status}).`)
      setFresh(body.data)
      setSave({ kind: "saved" })
    } catch (e) {
      setSave({ kind: "failed", value, why: e instanceof Error && e.message ? e.message : "That choice was not saved." })
    }
  }

  // While a save is in flight or has failed, the select keeps showing what was picked, so "Try again" is about it.
  const shown = payload ? (save.kind === "saving" || save.kind === "failed" ? save.value : payload.preferences[field]) : null
  return { payload, loading, error, reload, save, change, shown }
}

function SaveLine({ save, retry }: { save: Save; retry: () => void }) {
  return (
    <div aria-live="polite" style={{ minHeight: 20 }}>
      {save.kind === "saving" && <span className="j-muted" style={{ fontSize: 12.5 }}>Saving…</span>}
      {save.kind === "saved" && <span role="status" style={{ fontSize: 12.5, color: "var(--opx-good, var(--opx-ink))" }}>Saved</span>}
      {save.kind === "failed" && (
        <div className="j-row j-wrap" role="alert" style={{ gap: 10 }}>
          <p className="opx-ch-need" style={{ margin: 0, flexBasis: "auto" }}>{save.why}</p>
          <button type="button" className="opx-btn sm" onClick={retry}>Try again</button>
        </div>
      )}
    </div>
  )
}

const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }
const labelText: React.CSSProperties = { fontSize: 13, fontWeight: 500 }
const note: React.CSSProperties = { fontSize: 12, lineHeight: 1.5, margin: 0 }

/** "2026-11-22" as "Sunday, November 22, 2026". The date is the server's; nothing is worked out here. */
function longDate(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

function deviceZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

export function TimezoneSetting() {
  const p = usePreference("timezone")
  if (!p.payload) {
    return p.error ? <Failed what="your timezone" error={p.error} retry={p.reload} /> : <Loading what="your timezone" />
  }
  const { zones, assistantToday } = p.payload
  const device = deviceZone()
  const saving = p.save.kind === "saving"
  return (
    <div className="j-col" style={{ gap: 8 }} data-testid="settings-timezone">
      <label style={label}>
        <span style={labelText}>Timezone</span>
        <select className="opx-input" value={p.shown ?? ""} disabled={saving} aria-busy={saving}
          onChange={(e) => void p.change(e.target.value === "" ? null : e.target.value)}>
          <option value="">This device&apos;s{device ? ` (${zoneLabel(device)})` : ""}</option>
          {zones.map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
        </select>
      </label>
      <SaveLine save={p.save} retry={() => { if (p.save.kind === "failed") void p.change(p.save.value) }} />
      {p.save.kind !== "saving" && p.save.kind !== "failed" && (
        <p className="j-muted" style={note}>
          {p.payload.preferences.timezone
            ? <>The assistant takes today&apos;s date from {zoneLabel(p.payload.preferences.timezone)}: {longDate(assistantToday)}.</>
            : <>The assistant cannot see this device&apos;s timezone, so until one is chosen it takes today&apos;s date from UTC: {longDate(assistantToday)}.</>}
          {" "}Dates and times on pages are shown in this device&apos;s timezone whatever is chosen here.
        </p>
      )}
    </div>
  )
}

export function DefaultModelSetting() {
  const p = usePreference("defaultModel")
  if (!p.payload) {
    return p.error ? <Failed what="the assistant's model" error={p.error} retry={p.reload} /> : <Loading what="the assistant's model" />
  }
  const { models, plannerModel } = p.payload
  const saving = p.save.kind === "saving"
  return (
    <div className="j-col" style={{ gap: 8 }} data-testid="settings-default-model">
      <label style={label}>
        <span style={labelText}>Default model</span>
        <select className="opx-input" value={p.shown ?? ""} disabled={saving} aria-busy={saving}
          onChange={(e) => void p.change(e.target.value === "" ? null : e.target.value)}>
          <option value="">The planner&apos;s default ({plannerModel.label})</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <SaveLine save={p.save} retry={() => { if (p.save.kind === "failed") void p.change(p.save.value) }} />
      <p className="j-muted" style={note}>
        The model the assistant and the specialists it hands work to run on, from your next message. The picker in a chat
        chooses which assistant answers, not its model. If the planner stops offering the model chosen here, its default is used.
      </p>
    </div>
  )
}
