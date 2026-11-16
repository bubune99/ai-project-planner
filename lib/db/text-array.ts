/*
 * A list of strings for a Postgres text[] column.
 *
 * Found 2026-11-15 while pressing through the Library pages: the create routes for skills, protocols and feature
 * templates sent these lists as JSON text ('[]'), which a text[] column refuses ("malformed array literal"), so
 * creating any of the three from the app answered "Failed to create" every time. The driver writes a JavaScript
 * array as an array; that is what this returns. Pure; checked in text-array.assert.ts.
 */
export function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v) => typeof v === "string" || typeof v === "number").map((v) => String(v).trim()).filter((v) => v.length > 0)
}
