"use client"

import { cn } from "@/lib/utils"
import type { CalendarAgendaItem } from "@/lib/types"
import {
  addDays,
  getWeekStart,
  isToday,
  isSameDay,
  formatTime,
  HOURS,
  getItemColor,
} from "./calendar-utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"

interface CalendarWeekViewProps {
  currentDate: Date
  items: CalendarAgendaItem[]
  onDayClick: (date: Date) => void
}

const HOUR_HEIGHT = 56 // px per hour row

function getTopOffset(date: Date): number {
  return (date.getHours() + date.getMinutes() / 60) * HOUR_HEIGHT
}

function getHeight(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  return Math.max(diffHours * HOUR_HEIGHT, 20)
}

export function CalendarWeekView({
  currentDate,
  items,
  onDayClick,
}: CalendarWeekViewProps) {
  const weekStart = getWeekStart(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // All-day items
  const allDayItems = items.filter((item) => item.isAllDay)
  // Timed items
  const timedItems = items.filter((item) => !item.isAllDay)

  const getItemsForDay = (day: Date, list: CalendarAgendaItem[]) =>
    list.filter((item) => isSameDay(new Date(item.startTime), day))

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/30">
          <div className="border-r border-border" />
          {weekDays.map((day) => {
            const isTodayDate = isToday(day)
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onDayClick(day)}
                className="px-2 py-2 text-center border-r border-border last:border-r-0 hover:bg-accent/50 transition-colors"
              >
                <div className="text-xs text-muted-foreground uppercase">
                  {day.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  className={cn(
                    "mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                    isTodayDate && "bg-primary text-primary-foreground"
                  )}
                >
                  {day.getDate()}
                </div>
              </button>
            )
          })}
        </div>

        {/* All-day row */}
        {allDayItems.length > 0 && (
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
            <div className="flex items-center justify-center border-r border-border text-[10px] text-muted-foreground">
              ALL DAY
            </div>
            {weekDays.map((day) => {
              const dayAllDay = getItemsForDay(day, allDayItems)
              return (
                <div
                  key={day.toISOString()}
                  className="min-h-[28px] border-r border-border last:border-r-0 p-0.5 space-y-0.5"
                >
                  {dayAllDay.map((item) => (
                    <div
                      key={item.id}
                      className="truncate rounded px-1 py-0.5 text-[10px] text-white leading-tight"
                      style={{ backgroundColor: getItemColor(item) }}
                    >
                      {item.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* Time grid */}
        <ScrollArea className="h-[600px]">
          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            {/* Hour labels */}
            <div className="border-r border-border">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="flex items-start justify-end pr-2 text-[11px] text-muted-foreground border-b border-border"
                  style={{ height: HOUR_HEIGHT }}
                >
                  <span className="-mt-1.5">
                    {hour === 0
                      ? "12 AM"
                      : hour < 12
                        ? `${hour} AM`
                        : hour === 12
                          ? "12 PM"
                          : `${hour - 12} PM`}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day) => {
              const dayTimed = getItemsForDay(day, timedItems)
              return (
                <div
                  key={day.toISOString()}
                  className="relative border-r border-border last:border-r-0"
                >
                  {/* Hour cells */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="border-b border-border"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Event blocks */}
                  {dayTimed.map((item) => {
                    const start = new Date(item.startTime)
                    const end = item.endTime
                      ? new Date(item.endTime)
                      : new Date(start.getTime() + 60 * 60 * 1000)
                    const top = getTopOffset(start)
                    const height = getHeight(start, end)

                    return (
                      <Tooltip key={item.id}>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 text-[11px] text-white overflow-hidden cursor-default"
                            style={{
                              top,
                              height,
                              backgroundColor: getItemColor(item),
                              zIndex: 10,
                            }}
                          >
                            <div className="font-medium truncate">{item.title}</div>
                            <div className="truncate opacity-80">
                              {formatTime(start)} - {formatTime(end)}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(start)} - {formatTime(end)}
                          </p>
                          {item.description && (
                            <p className="text-xs mt-1">{item.description}</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}

                  {/* Now indicator */}
                  {isToday(day) && (
                    <div
                      className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                      style={{ top: getTopOffset(new Date()) }}
                    >
                      <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}
