'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker (offline shell, and the receiver for phone notifications). It no longer asks for
 * notification permission on load: a browser may only be asked in answer to a press, and an unasked prompt is the
 * surest way to be blocked for good. Turning them on is in Settings, Notifications (components/pwa/push-client.ts).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline shell is optional */ })
  }, [])

  return null
}
