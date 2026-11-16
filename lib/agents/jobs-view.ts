/*
 * What the Agents page says about a job. Pure: no React, no clock of its own (pass `now`).
 * Checked in jobs-view.assert.ts.
 *
 * Found while checking /agents (2026-11-15): "Jobs · 24h" was the length of whatever list the filters had
 * left (up to 50, any age); a status the page had no word for was printed as its raw key
 * ("awaiting-unlock"); a job finished at 0% showed an empty progress bar; a date from another year was
 * printed without its year; and a job could not be cancelled or removed from the page at all.
 */

export interface JobLike { status: string; createdAt: string; progress?: number | null }

const LABEL: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  assigned: "Assigned",
  claimed: "Claimed",
  in_progress: "In progress",
  "awaiting-unlock": "Waiting on you",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
}

/** Statuses the page can filter by, in the order work moves through them. */
export const JOB_STATUSES = Object.keys(LABEL)

/** A word a person can read for any status, known or not. */
export function jobStatusLabel(status: string | null | undefined): string {
  const s = String(status || "").trim()
  if (!s) return "Unknown"
  if (LABEL[s]) return LABEL[s]
  const words = s.replace(/[_-]+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const TONE: Record<string, string> = {
  pending: "j-muted", queued: "j-muted", assigned: "j-info", claimed: "j-info", in_progress: "j-proj",
  "awaiting-unlock": "j-warn", completed: "j-pos", failed: "j-neg", cancelled: "j-muted",
}
export const jobStatusTone = (status: string) => TONE[status] || "j-muted"

const DAY = 24 * 60 * 60 * 1000

/** How many of these jobs were created in the 24 hours before `now`. Give it the unfiltered list. */
export function createdInLastDay(jobs: JobLike[], now: Date): number {
  const t = now.getTime()
  return jobs.filter((j) => { const c = Date.parse(j.createdAt); return Number.isFinite(c) && c <= t && t - c < DAY }).length
}

const OPEN = new Set(["pending", "queued", "assigned", "claimed", "in_progress", "awaiting-unlock"])
export const isOpenJob = (status: string) => OPEN.has(status)

/** A progress figure means something only while a job is being worked. */
export const showsProgress = (status: string) => status === "assigned" || status === "claimed" || status === "in_progress"

/** A job waiting on the owner is answered in the inbox, not cancelled from here. */
export const canCancelJob = (status: string) => isOpenJob(status) && status !== "awaiting-unlock"
/** The server removes only jobs that never started or were cancelled. */
export const canDeleteJob = (status: string) => status === "pending" || status === "cancelled"

/** Narrow a list by status and agent name; "all" leaves that column alone. */
export function filterJobs<T extends { status: string; agent?: { name: string } | null }>(jobs: T[], status: string, agent: string): T[] {
  return jobs.filter((j) => (status === "all" || j.status === status) && (agent === "all" || (agent === "unassigned" ? !j.agent : j.agent?.name === agent)))
}

/** When something happened, in words; a date from another year carries its year. */
export function whenLabel(timestamp: string | null | undefined, now: Date): string {
  if (!timestamp) return "Never"
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "Unknown"
  // A server clock a little ahead of this device's makes "now" look like the future: still "Just now".
  const raw = now.getTime() - date.getTime()
  const diff = raw < 0 && raw > -5 * 60000 ? 0 : raw
  const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / DAY)
  if (diff >= 0) {
    if (mins < 1) return "Just now"
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days === 1) return "Yesterday"
    if (days < 7) return `${days}d ago`
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })
}
