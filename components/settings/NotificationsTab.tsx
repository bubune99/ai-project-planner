"use client"

/*
 * Settings, Notifications: turn phone notifications on for this device, choose what to be told about, and send a
 * test. What each kind means is in lib/notify/notify-model.ts; the device side in components/pwa/push-client.ts.
 */

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { KINDS, KIND_LABEL, type NotifyPrefs } from "@/lib/notify/notify-model"
import { deviceState, disablePush, enablePush, type DeviceState } from "@/components/pwa/push-client"

interface Status { prefs: NotifyPrefs; configured: boolean; devices: number; publicKey: string | null }

const DEVICE_LINE: Record<DeviceState, string> = {
  on: "On for this device.",
  off: "Off for this device.",
  blocked: "This browser was told not to allow notifications from the planner. Allow them in the browser's site settings, then come back here.",
  "needs-install": "On an iPhone or iPad, add the planner to your Home Screen first: press Share, then Add to Home Screen, open it from there, and come back to this page.",
  unsupported: "This browser cannot receive notifications.",
}

export function NotificationsTab() {
  const [status, setStatus] = useState<Status | null>(null)
  const [device, setDevice] = useState<DeviceState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/push/prefs", { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus(await res.json()); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load") }
    setDevice(await deviceState())
  }, [])
  useEffect(() => { void load() }, [load])

  const turnOn = async () => {
    setBusy("device")
    const r = await enablePush(status?.publicKey ?? null)
    setDevice(r.state)
    if (r.error) toast.error(r.error)
    else if (r.state === "on") toast.success("Notifications are on for this device")
    setBusy(null); void load()
  }
  const turnOff = async () => { setBusy("device"); setDevice(await disablePush()); setBusy(null); void load() }

  const setKind = async (kind: (typeof KINDS)[number], on: boolean) => {
    if (!status) return
    const prefs = { ...status.prefs, [kind]: on }
    setStatus({ ...status, prefs }); setBusy(kind)
    try {
      const res = await fetch("/api/push/prefs", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefs }) })
      if (!res.ok) throw new Error()
    } catch { toast.error("That choice was not saved. Try again."); void load() }
    setBusy(null)
  }

  const test = async () => {
    setBusy("test")
    try {
      const res = await fetch("/api/push/test", { method: "POST", credentials: "include" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error()
      if (j.configured === false) toast.error("Notifications are not set up on the server yet.")
      else if (!j.sent) toast.error(j.failed ? "The test could not be delivered to your devices." : "No device has notifications on yet. Turn them on for this device first.")
      else toast.success(`Sent to ${j.sent} ${j.sent === 1 ? "device" : "devices"}. It should arrive in a few seconds.`)
    } catch { toast.error("The test could not be sent.") }
    setBusy(null)
  }

  const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--j-muted, oklch(0.556 0 0))", margin: "0 0 10px" }
  const big: React.CSSProperties = { minHeight: 44, padding: "0 16px" }

  return (
    <div className="j-col j-gap-4" data-testid="settings-notifications" style={{ maxWidth: 760 }}>
      {error && <div className="j-card" role="alert"><p className="j-neg" style={{ margin: 0, fontSize: 13 }}>Couldn&apos;t load notification settings: {error}</p></div>}

      {status && !status.configured && (
        <div className="j-card" role="status">
          <p style={{ margin: 0, fontSize: 14 }}>Notifications are not set up on the server yet, so nothing can be sent. Your choices below are still saved.</p>
        </div>
      )}

      <div className="j-card">
        <p style={label}>This device</p>
        <p style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.5 }} data-testid="notify-device-state">{device ? DEVICE_LINE[device] : "Checking…"}</p>
        <div className="j-row" style={{ gap: 8, flexWrap: "wrap" }}>
          {device === "off" && <button className="j-btn j-btn-primary" style={big} disabled={busy === "device"} onClick={turnOn}>{busy === "device" ? "Turning on…" : "Turn on notifications"}</button>}
          {device === "on" && <button className="j-btn j-btn-ghost" style={big} disabled={busy === "device"} onClick={turnOff}>Turn off for this device</button>}
          <button className="j-btn j-btn-ghost" style={big} disabled={busy === "test" || !status?.devices} onClick={test}>{busy === "test" ? "Sending…" : "Send a test"}</button>
        </div>
        {status && <p className="j-muted" style={{ margin: "12px 0 0", fontSize: 12.5 }}>{status.devices === 0 ? "No device has notifications on." : `${status.devices} ${status.devices === 1 ? "device has" : "devices have"} notifications on. Each device is turned on from that device.`}</p>}
      </div>

      <div className="j-card">
        <p style={label}>What to tell me about</p>
        <div className="j-col" style={{ gap: 4 }}>
          {KINDS.map((k) => (
            <label key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", minHeight: 44, cursor: "pointer" }}>
              <input type="checkbox" checked={status?.prefs[k] ?? true} disabled={!status || busy === k} onChange={(e) => void setKind(k, e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, flex: "none" }} />
              <span>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 500 }}>{KIND_LABEL[k].name}</span>
                <span className="j-muted" style={{ display: "block", fontSize: 13, lineHeight: 1.45 }}>{KIND_LABEL[k].says}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="j-muted" style={{ margin: "8px 0 0", fontSize: 12.5 }}>Errors are never sent to you: agents find and fix those. You are told only what needs your decision or your eye.</p>
      </div>
    </div>
  )
}
