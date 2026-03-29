"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { DashboardLayout } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react"
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
      return {
        start: grid[0][0],
        end: addDays(grid[5][6], 1),
      }
    }
    case "week": {
      const weekStart = getWeekStart(date)
      return {
        start: weekStart,
        end: addDays(weekStart, 7),
      }
    }
    case "day": {
      return {
        start: startOfDay(date),
        end: addDays(startOfDay(date), 1),
      }
    }
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

  // Fetch agenda items for the visible range
  const fetchItems = useCallback(async () => {
    try {
      const { start, end } = getDateRange(currentDate, viewMode)
      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      })

      const response = await fetch(`/api/calendar/agenda?${params}`)
      const data = await response.json()

      if (data.success) {
        setItems(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch calendar items:", error)
    } finally {
      setIsLoading(false)
    }
  }, [currentDate, viewMode])

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/calendar/categories")
      const data = await response.json()
      if (data.success) {
        setCategories(data.data)
      }
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

  // Navigation
  const navigateBack = () => {
    switch (viewMode) {
      case "month":
        setCurrentDate(addMonths(currentDate, -1))
        break
      case "week":
        setCurrentDate(addDays(currentDate, -7))
        break
      case "day":
        setCurrentDate(addDays(currentDate, -1))
        break
    }
  }

  const navigateForward = () => {
    switch (viewMode) {
      case "month":
        setCurrentDate(addMonths(currentDate, 1))
        break
      case "week":
        setCurrentDate(addDays(currentDate, 7))
        break
      case "day":
        setCurrentDate(addDays(currentDate, 1))
        break
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

  // Create event via API
  const handleCreateEvent = async (payload: NewEventPayload) => {
    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error?.message ?? "Failed to create event")
    }

    // Refresh
    fetchItems()
  }

  // Header title
  const getHeaderTitle = (): string => {
    switch (viewMode) {
      case "month":
        return currentDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })
      case "week": {
        const weekStart = getWeekStart(currentDate)
        const weekEnd = addDays(weekStart, 6)
        const startLabel = weekStart.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
        const endLabel = weekEnd.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
        return `${startLabel} - ${endLabel}`
      }
      case "day":
        return currentDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
    }
  }

  // Filter items relevant to the current day view
  const getItemsForDayView = (): CalendarAgendaItem[] => {
    const dayKey = currentDate.toISOString().split("T")[0]
    return items.filter(
      (item) => new Date(item.startTime).toISOString().split("T")[0] === dayKey
    )
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="px-8 py-4">
            <div className="flex items-center justify-between">
              {/* Left: title and nav */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-6 h-6 text-primary" />
                  <h1 className="text-xl font-semibold">Calendar</h1>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={navigateBack}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToToday}
                    className="px-3"
                  >
                    Today
                  </Button>
                  <Button variant="outline" size="icon" onClick={navigateForward}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <h2 className="text-lg font-medium text-muted-foreground">
                  {getHeaderTitle()}
                </h2>
              </div>

              {/* Right: view switcher + add event */}
              <div className="flex items-center gap-3">
                <Tabs
                  value={viewMode}
                  onValueChange={(v) => setViewMode(v as ViewMode)}
                >
                  <TabsList>
                    <TabsTrigger value="month">Month</TabsTrigger>
                    <TabsTrigger value="week">Week</TabsTrigger>
                    <TabsTrigger value="day">Day</TabsTrigger>
                  </TabsList>
                </Tabs>

                <Button onClick={() => setIsAddEventOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Event
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="px-8 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
        </main>

        {/* Add Event Dialog */}
        <AddEventDialog
          open={isAddEventOpen}
          onClose={() => setIsAddEventOpen(false)}
          onSave={handleCreateEvent}
          categories={categories}
          defaultDate={selectedDate}
        />
      </div>
    </DashboardLayout>
  )
}
