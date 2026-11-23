/**
 * What an agent is told when a tool call fails on something it sent.
 *
 * A short id passed where the database expects a full one came back as Postgres's own words,
 * 'invalid input syntax for type uuid: "2dd7fa3a"', which says nothing about what to send instead
 * (seen on get_card, 2026-11-23). Agents use 8-character card ids because the gates CLI prints them.
 */

const BAD_UUID = /invalid input syntax for type uuid: "([^"]*)"/

export function plainToolError(message: string): string {
  const bad = BAD_UUID.exec(message)
  if (bad) {
    return `"${bad[1]}" is not a full id. Ids are 36 characters, for example 2dd7fa3a-32ef-455f-8e6b-4936836d52d2; find_cards gives a card's full id.`
  }
  return message
}

/** A card id or the start of one (at least 8 hex characters, dashes allowed), as gates prints it. */
export function cardIdPrefix(value: string): string | null {
  const v = value.trim().toLowerCase()
  return /^[0-9a-f]{8}[0-9a-f-]{0,28}$/.test(v) ? v : null
}
