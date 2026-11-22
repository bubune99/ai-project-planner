/*
 * Who a catalog scan belongs to.
 *
 * Every catalog row carries a user. A caller that knows the user passes it;
 * one that does not (a cron run, a webhook without a registered repo) falls
 * back to CATALOG_DEFAULT_USER_ID. With neither, the scan must stop with an
 * error that says what to set, not fail later on a null column.
 *
 * Pure: the environment is passed in.
 */

export const NO_CATALOG_USER = "No catalog user: pass userId explicitly or set CATALOG_DEFAULT_USER_ID"

export function resolveCatalogUserId(
  explicit: string | null | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const given = explicit?.trim()
  if (given) return given
  const fallback = env.CATALOG_DEFAULT_USER_ID?.trim()
  if (fallback) return fallback
  throw new Error(NO_CATALOG_USER)
}
