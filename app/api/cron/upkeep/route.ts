/**
 * The daily stale-card check (owner 2026-11-19, question e15d7275: "Yes, once a day, putting twins to me as
 * questions"). Called by Vercel's scheduler (vercel.json crons), which sends Authorization: Bearer $CRON_SECRET;
 * anything else is refused. Runs lib/upkeep/run-stale-check for every user who owns a project, with ask on: twins
 * become at most one question per project, never twice while one is open. Moves nothing.
 */
import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { sql } from "@/lib/db/client"
import { runStaleCheck } from "@/lib/upkeep/run-stale-check"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const want = Buffer.from(`Bearer ${secret}`)
  return given.length === want.length && timingSafeEqual(given, want)
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const owners = (await sql`SELECT DISTINCT user_id FROM projects WHERE deleted_at IS NULL AND user_id IS NOT NULL`) as { user_id: string }[]
  const runs: { runId: string; checked: number; asked: number }[] = []
  for (const o of owners) {
    try {
      const r = await runStaleCheck({ userId: String(o.user_id), ask: true, by: "daily schedule" })
      runs.push({ runId: r.runId, checked: r.checked, asked: r.asked.length })
    } catch (e) {
      console.error("[cron/upkeep] a run failed", e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ ok: true, runs })
}
