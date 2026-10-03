"use client"

/*
 * FullScreenCalendar — adopted from 21st.dev (ahmedmayara/fullscreen-calendar).
 *
 * Written in by hand rather than installed through the shadcn CLI: that entry
 * ships its own button.tsx and separator.tsx and would have overwritten ours.
 * Ours carry the React-18 forwardRef fix and the data-slot convention, and
 * silently losing that is exactly the regression we spent a day chasing.
 *
 * Changes from the published source are marked "fork:".
 */

import * as React from "react"
import {
  add,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isEqual,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfToday,
  startOfWeek,
} from "date-fns"
import { ChevronLeftIcon, ChevronRightIcon, PlusCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useMediaQuery } from "@/hooks/use-media-query"

export interface CalendarEvent {
  id: string | number
  name: string
  time: string
  datetime: string
  /** fork: lets a caller tint an entry — we colour by step status. */
  color?: string
  /** fork: callers need the click, the published version swallowed it. */
  onClick?: () => void
}

export interface CalendarDay {
  day: Date
  events: CalendarEvent[]
}

export interface FullScreenCalendarProps {
  data: CalendarDay[]
  /** fork: the published version hard-coded a dead "New Event" button. */
  onCreate?: (day: Date) => void
  onSelectDay?: (day: Date) => void
  /**
   * fork: the published version kept the visible month entirely internal, so a
   * caller that loads data per month could never follow the arrows — you would
   * page to November and still be looking at October's data. Fires with the
   * first day of the month now shown.
   */
  onMonthChange?: (firstDayOfMonth: Date) => void
  /** fork: how many entries a desktop cell shows before "+ N more". */
  maxPerDay?: number
}

const colStartClasses = [
  "",
  "col-start-2",
  "col-start-3",
  "col-start-4",
  "col-start-5",
  "col-start-6",
  "col-start-7",
]

export function FullScreenCalendar({
  data,
  onCreate,
  onSelectDay,
  onMonthChange,
  maxPerDay = 2,
}: FullScreenCalendarProps) {
  const today = startOfToday()
  const [selectedDay, setSelectedDay] = React.useState(today)
  const [currentMonth, setCurrentMonth] = React.useState(format(today, "MMM-yyyy"))
  const firstDayCurrentMonth = parse(currentMonth, "MMM-yyyy", new Date())

  /*
    fork: the published component gates the *inner* cell markup on a 768px
    query while the container around it is `hidden lg:grid` (1024px). Between
    those widths it rendered the compact branch inside the roomy grid. Aligned
    both to lg.
  */
  const isDesktop = useMediaQuery("(min-width: 1024px)")

  const days = eachDayOfInterval({
    start: startOfWeek(firstDayCurrentMonth),
    end: endOfWeek(endOfMonth(firstDayCurrentMonth)),
  })

  const select = (day: Date) => {
    setSelectedDay(day)
    onSelectDay?.(day)
  }

  const goToMonth = (first: Date) => {
    setCurrentMonth(format(first, "MMM-yyyy"))
    onMonthChange?.(first)
  }
  const previousMonth = () => goToMonth(add(firstDayCurrentMonth, { months: -1 }))
  const nextMonth = () => goToMonth(add(firstDayCurrentMonth, { months: 1 }))
  const goToToday = () => goToMonth(parse(format(today, "MMM-yyyy"), "MMM-yyyy", new Date()))

  const eventsOn = (day: Date) =>
    data.filter((d) => isSameDay(d.day, day)).flatMap((d) => d.events)

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex flex-col space-y-4 p-4 md:flex-row md:items-center md:justify-between md:space-y-0 lg:flex-none">
        <div className="flex flex-auto">
          <div className="flex items-center gap-4">
            <div className="hidden w-20 flex-col items-center justify-center rounded-lg border bg-muted p-0.5 md:flex">
              <h1 className="p-1 text-xs uppercase text-muted-foreground">
                {format(today, "MMM")}
              </h1>
              <div className="flex w-full items-center justify-center rounded-lg border bg-background p-0.5 text-lg font-bold">
                <span>{format(today, "d")}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold text-foreground">
                {format(firstDayCurrentMonth, "MMMM, yyyy")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {format(firstDayCurrentMonth, "MMM d, yyyy")} —{" "}
                {format(endOfMonth(firstDayCurrentMonth), "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 md:flex-row md:gap-6">
          <div className="inline-flex w-full -space-x-px rounded-lg shadow-sm shadow-black/5 md:w-auto rtl:space-x-reverse">
            <Button
              onClick={previousMonth}
              className="rounded-none shadow-none first:rounded-s-lg last:rounded-e-lg focus-visible:z-10"
              variant="outline"
              size="icon"
              aria-label="Previous month"
            >
              <ChevronLeftIcon size={16} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button
              onClick={goToToday}
              className="w-full rounded-none shadow-none first:rounded-s-lg last:rounded-e-lg focus-visible:z-10 md:w-auto"
              variant="outline"
            >
              Today
            </Button>
            <Button
              onClick={nextMonth}
              className="rounded-none shadow-none first:rounded-s-lg last:rounded-e-lg focus-visible:z-10"
              variant="outline"
              size="icon"
              aria-label="Next month"
            >
              <ChevronRightIcon size={16} strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>

          {onCreate && (
            <>
              <Separator orientation="vertical" className="hidden h-6 md:block" />
              <Button className="w-full gap-2 md:w-auto" onClick={() => onCreate(selectedDay)}>
                <PlusCircleIcon size={16} strokeWidth={2} aria-hidden="true" />
                <span>New event</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Week header */}
      <div className="grid grid-cols-7 border text-center text-xs font-semibold leading-6 lg:flex-none">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
          <div key={d} className={i < 6 ? "border-r py-2.5" : "py-2.5"}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex min-h-0 flex-1 text-xs leading-6">
        {isDesktop ? (
          <div className="grid w-full auto-rows-fr grid-cols-7 border-x">
            {days.map((day, dayIdx) => {
              const events = eventsOn(day)
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => select(day)}
                  className={cn(
                    dayIdx === 0 && colStartClasses[getDay(day)],
                    !isEqual(day, selectedDay) &&
                      !isToday(day) &&
                      !isSameMonth(day, firstDayCurrentMonth) &&
                      "bg-accent/50 text-muted-foreground",
                    "relative flex min-h-24 flex-col border-b border-r hover:bg-muted focus:z-10",
                    !isEqual(day, selectedDay) && "hover:bg-accent/75",
                  )}
                >
                  <header className="flex items-center justify-between p-2.5">
                    <button
                      type="button"
                      className={cn(
                        isEqual(day, selectedDay) && "text-primary-foreground",
                        !isEqual(day, selectedDay) &&
                          !isToday(day) &&
                          isSameMonth(day, firstDayCurrentMonth) &&
                          "text-foreground",
                        !isEqual(day, selectedDay) &&
                          !isToday(day) &&
                          !isSameMonth(day, firstDayCurrentMonth) &&
                          "text-muted-foreground",
                        isEqual(day, selectedDay) && isToday(day) && "border-none bg-primary",
                        isEqual(day, selectedDay) && !isToday(day) && "bg-foreground",
                        // fork: today is now marked even when it is not selected.
                        !isEqual(day, selectedDay) && isToday(day) && "ring-1 ring-primary",
                        (isEqual(day, selectedDay) || isToday(day)) && "font-semibold",
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs hover:border",
                      )}
                    >
                      <time dateTime={format(day, "yyyy-MM-dd")}>{format(day, "d")}</time>
                    </button>
                  </header>

                  <div className="min-h-0 flex-1 space-y-1.5 px-2.5 pb-2.5">
                    {events.slice(0, maxPerDay).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          event.onClick?.()
                        }}
                        style={event.color ? { borderLeftColor: event.color } : undefined}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 rounded-md border bg-muted/50 p-1.5 text-left text-[11px] leading-tight",
                          event.color && "border-l-2",
                          event.onClick && "hover:bg-muted",
                        )}
                      >
                        <span className="line-clamp-1 font-medium leading-none">{event.name}</span>
                        {event.time && (
                          <span className="leading-none text-muted-foreground">{event.time}</span>
                        )}
                      </button>
                    ))}
                    {events.length > maxPerDay && (
                      <div className="text-[11px] text-muted-foreground">
                        + {events.length - maxPerDay} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="isolate grid w-full auto-rows-fr grid-cols-7 border-x">
            {days.map((day) => {
              const events = eventsOn(day)
              return (
                <button
                  onClick={() => select(day)}
                  key={day.toISOString()}
                  type="button"
                  className={cn(
                    isEqual(day, selectedDay) && "text-primary-foreground",
                    !isEqual(day, selectedDay) &&
                      !isToday(day) &&
                      isSameMonth(day, firstDayCurrentMonth) &&
                      "text-foreground",
                    !isEqual(day, selectedDay) &&
                      !isToday(day) &&
                      !isSameMonth(day, firstDayCurrentMonth) &&
                      "text-muted-foreground",
                    (isEqual(day, selectedDay) || isToday(day)) && "font-semibold",
                    "flex h-14 flex-col border-b border-r px-3 py-2 hover:bg-muted focus:z-10",
                  )}
                >
                  <time
                    dateTime={format(day, "yyyy-MM-dd")}
                    className={cn(
                      "ml-auto flex size-6 items-center justify-center rounded-full",
                      isEqual(day, selectedDay) && "bg-primary text-primary-foreground",
                      !isEqual(day, selectedDay) && isToday(day) && "ring-1 ring-primary",
                    )}
                  >
                    {format(day, "d")}
                  </time>
                  {events.length > 0 && (
                    <div className="-mx-0.5 mt-auto flex flex-wrap-reverse">
                      {events.slice(0, 6).map((event) => (
                        <span
                          key={event.id}
                          style={event.color ? { backgroundColor: event.color } : undefined}
                          className={cn(
                            "mx-0.5 mt-1 h-1.5 w-1.5 rounded-full",
                            !event.color && "bg-muted-foreground",
                          )}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
