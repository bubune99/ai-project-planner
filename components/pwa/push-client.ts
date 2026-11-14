/*
 * Turning phone notifications on and off for THIS device, from a button the person pressed. Browsers (an iPhone
 * above all) only show the permission question in answer to a press, and an iPhone only allows it once the planner
 * has been added to the Home Screen and opened from there.
 */

export type DeviceState =
  | "on"            // this device is subscribed
  | "off"           // can be turned on
  | "blocked"       // the person said no in the browser; only they can undo that in the browser's settings
  | "needs-install" // an iPhone or iPad in the browser: add to Home Screen first
  | "unsupported"   // this browser cannot receive them

const b64 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export async function deviceState(): Promise<DeviceState> {
  if (typeof window === "undefined") return "unsupported"
  if (isIos() && !isInstalled()) return "needs-install"
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported"
  if (Notification.permission === "denied") return "blocked"
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return sub && Notification.permission === "granted" ? "on" : "off"
  } catch { return "off" }
}

/** Call from a press. Asks permission, subscribes this device and tells the planner. Returns the new state, or what went wrong. */
export async function enablePush(publicKey: string | null): Promise<{ state: DeviceState; error?: string }> {
  const before = await deviceState()
  if (before === "needs-install" || before === "unsupported" || before === "blocked") return { state: before }
  if (!publicKey) return { state: before, error: "Notifications are not set up on the server yet." }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") return { state: permission === "denied" ? "blocked" : "off" }
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"))
    await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) }))
    const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) })
    if (!res.ok) return { state: "off", error: "This device could not be saved. Try again." }
    return { state: "on" }
  } catch (e) {
    return { state: "off", error: e instanceof Error ? e.message : "Could not turn notifications on." }
  }
}

export async function disablePush(): Promise<DeviceState> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined)
      await sub.unsubscribe()
    }
  } catch { /* nothing to turn off */ }
  return deviceState()
}
