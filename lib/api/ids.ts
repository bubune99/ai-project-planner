/**
 * Is this text shaped like one of our ids?
 *
 * Every row id in this app is a Postgres uuid. An id that arrives in a path and is not shaped
 * like one can never name a row, and the database refuses it outright ("invalid input syntax for
 * type uuid"), which a route's catch then reports as a failure of ours. A route asks this first
 * and answers with its own not-found sentence instead.
 *
 * Pure. Same pattern text the routes already carried one by one.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v)
