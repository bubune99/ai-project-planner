/*
 * "What is today's date for this person": the one server helper the day-based routes ask.
 *
 * Reads the stored timezone (user_settings, through preferences-store) and the clock, here and nowhere else.
 * A missing table or row, or a database that cannot be read, means no zone: the UTC date, as before the
 * setting existed. The rule itself: day.ts.
 */
import { preferencesOrNone } from "./preferences-store"
import { userDayAt, type UserDay } from "./day"

export async function userDay(userId: string, now: Date = new Date()): Promise<UserDay> {
  const { timezone } = await preferencesOrNone(userId)
  return userDayAt(timezone, now)
}
