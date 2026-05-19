/**
 * Recurring service-schedule helpers.
 * Mirrors the finance recurring_frequency enum (migration 028).
 */

export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'

export const RECURRING_FREQUENCIES: RecurringFrequency[] = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
]

/**
 * Advance a date by one period of the given frequency.
 * Returns a YYYY-MM-DD string (date-only, UTC) to match the DATE column.
 */
export function advanceDate(from: Date, frequency: RecurringFrequency): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  switch (frequency) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1)
      break
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'biweekly':
      d.setUTCDate(d.getUTCDate() + 14)
      break
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() + 1)
      break
    case 'quarterly':
      d.setUTCMonth(d.getUTCMonth() + 3)
      break
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1)
      break
  }
  return d.toISOString().slice(0, 10)
}

export function isValidFrequency(value: unknown): value is RecurringFrequency {
  return typeof value === 'string' && RECURRING_FREQUENCIES.includes(value as RecurringFrequency)
}
