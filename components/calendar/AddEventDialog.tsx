"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import type { CalendarCategory } from "@/lib/types"

interface AddEventDialogProps {
  open: boolean
  onClose: () => void
  onSave: (event: NewEventPayload) => Promise<void>
  categories: CalendarCategory[]
  defaultDate?: Date
}

export interface NewEventPayload {
  title: string
  description?: string
  startTime: string
  endTime?: string
  isAllDay: boolean
  categoryId?: string
  color?: string
}

const PRESET_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#eab308",
]

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toLocalDateString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function AddEventDialog({
  open,
  onClose,
  onSave,
  categories,
  defaultDate,
}: AddEventDialogProps) {
  const now = defaultDate ?? new Date()
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isAllDay, setIsAllDay] = useState(false)
  const [startDate, setStartDate] = useState(toLocalDateString(now))
  const [startTime, setStartTime] = useState(toLocalDatetimeString(now))
  const [endTime, setEndTime] = useState(toLocalDatetimeString(oneHourLater))
  const [categoryId, setCategoryId] = useState("")
  const [color, setColor] = useState("#3b82f6")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const resetForm = () => {
    setTitle("")
    setDescription("")
    setIsAllDay(false)
    setStartDate(toLocalDateString(now))
    setStartTime(toLocalDatetimeString(now))
    setEndTime(toLocalDatetimeString(oneHourLater))
    setCategoryId("")
    setColor("#3b82f6")
    setError("")
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required")
      return
    }

    setIsSaving(true)
    setError("")

    try {
      const payload: NewEventPayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        startTime: isAllDay ? new Date(startDate + "T00:00:00").toISOString() : new Date(startTime).toISOString(),
        endTime: isAllDay ? undefined : new Date(endTime).toISOString(),
        isAllDay,
        categoryId: categoryId || undefined,
        color,
      }
      await onSave(payload)
      resetForm()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event")
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add Event</DialogTitle>
          <DialogDescription>Create a new calendar event.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="event-desc">Description</Label>
            <Textarea
              id="event-desc"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* All Day toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="all-day"
              checked={isAllDay}
              onCheckedChange={(v) => setIsAllDay(v === true)}
            />
            <Label htmlFor="all-day" className="cursor-pointer">
              All day event
            </Label>
          </div>

          {/* Date/Time inputs */}
          {isAllDay ? (
            <div className="space-y-2">
              <Label htmlFor="event-date">Date</Label>
              <Input
                id="event-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event-start">Start</Label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">End</Label>
                <Input
                  id="event-end"
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Category */}
          {categories.length > 0 && (
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: cat.color ?? "#6b7280" }}
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Color */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: c === color ? "white" : "transparent",
                    boxShadow: c === color ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
