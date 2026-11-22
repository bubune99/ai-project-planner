/**
 * /api/settings/preferences: the timezone and the assistant's default model (Settings).
 *
 * GET   → what is chosen, and the two lists to choose from: the zones this server's runtime knows and the
 *         models the assistants run on. The page offers exactly these, so it cannot offer what PATCH refuses.
 * PATCH → { timezone?: string | null, defaultModel?: string | null }. null clears a choice.
 *
 * A browser session only: an API key handed to an agent does not change the owner's preferences.
 * What a value may be is decided in lib/settings/preferences.ts.
 */
import { NextRequest } from "next/server"
import { successResponse, errorResponse, ErrorCodes } from "@/lib/api-utils"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { checkRateLimit } from "@/lib/rate-limit"
import { MODELS } from "@/lib/agents/registry"
import { modelLabel, parsePatch, todayIn, type Preferences } from "@/lib/settings/preferences"
import { getPreferences, offeredModels, offeredZones, savePreferences } from "@/lib/settings/preferences-store"

export const dynamic = "force-dynamic"

const CHANGES_PER_MINUTE = 30

async function session() {
  const auth = await getAuthContext()
  if (!auth) return { error: errorResponse(ErrorCodes.UNAUTHORIZED, "Sign in to see your settings.", 401) }
  if (auth.authType !== "session") {
    return { error: errorResponse(ErrorCodes.FORBIDDEN, "Preferences are only read and changed from the Settings page while signed in.", 403) }
  }
  return { userId: auth.userId }
}

const answer = (preferences: Preferences) => successResponse({
  preferences,
  zones: offeredZones(),
  models: offeredModels(),
  /** The model the assistants run on when nothing is chosen. */
  plannerModel: { id: MODELS.main, label: modelLabel(MODELS.main) },
  /** The date the assistant treats as today right now, so the page can show it rather than work it out twice. */
  assistantToday: todayIn(preferences.timezone, new Date()),
})

export async function GET() {
  const who = await session()
  if (who.error) return who.error
  try {
    return answer(await getPreferences(who.userId))
  } catch (error) {
    console.error("[API] GET /api/settings/preferences:", error instanceof Error ? error.message : error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, "Your preferences could not be read.", 500)
  }
}

export async function PATCH(request: NextRequest) {
  const who = await session()
  if (who.error) return who.error
  if (!(await checkRateLimit(`settings-preferences:${who.userId}`, CHANGES_PER_MINUTE, 60000))) {
    return errorResponse("RATE_LIMITED", "Too many changes in a minute. Try again shortly.", 429)
  }
  const body = await request.json().catch(() => null)
  const parsed = parsePatch(body, offeredZones(), offeredModels().map((m) => m.id))
  if (!parsed.ok) return errorResponse(ErrorCodes.VALIDATION_ERROR, parsed.message, 400)
  try {
    return answer(await savePreferences(who.userId, parsed.changes))
  } catch (error) {
    console.error("[API] PATCH /api/settings/preferences:", error instanceof Error ? error.message : error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, "That choice was not saved.", 500)
  }
}
