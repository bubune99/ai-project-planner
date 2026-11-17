/**
 * Which environment's half of the shared Redis a key lives in (security check C3, card 5fef50d8).
 *
 * Production and preview point at the same Upstash store (KV_* / REDIS_URL are set alike in both), and the
 * staging database is a copy of production, so the same conversation ids exist in both. Without this a staging
 * chat on a copied conversation would delete and rewrite production's cached messages (ai:messages:<id>).
 * Production keys are unchanged, so nothing cached there is lost; every other environment gets its own prefix.
 * Pure (check file: redis-key.assert.ts).
 */
export function scopedKey(key: string, vercelEnv: string | undefined = process.env.VERCEL_ENV): string {
  if (vercelEnv === "production") return key
  const env = (vercelEnv || "local").replace(/[^a-z0-9_-]/gi, "")
  return `${env || "local"}:${key}`
}
