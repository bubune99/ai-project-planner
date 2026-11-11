/**
 * Screenshot cleanup for flow frames (owner's retention rule; the rule
 * itself is the pure framesToExpire in flow-model.ts). Deletes the R2 objects,
 * then soft-deletes the rows. No cron: like the rate-limit counters, it runs as a
 * side effect (after flow_attach_frame, for that flow) and on demand
 * (flow_prune_frames, one flow or a whole project).
 */
import { sql } from "@/lib/db/client"
import { framesToExpire, type Frame } from "./flow-model"

interface FrameRow {
  id: string
  document_id: string
  step: string
  kind: Frame["kind"]
  env: "staging" | "prod" | null
  captured_at: string
  passed: boolean | null
  open_finding: boolean
  finding_resolved_at: string | null
  pinned: boolean
  blob_key: string | null
}

export async function sweepFlowFrames(
  now: Date,
  scope: { documentId?: string; projectId?: string } = {},
): Promise<{ checked: number; expired: number; bytesFreed: number }> {
  const rows = (await sql`
    SELECT id, document_id, step, kind, env, captured_at, passed, open_finding, finding_resolved_at, pinned, blob_key
    FROM flow_frames
    WHERE deleted_at IS NULL AND kind = 'screenshot'
      AND (${scope.documentId ?? null}::uuid IS NULL OR document_id = ${scope.documentId ?? null}::uuid)
      AND (${scope.projectId ?? null}::uuid IS NULL OR project_id = ${scope.projectId ?? null}::uuid)
  `) as FrameRow[]
  // The rule is per flow document: group, then apply.
  const byDoc = new Map<string, FrameRow[]>()
  for (const r of rows) byDoc.set(r.document_id, [...(byDoc.get(r.document_id) ?? []), r])
  const expire: FrameRow[] = []
  for (const list of byDoc.values()) {
    const ids = new Set(
      framesToExpire(
        list.map((r) => ({
          id: r.id,
          step: r.step,
          kind: r.kind,
          env: r.env ?? undefined,
          capturedAt: new Date(r.captured_at).toISOString(),
          passed: r.passed ?? undefined,
          openFinding: r.open_finding,
          findingResolvedAt: r.finding_resolved_at ? new Date(r.finding_resolved_at).toISOString() : undefined,
          pinned: r.pinned,
        })),
        now,
      ),
    )
    expire.push(...list.filter((r) => ids.has(r.id)))
  }
  if (!expire.length) return { checked: rows.length, expired: 0, bytesFreed: 0 }
  const keys = expire.map((r) => r.blob_key).filter((k): k is string => Boolean(k))
  if (keys.length) {
    const { deleteMultipleFromR2 } = await import("@/lib/storage/r2-client")
    for (let i = 0; i < keys.length; i += 500) await deleteMultipleFromR2(keys.slice(i, i + 500))
  }
  const ids = expire.map((r) => r.id)
  const [freed] = (await sql`
    WITH gone AS (
      UPDATE flow_frames SET deleted_at = now() WHERE id = ANY(${ids}::uuid[]) RETURNING byte_size
    ) SELECT COALESCE(SUM(byte_size), 0)::int AS bytes FROM gone
  `) as { bytes: number }[]
  return { checked: rows.length, expired: ids.length, bytesFreed: freed.bytes }
}
