/*
 * What day it is for a person, and the windows counted from that day.
 *
 * Pure: no database, no clock (the instant is passed in). A day is a calendar date, "YYYY-MM-DD", in the
 * person's stored timezone. With no zone stored it is the UTC date, which is what the database's CURRENT_DATE
 * gives (the connection sets no timezone, so Postgres on Neon runs in UTC), so a route that takes its day
 * from here answers exactly as it did for someone who has not chosen a zone.
 *
 * The server side that reads the stored zone and the clock: user-day.ts. Checks: day.assert.ts.
 */
import { supportedZones, todayIn } from "./preferences"

export interface UserDay {
  /** The person's calendar date, YYYY-MM-DD. */
  today: string
  /** The zone it was worked out in; null when none is stored (or the stored one is not known) and UTC was used. */
  zone: string | null
}

/** The day an instant falls on in `zone` (UTC when there is none): for grouping a list by day. */
export const dayIn = (zone: string | null, instant: Date): string => todayIn(zone, instant)

/** The person's day at `instant`. A zone this runtime does not know counts as none. */
export function userDayAt(storedZone: string | null | undefined, instant: Date): UserDay {
  const zone = storedZone && supportedZones().includes(storedZone) ? storedZone : null
  return { today: todayIn(zone, instant), zone }
}

/** A day as [year, month, date] numbers; refuses anything that is not a real YYYY-MM-DD date. */
function parts(day: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  const y = m ? Number(m[1]) : NaN, mo = m ? Number(m[2]) : NaN, d = m ? Number(m[3]) : NaN
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (!m || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) {
    throw new Error(`A day must be a real date written YYYY-MM-DD, not "${day}"`)
  }
  return [y, mo, d]
}

const iso = (y: number, monthIndex: number, d: number): string => new Date(Date.UTC(y, monthIndex, d)).toISOString().slice(0, 10)

/** The day `n` calendar days after `day` (before it when negative). */
export function addDays(day: string, n: number): string {
  if (!Number.isInteger(n)) throw new Error("addDays needs a whole number of days")
  const [y, mo, d] = parts(day)
  return iso(y, mo - 1, d + n)
}

/** The month `day` is in: its first day, and the first day of the next month (which is not part of it). */
export function monthWindow(day: string): { start: string; end: string } {
  const [y, mo] = parts(day)
  return { start: iso(y, mo - 1, 1), end: iso(y, mo, 1) }
}
