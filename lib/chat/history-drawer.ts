"use client"

import { useEffect, useState } from "react"

/** Below this width the chat history is a slide-over drawer, not a fixed column. */
export const NARROW_QUERY = "(max-width: 767px)"
export const HISTORY_TOGGLE_EVENT = "chat-history:toggle"

export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return narrow
}

export const toggleHistoryDrawer = () => window.dispatchEvent(new Event(HISTORY_TOGGLE_EVENT))
