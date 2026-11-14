/** Changes shown before and after: storing the two pictures, listing, and the owner's judgment. Rules are in change-model.ts. */
import { sql } from "@/lib/db/client"
import { lessons, lessonsLine, parseChange, parseVerdict, type StoredChange } from "./change-model"
import { GateError, imageType } from "./store"
import { notifyOwner } from "@/lib/notify/owner"

interface Row {
  id: string; title: string; why: string; route: string | null; check_key: string | null; stage: StoredChange["stage"]; build: string | null
  before_key: string; after_key: string; actor: "agent" | "owner"; created_at: string; verdict: "good" | "bad" | null; note: string | null; decided_at: string | null
}
const iso = (d: string | Date) => new Date(d).toISOString()

async function store(projectId: string, base64: unknown, which: "before" | "after"): Promise<string> {
  if (typeof base64 !== "string" || !base64) throw new GateError(`Send the ${which} picture`)
  const raw = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64")
  if (raw.length > 2 * 1024 * 1024) throw new GateError(`The ${which} picture is over 2 MB`)
  const type = imageType(raw)
  if (!type) throw new GateError(`The ${which} picture must be WebP, JPEG or PNG`)
  const { uploadToR2, isR2Configured } = await import("@/lib/storage/r2-client")
  if (!isR2Configured()) throw new GateError("File storage is not configured on this server")
  const key = `gates/${projectId}/changes/${crypto.randomUUID()}-${which}.${type === "jpeg" ? "jpg" : type}`
  await uploadToR2(key, raw, `image/${type}`)
  return key
}

export async function createChange(a: { projectId: string; userId: string; actor: "agent" | "owner"; raw: Record<string, unknown> }) {
  const { change, errors } = parseChange(a.raw)
  if (errors.length) throw new GateError(errors.join(". "))
  const [beforeKey, afterKey] = [await store(a.projectId, a.raw.beforeBase64, "before"), await store(a.projectId, a.raw.afterBase64, "after")]
  const [row] = (await sql`
    INSERT INTO gate_changes (project_id, title, why, route, check_key, stage, build, before_key, after_key, actor, created_by)
    VALUES (${a.projectId}, ${change.title}, ${change.why}, ${change.route ?? null}, ${change.checkKey ?? null}, ${change.stage}, ${change.build ?? null}, ${beforeKey}, ${afterKey}, ${a.actor}, ${a.userId})
    RETURNING id
  `) as { id: string }[]
  // An agent's change is for the owner to judge: tell their phone (when they turned that on).
  if (a.actor === "agent") await notifyOwner(a.userId, "change", { id: row.id, text: change.title, projectId: a.projectId })
  return { id: row.id }
}

/** The project's changes, newest first, with short-lived links to their pictures, and what the owner's judgments add up to. */
export async function listChanges(projectId: string, withPictures = true) {
  const rows = (await sql`SELECT * FROM gate_changes WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 100`) as Row[]
  const { getSignedDownloadUrl, isR2Configured } = await import("@/lib/storage/r2-client")
  const link = async (key: string) => (withPictures && isR2Configured() ? getSignedDownloadUrl(key, 3600) : null)
  const changes = await Promise.all(rows.map(async (r) => ({
    id: r.id, title: r.title, why: r.why, stage: r.stage, actor: r.actor, at: iso(r.created_at),
    ...(r.route ? { route: r.route } : {}), ...(r.check_key ? { checkKey: r.check_key } : {}), ...(r.build ? { build: r.build } : {}),
    ...(r.verdict ? { verdict: r.verdict, decidedAt: iso(r.decided_at ?? r.created_at) } : {}), ...(r.note ? { note: r.note } : {}),
    before: await link(r.before_key), after: await link(r.after_key),
  })))
  const l = lessons(changes as StoredChange[])
  return { changes, lessons: l, line: lessonsLine(l) }
}

/** The owner says whether a change was good, in their own words. Saying it again replaces what they said before. */
export async function judgeChange(projectId: string, id: string, raw: unknown) {
  const { verdict, note, errors } = parseVerdict(raw)
  if (errors.length) throw new GateError(errors.join(". "))
  const rows = (await sql`
    UPDATE gate_changes SET verdict = ${verdict}, note = ${note || null}, decided_at = now() WHERE id = ${id} AND project_id = ${projectId} RETURNING id
  `) as { id: string }[]
  if (!rows.length) throw new GateError("Change not found")
  return { ok: true }
}
