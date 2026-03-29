"use client"

import type { CalendarAgendaItem } from "@/lib/types"
import {
  isToday,
  formatTime,
  HOURS,
  getItemColor,
  getItemLabel,
} from "./calendar-utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"

interface CalendarDayViewProps {
  date: Date
  items: CalendarAgendaItem[]
}

const HOUR_HEIGHT = 64

function getTopOffset(d: Date): number {
  return (d.getHours() + d.getMinutes() / 60) * HOUR_HEIGHT
}

function getHeight(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime()
  return Math.max((diffMs / (1000 * 60 * 60)) * HOUR_HEIGHT, 24)
}

export function CalendarDayView({ date, items }: CalendarDayViewProps) {
  const allDayItems = items.filter((i) => i.isAllDay)
  const timedItems = items.filter((i) => !i.isAllDay)
  const isTodayDate = isToday(date)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Day header */}
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <div className="text-sm text-muted-foreground">
            {date.toLocaleDateString("en-US", { weekday: "long" })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold">{date.getDate()}</span>
            <span className="text-sm text-muted-foreground">
              {date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            {isTodayDate && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground font-medium">
                Today
              </span>
            )}
          </div>
        </div>

        {/* All-day */}
        {allDayItems.length > 0 && (
          <div className="border-b border-border px-4 py-2 space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              All Day
            </div>
            {allDayItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-white"
                style={{ backgroundColor: getItemColor(item) }}
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-xs opacity-80">({getItemLabel(item.type)})</span>
              </div>
            ))}
          </div>
        )}

        {/* Hourly grid */}
        <ScrollArea className="h-[650px]">
          <div className="relative grid grid-cols-[60px_1fr]">
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

            {/* Timeline column */}
            <div className="relative">
              {/* Hour cells */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border"
                  style={{ height: HOUR_HEIGHT }}
                />
              ))}

              {/* Event blocks */}
              {timedItems.map((item) => {
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
                        className="absolute left-1 right-4 rounded-md px-3 py-1.5 text-white overflow-hidden cursor-default shadow-sm"
                        style={{
                          top,
                          height,
                          backgroundColor: getItemColor(item),
                          zIndex: 10,
                        }}
                      >
                        <div className="font-medium text-sm truncate">{item.title}</div>
                        <div className="text-xs opacity-80 truncate">
                          {formatTime(start)} - {formatTime(end)}
                        </div>
                        {item.description && height > 50 && (
                          <div className="text-xs opacity-70 mt-0.5 truncate">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[250px]">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(start)} - {formatTime(end)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getItemLabel(item.type)}
                      </p>
                      {item.description && (
                        <p className="text-xs mt-1">{item.description}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )
              })}

              {/* Now indicator */}
              {isTodayDate && (
                <div
                  className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                  style={{ top: getTopOffset(new Date()) }}
                >
                  <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}
