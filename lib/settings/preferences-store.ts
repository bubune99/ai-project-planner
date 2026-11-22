/*
 * Reads and writes the account preferences (user_settings, migration 086). What a value may be is decided in
 * preferences.ts; this file only fetches and stores. The lists every value is checked against are the
 * runtime's zones and the models the app runs on.
 */
import { sql } from "@/lib/db/client"
import { MODELS } from "@/lib/agents/registry"
import { NO_PREFERENCES, modelOptions, readPreferences, supportedZones, type ModelOption, type Preferences } from "./preferences"

export const offeredZones = (): string[] => supportedZones()
export const offeredModels = (): ModelOption[] => modelOptions(MODELS)
const modelIds = (): string[] => offeredModels().map((m) => m.id)

/** The person's preferences. Throws when the database cannot be read. */
export async function getPreferences(userId: string): Promise<Preferences> {
  const rows = (await sql`SELECT timezone, default_model FROM user_settings WHERE user_id = ${userId}`) as unknown[]
  return readPreferences(rows[0], offeredZones(), modelIds())
}

/**
 * The same, for a caller that must keep working when preferences cannot be read (the chat): nothing chosen,
 * and the reason in the server log.
 */
export async function preferencesOrNone(userId: string): Promise<Preferences> {
  try { return await getPreferences(userId) } catch (error) {
    console.error("[settings] preferences could not be read; using none:", error instanceof Error ? error.message : error)
    return NO_PREFERENCES
  }
}

/** Store the fields named in `changes` (already checked by parsePatch) and leave the others as they are. */
export async function savePreferences(userId: string, changes: Partial<Preferences>): Promise<Preferences> {
  const setZone = "timezone" in changes
  const setModel = "defaultModel" in changes
  const rows = (await sql`
    INSERT INTO user_settings (user_id, timezone, default_model)
    VALUES (${userId}, ${setZone ? changes.timezone ?? null : null}, ${setModel ? changes.defaultModel ?? null : null})
    ON CONFLICT (user_id) DO UPDATE SET
      timezone = CASE WHEN ${setZone}::boolean THEN EXCLUDED.timezone ELSE user_settings.timezone END,
      default_model = CASE WHEN ${setModel}::boolean THEN EXCLUDED.default_model ELSE user_settings.default_model END,
      updated_at = now()
    RETURNING timezone, default_model
  `) as unknown[]
  return readPreferences(rows[0], offeredZones(), modelIds())
}
