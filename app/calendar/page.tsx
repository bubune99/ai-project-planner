"use client"

/*
 * Calendar — the project calendar across every project (owner 2026-11-13).
 * Tasks and todos come from /api/work and can be checked off and planned
 * (Plan mode) exactly as on a project; events, milestones and bills from the
 * shared calendar show as read-only entries. "Add event" still creates a
 * calendar event through POST /api/calendar.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/navigation"
import { AddEventDialog, type NewEventPayload } from "@/components/calendar/AddEventDialog"
import { WorkCalendar } from "@/components/work/opx-work"
import type { CalendarCategory } from "@/lib/types"

export default function CalendarPage() {
  const router = useRouter()
  const user = useUser()
  const [categories, setCategories] = useState<CalendarCategory[]>([])
  const [adding, setAdding] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchCategories = useCallback(async () => {
    try {
      const r = await fetch("/api/calendar/categories")
      const j = await r.json()
      if (j.success) setCategories(j.data)
    } catch (e) {
      console.error("Failed to fetch categories:", e)
    }
  }, [])

  useEffect(() => {
    if (!user) { router.push("/"); return }
    fetchCategories()
  }, [user, router, fetchCategories])

  const createEvent = async (payload: NewEventPayload) => {
    const r = await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    const j = await r.json()
    if (!j.success) throw new Error(j.error?.message ?? "Failed to create event")
    toast.success("Event added")
    setRefreshKey((k) => k + 1)
  }

  return (
    <DashboardLayout>
      <div className="opx-page">
        <header className="opx-pbar">
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1>Calendar</h1>
            <div className="opx-muted">Tasks and todos from every project, plus your events. Plan mode schedules anything without a date.</div>
          </div>
        </header>
        <WorkCalendar
          refreshKey={refreshKey}
          toolbar={<button className="opx-btn primary" onClick={() => setAdding(true)}>Add event</button>}
        />
      </div>
      <AddEventDialog open={adding} onClose={() => setAdding(false)} onSave={createEvent} categories={categories} />
    </DashboardLayout>
  )
}
