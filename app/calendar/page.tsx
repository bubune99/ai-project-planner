"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView"
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView"
import { CalendarDayView } from "@/components/calendar/CalendarDayView"
import { AddEventDialog } from "@/components/calendar/AddEventDialog"
import type { CalendarAgendaItem, CalendarCategory } from "@/lib/types"
import type { NewEventPayload } from "@/components/calendar/AddEventDialog"
import {
  addDays,
  addMonths,
  getWeekStart,
  getMonthGrid,
  startOfDay,
} from "@/components/calendar/calendar-utils"

type ViewMode = "month" | "week" | "day"

function getDateRange(date: Date, view: ViewMode): { start: Date; end: Date } {
  switch (view) {
    case "month": {
      const grid = getMonthGrid(date.getFullYear(), date.getMonth())
      return { start: grid[0][0], end: addDays(grid[5][6], 1) }
    }
    case "week": {
      const weekStart = getWeekStart(date)
      return { start: weekStart, end: addDays(weekStart, 7) }
    }
    case "day":
      return { start: startOfDay(date), end: addDays(startOfDay(date), 1) }
  }
}

export default function CalendarPage() {
  const router = useRouter()
  const user = useUser()

  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [items, setItems] = useState<CalendarAgendaItem[]>([])
  const [categories, setCategories] = useState<CalendarCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddEventOpen, setIsAddEventOpen] = useState(false)

  const fetchItems = useCallback(async () => {
    try {
      const { start, end } = getDateRange(currentDate, viewMode)
      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      })
      const response = await fetch(`/api/calendar/agenda?${params}`)
      const data = await response.json()
      if (data.success) setItems(data.data)
    } catch (error) {
      console.error("Failed to fetch calendar items:", error)
    } finally {
      setIsLoading(false)
    }
  }, [currentDate, viewMode])

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/calendar/categories")
      const data = await response.json()
      if (data.success) setCategories(data.data)
    } catch (error) {
      console.error("Failed to fetch categories:", error)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      router.push("/")
      return
    }
    fetchCategories()
  }, [user, router, fetchCategories])

  useEffect(() => {
    if (user) {
      setIsLoading(true)
      fetchItems()
    }
  }, [user, fetchItems])

  const navigateBack = () => {
    switch (viewMode) {
      case "month": setCurrentDate(addMonths(currentDate, -1)); break
      case "week":  setCurrentDate(addDays(currentDate, -7)); break
      case "day":   setCurrentDate(addDays(currentDate, -1)); break
    }
  }

  const navigateForward = () => {
    switch (viewMode) {
      case "month": setCurrentDate(addMonths(currentDate, 1)); break
      case "week":  setCurrentDate(addDays(currentDate, 7)); break
      case "day":   setCurrentDate(addDays(currentDate, 1)); break
    }
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDate(today)
  }

  const handleDayClick = (date: Date) => {
    setSelectedDate(date)
    setCurrentDate(date)
    setViewMode("day")
  }

  const handleCreateEvent = async (payload: NewEventPayload) => {
    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!data.success) throw new Error(data.error?.message ?? "Failed to create event")
    fetchItems()
  }

  const getHeaderTitle = (): string => {
    switch (viewMode) {
      case "month":
        return currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      case "week": {
        const weekStart = getWeekStart(currentDate)
        const weekEnd = addDays(weekStart, 6)
        return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      }
      case "day":
        return currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    }
  }

  const getItemsForDayView = (): CalendarAgendaItem[] => {
    const dayKey = currentDate.toISOString().split("T")[0]
    return items.filter(item => new Date(item.startTime).toISOString().split("T")[0] === dayKey)
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div className="j-dot-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4">
        {/* Toolbar */}
        <div className="j-row j-between">
          <div className="j-row j-gap-2">
            {/* Nav controls */}
            <button className="j-btn j-btn-ghost" onClick={navigateBack} style={{ padding: "6px 10px" }}>‹</button>
            <button className="j-btn j-btn-ghost" onClick={goToToday} style={{ padding: "6px 12px" }}>Today</button>
            <button className="j-btn j-btn-ghost" onClick={navigateForward} style={{ padding: "6px 10px" }}>›</button>
            <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>{getHeaderTitle()}</h2>
          </div>
          <div className="j-row j-gap-2">
            {/* View mode pills */}
            {(["month","week","day"] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`j-pill ${viewMode === v ? "j-proj" : "j-ghost"}`}
                style={{ cursor: "pointer", border: "none", textTransform: "capitalize" }}
              >
                {v}
              </button>
            ))}
            <button className="j-btn j-btn-primary" onClick={() => setIsAddEventOpen(true)}>+ Add event</button>
          </div>
        </div>

        {/* Calendar content */}
        <div className="j-card" style={{ padding: 0, overflow: "hidden" }}>
          {isLoading ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div className="j-dot-pulse" />
            </div>
          ) : (
            <>
              {viewMode === "month" && (
                <CalendarMonthView
                  year={currentDate.getFullYear()}
                  month={currentDate.getMonth()}
                  items={items}
                  onDayClick={handleDayClick}
                  selectedDate={selectedDate}
                />
              )}
              {viewMode === "week" && (
                <CalendarWeekView
                  currentDate={currentDate}
                  items={items}
                  onDayClick={handleDayClick}
                />
              )}
              {viewMode === "day" && (
                <CalendarDayView
                  date={currentDate}
                  items={getItemsForDayView()}
                />
              )}
            </>
          )}
        </div>
      </div>

      <AddEventDialog
        open={isAddEventOpen}
        onClose={() => setIsAddEventOpen(false)}
        onSave={handleCreateEvent}
        categories={categories}
        defaultDate={selectedDate}
      />
    </DashboardLayout>
  )
}
