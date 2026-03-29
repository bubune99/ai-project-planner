"use client"

import { cn } from "@/lib/utils"
import type { CalendarAgendaItem } from "@/lib/types"
import {
  getMonthGrid,
  isSameDay,
  isToday,
  groupByDate,
  getItemColor,
  getItemLabel,
} from "./calendar-utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface CalendarMonthViewProps {
  year: number
  month: number
  items: CalendarAgendaItem[]
  onDayClick: (date: Date) => void
  selectedDate: Date
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MAX_VISIBLE_ITEMS = 3

export function CalendarMonthView({
  year,
  month,
  items,
  onDayClick,
  selectedDate,
}: CalendarMonthViewProps) {
  const weeks = getMonthGrid(year, month)
  const itemsByDate = groupByDate(items)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {DAY_NAMES.map((name) => (
            <div
              key={name}
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              {name}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((day) => {
              const dateKey = day.toISOString().split("T")[0]
              const dayItems = itemsByDate[dateKey] ?? []
              const isCurrentMonth = day.getMonth() === month
              const isSelected = isSameDay(day, selectedDate)
              const isTodayDate = isToday(day)

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => onDayClick(day)}
                  className={cn(
                    "relative min-h-[100px] p-1.5 text-left border-r border-border last:border-r-0 transition-colors hover:bg-accent/50",
                    !isCurrentMonth && "bg-muted/20",
                    isSelected && "bg-accent/30"
                  )}
                >
                  {/* Day number */}
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm",
                      isTodayDate && "bg-primary text-primary-foreground font-semibold",
                      !isTodayDate && isCurrentMonth && "text-foreground",
                      !isTodayDate && !isCurrentMonth && "text-muted-foreground/50"
                    )}
                  >
                    {day.getDate()}
                  </span>

                  {/* Items */}
                  <div className="mt-0.5 space-y-0.5">
                    {dayItems.slice(0, MAX_VISIBLE_ITEMS).map((item) => (
                      <Tooltip key={item.id}>
                        <TooltipTrigger asChild>
                          <div
                            className="truncate rounded px-1.5 py-0.5 text-[11px] leading-tight text-white cursor-default"
                            style={{ backgroundColor: getItemColor(item) }}
                          >
                            {item.title}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px]">
                          <p className="font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {getItemLabel(item.type)}
                            {item.description ? ` - ${item.description}` : ""}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {dayItems.length > MAX_VISIBLE_ITEMS && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{dayItems.length - MAX_VISIBLE_ITEMS} more
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </TooltipProvider>
  )
}
