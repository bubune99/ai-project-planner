/**
 * Flow-first planning tools (flow contract v0.1, planner doc d56f1a28).
 * A flow lives in a planner document as one ```flow JSON block; all logic is in
 * lib/flows/flow-model.ts (pure, asserted). This file only does access checks
 * and SQL.
 *
 * Merging a branch is the owner's decision. Agents use the owner's own API key,
 * so "who is calling" cannot tell them apart; instead flow_merge requires an
 * inbox question (flow_request_merge) that the owner answered "Merge".
 *
 * Wire-up: registerFlowTools(server) in registerPlannerTools.
 */

import { z } from "zod"
import { sql } from "@/lib/db/client"
import { getMcpUserId, requireMcpScope, requireMcpProjectWriteAccess, verifyMcpProjectAccess } from "@/lib/auth/mcp-context"
import { buildQuestionInput } from "@/lib/inbox"
import {
  parseFlowBlock,
  writeFlowBlock,
  validateFlow,
  branchFlow,
  diffFlows,
  mergeFlow,
  checkTransitions,
  type Flow,
  type ObservedClick,
} from "@/lib/flows/flow-model"

const MERGE_OPTION = "Merge"
const REJECT_OPTION = "Reject"

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true }
}

interface DocRow {
  id: string
  project_id: string
  title: string
  content: string | null
  blob_key: string | null
}

async function loadDoc(documentId: string, needWrite: boolean): Promise<DocRow | string> {
  const [doc] = (await sql`
    SELECT id, project_id, title, content, blob_key FROM documents
    WHERE id = ${documentId} AND deleted_at IS NULL
  `) as DocRow[]
  if (!doc) return "Document not found or access denied"
  if (needWrite) {
    try {
      await requireMcpProjectWriteAccess(doc.project_id)
    } catch (e) {
      const reason = e instanceof Error ? e.message : ""
      return reason.includes("view-only") ? reason : "Document not found or access denied"
    }
  } else {
    const access = await verifyMcpProjectAccess(doc.project_id)
    if (!access.hasAccess) return "Document not found or access denied"
  }
  if (doc.blob_key) return "This document is an uploaded file, not a flow"
  return doc
}

async function loadFlow(documentId: string, needWrite: boolean): Promise<{ doc: DocRow; flow: Flow } | string> {
  const doc = await loadDoc(documentId, needWrite)
  if (typeof doc === "string") return doc
  let flow: Flow | null
  try {
    flow = parseFlowBlock(doc.content ?? "")
  } catch {
    return "The document's flow block is not valid JSON"
  }
  if (!flow) return "This document has no ```flow block"
  return { doc, flow }
}

async function saveBody(doc: DocRow, body: string, userId: string): Promise<void> {
  // The version trigger (migration 054) snapshots the previous body.
  await sql`
    UPDATE documents SET content = ${body}, file_size = ${Buffer.byteLength(body, "utf8")}, last_edited_by = ${userId}
    WHERE id = ${doc.id} AND deleted_at IS NULL
  `
}

const errorsOf = (flow: Flow) => validateFlow(flow).filter((i) => i.level === "error")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerFlowTools(server: any): void {
  server.tool(
    "flow_get",
    "Read a flow (user journey) from a planner document's ```flow block: steps with ids like G3, who acts, the screen, and where each button leads. Returns contract issues too (errors block saving; warnings block marking it settled).",
    { documentId: z.string().describe("The flow document id") },
    async ({ documentId }: { documentId: string }) => {
      try {
        requireMcpScope("read")
        const r = await loadFlow(documentId, false)
        if (typeof r === "string") return fail(r)
        return ok({ title: r.doc.title, flow: r.flow, issues: validateFlow(r.flow) })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_save",
    "Replace a DRAFT or branch flow's ```flow block (keeps the prose around it). Refused on a main flow that is settled or later: propose a change with flow_branch instead. Contract errors (unknown step, wrong id prefix, reused retired id) are refused.",
    {
      documentId: z.string(),
      flow: z.record(z.unknown()).describe("The whole flow object (id, version, status, actors, steps, retired?, branch?)"),
    },
    async ({ documentId, flow }: { documentId: string; flow: Flow }) => {
      try {
        requireMcpScope("write")
        const userId = getMcpUserId()
        const r = await loadFlow(documentId, true)
        if (typeof r === "string") return fail(r)
        if (!r.flow.branch && r.flow.status !== "draft") {
          return fail(`This is main (${r.flow.id}@${r.flow.version}, ${r.flow.status}). Use flow_branch to propose a change; only the owner merges.`)
        }
        if (flow.id !== r.flow.id) return fail("flow.id cannot change")
        const errors = errorsOf(flow)
        if (errors.length) return fail(`Contract errors: ${errors.map((i) => `${i.where}: ${i.message}`).join("; ")}`)
        await saveBody(r.doc, writeFlowBlock(r.doc.content ?? "", { ...flow, branch: r.flow.branch }), userId)
        return ok({ saved: true, issues: validateFlow(flow) })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_branch",
    "Propose a change to a flow: copies the main flow document into a new branch document (title 'Flow <id>~<key>') that you can edit with flow_save. Main is untouched until the owner merges.",
    {
      documentId: z.string().describe("The main flow document"),
      key: z.string().describe("Branch key, lowercase-with-dashes, e.g. lock-price"),
      why: z.string().describe("Why this change is proposed (kept as history)"),
    },
    async ({ documentId, key, why }: { documentId: string; key: string; why: string }) => {
      try {
        requireMcpScope("write")
        const userId = getMcpUserId()
        const r = await loadFlow(documentId, true)
        if (typeof r === "string") return fail(r)
        if (r.flow.branch) return fail("Branch from main, not from another branch")
        const b = branchFlow(r.flow, key)
        const body = writeFlowBlock(
          `# Flow \`${r.flow.id}~${key}\` (proposal)\n\nBranched from \`${r.flow.id}@${r.flow.version}\` (doc ${r.doc.id}).\n\n**Why:** ${why}\n`,
          b,
        )
        const [doc] = (await sql`
          INSERT INTO documents(project_id, title, content, category, doc_type, blob_key, file_type, file_size, user_id)
          VALUES(${r.doc.project_id}, ${`Flow ${r.flow.id}~${key} (proposal)`}, ${body}, 'flows/branches', 'requirements', NULL, 'text/markdown', ${Buffer.byteLength(body, "utf8")}, ${userId})
          RETURNING id
        `) as { id: string }[]
        return ok({ branchDocumentId: doc.id, next_actions: ["Edit with flow_save, then flow_request_merge to ask the owner."] })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_diff",
    "What a branch changes compared with main: steps added, removed, and changed (with the fields that changed).",
    { mainDocumentId: z.string(), branchDocumentId: z.string() },
    async ({ mainDocumentId, branchDocumentId }: { mainDocumentId: string; branchDocumentId: string }) => {
      try {
        requireMcpScope("read")
        const m = await loadFlow(mainDocumentId, false)
        if (typeof m === "string") return fail(m)
        const b = await loadFlow(branchDocumentId, false)
        if (typeof b === "string") return fail(b)
        if (b.flow.id !== m.flow.id) return fail("These documents are different flows")
        return ok({ diff: diffFlows(m.flow, b.flow), branchIssues: validateFlow(b.flow) })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_request_merge",
    "Ask the owner (inbox, one tap) whether to merge a branch into its main flow. Returns a questionId for flow_merge. Refused while the branch has contract errors.",
    { mainDocumentId: z.string(), branchDocumentId: z.string(), askedBy: z.string().optional() },
    async ({ mainDocumentId, branchDocumentId, askedBy }: { mainDocumentId: string; branchDocumentId: string; askedBy?: string }) => {
      try {
        requireMcpScope("write")
        const userId = getMcpUserId()
        const m = await loadFlow(mainDocumentId, true)
        if (typeof m === "string") return fail(m)
        const b = await loadFlow(branchDocumentId, true)
        if (typeof b === "string") return fail(b)
        if (b.flow.id !== m.flow.id || !b.flow.branch) return fail("Not a branch of this flow")
        const errors = errorsOf(b.flow)
        if (errors.length) return fail(`Fix contract errors first: ${errors.map((i) => `${i.where}: ${i.message}`).join("; ")}`)
        const d = diffFlows(m.flow, b.flow)
        const summary = [
          d.added.length ? `adds ${d.added.join(", ")}` : "",
          d.removed.length ? `removes ${d.removed.join(", ")}` : "",
          d.changed.length ? `changes ${d.changed.map((c) => `${c.id} (${c.fields.join(", ")})`).join("; ")}` : "",
        ].filter(Boolean).join("; ") || "no step changes"
        const built = buildQuestionInput({
          question: `Merge "${b.flow.branch}" into ${m.flow.id}?`,
          options: [MERGE_OPTION, REJECT_OPTION],
          context: `It ${summary}. Proposal doc: ${b.doc.title}. [flow-merge:${m.doc.id}:${b.doc.id}]`,
          projectId: m.doc.project_id,
        })
        if (!built.ok) return fail(built.error)
        const [job] = (await sql`
          INSERT INTO agent_jobs (title, description, created_by, assigned_to, status, priority, input, tags, parent_step_id, unlock_prompt)
          VALUES (${built.value.question.slice(0, 255)}, ${built.value.input.context}, ${userId}, ${askedBy ?? "mcp-client"},
            'awaiting-unlock', 'normal', ${JSON.stringify(built.value.input)}::jsonb, ARRAY['question','flow-merge'], NULL, ${built.value.question})
          RETURNING id
        `) as { id: string }[]
        return ok({ questionId: job.id, summary, next_actions: [`When answered "${MERGE_OPTION}", call flow_merge with this questionId.`] })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_merge",
    `Merge a branch into main after the owner answered "${MERGE_OPTION}" to its flow_request_merge question. Bumps the version, retires removed step ids, records the history on both documents. A "${REJECT_OPTION}" answer closes the branch instead.`,
    { mainDocumentId: z.string(), branchDocumentId: z.string(), questionId: z.string() },
    async ({ mainDocumentId, branchDocumentId, questionId }: { mainDocumentId: string; branchDocumentId: string; questionId: string }) => {
      try {
        requireMcpScope("write")
        const userId = getMcpUserId()
        const m = await loadFlow(mainDocumentId, true)
        if (typeof m === "string") return fail(m)
        const b = await loadFlow(branchDocumentId, true)
        if (typeof b === "string") return fail(b)
        const [job] = (await sql`
          SELECT status, result, input FROM agent_jobs
          WHERE id = ${questionId} AND created_by = ${userId} AND 'flow-merge' = ANY(tags)
        `) as { status: string; result: unknown; input: unknown }[]
        if (!job) return fail("Merge question not found")
        const marker = `[flow-merge:${mainDocumentId}:${branchDocumentId}]`
        if (!String((job.input as { context?: string })?.context ?? "").includes(marker)) return fail("That question is about a different merge")
        if (job.status === "awaiting-unlock") return fail("The owner has not answered yet")
        const option = (job.result as { answer?: { option?: string | null } } | null)?.answer?.option ?? null
        const today = new Date().toISOString().slice(0, 10)
        if (option !== MERGE_OPTION) {
          await saveBody(b.doc, `${(b.doc.content ?? "").replace(/\s+$/, "")}\n\n**Rejected by the owner ${today}.** Kept for history.\n`, userId)
          await sql`UPDATE documents SET category = 'flows/rejected' WHERE id = ${b.doc.id}`
          return ok({ merged: false, closed: true })
        }
        const merged = mergeFlow(m.flow, b.flow)
        const history = `\n\n- \`~${b.flow.branch}\` merged ${today} as @${merged.version} (proposal doc ${b.doc.id}).`
        await saveBody(m.doc, writeFlowBlock(`${(m.doc.content ?? "").replace(/\s+$/, "")}${history}`, merged), userId)
        await saveBody(b.doc, `${(b.doc.content ?? "").replace(/\s+$/, "")}\n\n**Merged by the owner ${today} as @${merged.version}.**\n`, userId)
        await sql`UPDATE documents SET category = 'flows/merged' WHERE id = ${b.doc.id}`
        return ok({ merged: true, version: merged.version, retired: merged.retired ?? [] })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_check_run",
    "Compare a verification walk with a flow: for each button clicked, which step it landed on (null if nothing happened). Returns pass/fail per button (wrong destination, dead button, not in flow, not found on screen) and appends a short run record to the flow document.",
    {
      documentId: z.string(),
      env: z.enum(["staging", "prod"]),
      build: z.string().describe("Deploy id or commit tested"),
      observed: z.array(z.object({ step: z.string(), trigger: z.string(), landedOn: z.string().nullable() })),
    },
    async ({ documentId, env, build, observed }: { documentId: string; env: "staging" | "prod"; build: string; observed: ObservedClick[] }) => {
      try {
        requireMcpScope("write")
        const userId = getMcpUserId()
        const r = await loadFlow(documentId, true)
        if (typeof r === "string") return fail(r)
        const results = checkTransitions(r.flow, observed)
        const failed = results.filter((x) => !x.ok)
        const line = `\n\n- Run ${new Date().toISOString().slice(0, 16)} · ${env} · ${build} · @${r.flow.version}: ${results.length - failed.length}/${results.length} passed${failed.length ? ` · failed: ${failed.map((f) => `${f.step} "${f.trigger}" (${f.problem})`).join("; ")}` : ""}`
        await saveBody(r.doc, `${(r.doc.content ?? "").replace(/\s+$/, "")}${line}\n`, userId)
        let runId: string | null = null
        try {
          const [run] = (await sql`
            INSERT INTO flow_runs (project_id, document_id, flow_id, flow_version, env, build, passed, total, results, created_by)
            VALUES (${r.doc.project_id}, ${r.doc.id}, ${r.flow.id}, ${r.flow.version}, ${env}, ${build},
              ${results.length - failed.length}, ${results.length}, ${JSON.stringify(results)}::jsonb, ${userId})
            RETURNING id
          `) as { id: string }[]
          runId = run.id
        } catch (e) {
          // Before migration 062 the table doesn't exist; the document line is the record.
          if (!(e instanceof Error && /flow_runs/.test(e.message))) throw e
        }
        return ok({ runId, passed: results.length - failed.length, total: results.length, results, next_actions: runId ? ["Attach a screenshot per step with flow_attach_frame (runId, passed)."] : [] })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_attach_frame",
    "Attach a frame to a flow step: a screenshot (WebP or JPEG preferred, PNG accepted; base64), or a link to a mock-up/wireframe, or words. Screenshots from a verification run pass runId + passed so the retention rule can keep the latest passing one per step and environment.",
    {
      documentId: z.string(),
      step: z.string().describe("Step id, e.g. G3"),
      kind: z.enum(["words", "wireframe", "mockup", "screenshot"]),
      imageBase64: z.string().optional().describe("Image bytes, base64 (no data: prefix). Max 4 MB."),
      url: z.string().url().optional().describe("Link to a mock-up/wireframe instead of uploading"),
      caption: z.string().optional(),
      env: z.enum(["staging", "prod"]).optional(),
      build: z.string().optional(),
      runId: z.string().optional(),
      passed: z.boolean().optional(),
    },
    async (a: { documentId: string; step: string; kind: "words" | "wireframe" | "mockup" | "screenshot"; imageBase64?: string; url?: string; caption?: string; env?: "staging" | "prod"; build?: string; runId?: string; passed?: boolean }) => {
      try {
        requireMcpScope("write")
        const userId = getMcpUserId()
        const r = await loadFlow(a.documentId, true)
        if (typeof r === "string") return fail(r)
        if (!r.flow.steps.some((s) => s.id === a.step)) return fail(`Step ${a.step} is not in ${r.flow.id}@${r.flow.version}`)
        if (a.kind === "screenshot" && !a.imageBase64) return fail("A screenshot needs imageBase64")
        if (a.kind !== "words" && !a.imageBase64 && !a.url) return fail("Pass imageBase64 or url")
        let blobKey: string | null = null
        let byteSize: number | null = null
        if (a.imageBase64) {
          const raw = Buffer.from(a.imageBase64, "base64")
          if (raw.length > 4 * 1024 * 1024) return fail("Image is over 4 MB")
          // Callers send WebP or JPEG where they can (Field Trip captures can be WebP); PNG is accepted as-is.
          const type =
            raw.subarray(0, 4).toString("ascii") === "RIFF" && raw.subarray(8, 12).toString("ascii") === "WEBP" ? "webp"
            : raw[0] === 0xff && raw[1] === 0xd8 ? "jpeg"
            : raw.subarray(1, 4).toString("ascii") === "PNG" ? "png"
            : null
          if (!type) return fail("Image must be WebP, JPEG or PNG")
          const { uploadToR2, isR2Configured } = await import("@/lib/storage/r2-client")
          if (!isR2Configured()) return fail("File storage is not configured on this server")
          blobKey = `flows/${r.doc.project_id}/${r.doc.id}/${crypto.randomUUID()}.${type === "jpeg" ? "jpg" : type}`
          await uploadToR2(blobKey, raw, `image/${type}`)
          byteSize = raw.length
        }
        const [frame] = (await sql`
          INSERT INTO flow_frames (project_id, document_id, flow_id, flow_version, step, kind, env, build, run_id, blob_key, url, caption, passed, open_finding, byte_size, created_by)
          VALUES (${r.doc.project_id}, ${r.doc.id}, ${r.flow.id}, ${r.flow.version}, ${a.step}, ${a.kind}, ${a.env ?? null}, ${a.build ?? null},
            ${a.runId ?? null}, ${blobKey}, ${a.url ?? null}, ${a.caption ?? null}, ${a.passed ?? null}, ${a.passed === false}, ${byteSize}, ${userId})
          RETURNING id
        `) as { id: string }[]
        let swept = null
        try {
          const { sweepFlowFrames } = await import("@/lib/flows/sweep")
          swept = await sweepFlowFrames(new Date(), { documentId: r.doc.id })
        } catch {
          // Cleanup is best-effort; the frame is saved either way.
        }
        return ok({ frameId: frame.id, stored: blobKey ? "image" : a.url ? "link" : "words", byteSize, swept })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_frames",
    "List a flow's frames per step, newest first, with the best frame per step marked (latest passing screenshot, else newest mock-up/wireframe, else words). Image links are short-lived signed URLs.",
    { documentId: z.string(), step: z.string().optional() },
    async ({ documentId, step }: { documentId: string; step?: string }) => {
      try {
        requireMcpScope("read")
        const r = await loadFlow(documentId, false)
        if (typeof r === "string") return fail(r)
        const rows = (await sql`
          SELECT id, step, kind, env, build, run_id, blob_key, url, caption, passed, open_finding, pinned, byte_size, captured_at
          FROM flow_frames WHERE document_id = ${documentId} AND deleted_at IS NULL
            AND (${step ?? null}::text IS NULL OR step = ${step ?? null})
          ORDER BY step, captured_at DESC
        `) as { id: string; step: string; kind: string; passed: boolean | null; blob_key: string | null; url: string | null; captured_at: string }[]
        const { getSignedDownloadUrl } = await import("@/lib/storage/r2-client")
        const rank = (f: (typeof rows)[number]) => (f.kind === "screenshot" && f.passed ? 3 : f.kind === "mockup" ? 2 : f.kind === "wireframe" ? 1 : 0)
        const best = new Map<string, string>()
        for (const f of rows) {
          const cur = rows.find((x) => x.id === best.get(f.step))
          if (!cur || rank(f) > rank(cur)) best.set(f.step, f.id)
        }
        const frames = await Promise.all(
          rows.map(async (f) => ({ ...f, best: best.get(f.step) === f.id, imageUrl: f.blob_key ? await getSignedDownloadUrl(f.blob_key, 3600) : f.url })),
        )
        return ok({ flow: `${r.flow.id}@${r.flow.version}`, steps: r.flow.steps.map((s) => s.id), frames })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_update_frame",
    "Pin a frame for training (kept until unpinned), or mark a failure's finding resolved (it then expires 14 days later).",
    { frameId: z.string(), pinned: z.boolean().optional(), findingResolved: z.boolean().optional() },
    async ({ frameId, pinned, findingResolved }: { frameId: string; pinned?: boolean; findingResolved?: boolean }) => {
      try {
        requireMcpScope("write")
        const [f] = (await sql`SELECT document_id FROM flow_frames WHERE id = ${frameId} AND deleted_at IS NULL`) as { document_id: string }[]
        if (!f) return fail("Frame not found")
        const r = await loadFlow(f.document_id, true)
        if (typeof r === "string") return fail(r)
        await sql`
          UPDATE flow_frames SET
            pinned = COALESCE(${pinned ?? null}, pinned),
            open_finding = CASE WHEN ${findingResolved ?? null}::boolean IS TRUE THEN false ELSE open_finding END,
            finding_resolved_at = CASE WHEN ${findingResolved ?? null}::boolean IS TRUE THEN now() ELSE finding_resolved_at END
          WHERE id = ${frameId}
        `
        return ok({ updated: true })
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )

  server.tool(
    "flow_prune_frames",
    "Apply the screenshot retention rule now, for one flow or a whole project: keeps the latest passing screenshot per step and environment, failures until resolved + 14 days, pinned frames; deletes other screenshots older than 30 days. Returns how many were removed and the space freed.",
    { documentId: z.string().optional(), projectId: z.string().optional() },
    async ({ documentId, projectId }: { documentId?: string; projectId?: string }) => {
      try {
        requireMcpScope("write")
        if (!documentId && !projectId) return fail("Pass documentId or projectId")
        if (documentId) {
          const r = await loadFlow(documentId, true)
          if (typeof r === "string") return fail(r)
        } else {
          await requireMcpProjectWriteAccess(projectId as string)
        }
        const { sweepFlowFrames } = await import("@/lib/flows/sweep")
        return ok(await sweepFlowFrames(new Date(), { documentId, projectId }))
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Unknown error")
      }
    },
  )
}
