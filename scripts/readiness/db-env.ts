/**
 * Which database a readiness script writes to. It is named on the command
 * line's environment, every time: READINESS_DATABASE_URL. The scripts never
 * read .env, so a run cannot land on the production database by default.
 */
export function useReadinessDatabase(): void {
  const url = process.env.READINESS_DATABASE_URL
  if (!url) {
    console.error("Set READINESS_DATABASE_URL to the database to write to (the staging branch's connection string, or production's when the owner has said go).")
    process.exit(2)
  }
  // lib/db/client.ts reads DATABASE_URL on first use, so this has to happen before the store is imported.
  process.env.DATABASE_URL = url
  // ...and it prefers APP_DATABASE_URL when VERCEL_ENV says preview; a script is never that.
  delete process.env.VERCEL_ENV
}
