/**
 * Checks tools: the page checklist an agent must clear before it may call a
 * screen done. Rules are in lib/gates/gate-model.ts (pure, asserted); SQL and
 * file storage are in lib/gates/store.ts. This file only does access checks.
 *
 * Agents use the owner's own API key, so they cannot act as the owner here:
 * waiving a check and settling a dispute happen in the planner's Checks tab.
 *
 * Wire-up: registerGateTools(server) in registerPlannerTools.
 */
import { z } from "zod"
import { getMcpUserId, requireMcpProjectWriteAccess, requireMcpScope, verifyMcpProjectAccess } from "@/lib/auth/mcp-context"
import { attachImage, getChecklist, listPages, loadPage, recordResults, saveChecklist, sweepGateImages, type ChecklistRow } from "@/lib/gates/store"
import { loadPlan, proposePlanChange, seedPlan } from "@/lib/gates/plan-store"
import { listGuides, saveGuide } from "@/lib/gates/guide-store"

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true }
}
const reason = (e: unknown) => (e instanceof Error ? e.message : "Unknown error")

const stepSchema = z.object({
  do: z.string(), expect: z.string(),
  there: z.array(z.string()).optional().describe("What must be in the picture after this step"),
  gone: z.array(z.string()).optional().describe("What must be gone from the picture after this step"),
})
const controlSchema = z.object({
  n: z.number().int().describe("Number shown on the picture; unique in the checklist"),
  label: z.string(), kind: z.string().describe("Button, Link, Field, Tab ..."),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  shared: z.boolean().optional().describe("True when the control is on every page, so one pass covers them all"),
  draft: z.boolean().optional().describe("True while its workflows are the scanner's guesses; written criteria are never overwritten by drafts"),
  issues: z.array(z.string()).optional().describe("What is wrong with the control itself (no name, covered, too small, dead link). Each becomes a failed check"),
  states: z.array(z.string()).describe("Each workflow is checked once per state, e.g. Dark theme, Phone width"),
  workflows: z.array(z.object({ name: z.string(), before: z.string().optional(), steps: z.array(stepSchema) })),
})
const viewSchema = z.object({
  key: z.string().describe("page, or a short key for what opened: menu, search, delete-dialog"),
  name: z.string(), w: z.number(), h: z.number(), controls: z.array(controlSchema),
  openedBy: z.string().optional(),
  crop: z.object({ x: z.number(), y: z.number(), vw: z.number(), vh: z.number() }).optional(),
  shots: z.array(z.object({ id: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number(), at: z.number(), vw: z.number(), vh: z.number(), ax: z.number().optional() })).optional().describe("Real screenshots that together show this view; each picture is stored under <view key>@<id>"),
})

async function loadForWrite(checklistId: string): Promise<ChecklistRow | string> {
  const row = await getChecklist(checklistId).catch(() => null)
  if (!row) return "Checklist not found or access denied"
  try { await requireMcpProjectWriteAccess(row.project_id) } catch (e) {
    return reason(e).includes("view-only") ? reason(e) : "Checklist not found or access denied"
  }
  return row
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerGateTools(server: any): void {
  server.tool(
    "gate_save_checklist",
    "Save the checklist for one page of a project: its views (the page, and each menu, dialog or panel that opens from it), every control in each view, and for each control its workflows and the states to check them in. Saving an unchanged list keeps its verdicts; a changed list starts a new version and reports which controls appeared and which are gone. Returns the line to follow next.",
    {
      projectId: z.string(), route: z.string().describe("The page's path, e.g. /catalog"), title: z.string().optional(),
      env: z.enum(["staging", "prod", "local"]).optional(), build: z.string().optional().describe("Commit or deployment the scan was taken from"),
      views: z.array(viewSchema),
      region: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional().describe("For a targeted scan: the part of the page view it covered. Only that part is replaced; checks cleared there are put back in question"),
    },
    async (a: { projectId: string; route: string; title?: string; env?: string; build?: string; views: z.infer<typeof viewSchema>[]; region?: { x: number; y: number; w: number; h: number } }) => {
      try {
        requireMcpScope("write")
        await requireMcpProjectWriteAccess(a.projectId)
        const saved = await saveChecklist({ projectId: a.projectId, userId: getMcpUserId(), env: a.env, build: a.build, region: a.region, list: { route: a.route, ...(a.title ? { title: a.title } : {}), views: a.views } })
        return ok({ ...saved, next_actions: ["Upload a picture of each view with gate_attach_image (kind: view).", "Work the checks in order; after each, call gate_record_check and follow the line it returns."] })
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "gate_status",
    "Where a project's page checklists stand. With no checklistId: every page with its counts. With a checklistId: the full list, verdicts, what changed since the last version, and the next check to work.",
    { projectId: z.string().optional(), checklistId: z.string().optional() },
    async (a: { projectId?: string; checklistId?: string }) => {
      try {
        requireMcpScope("read")
        if (a.checklistId) {
          const row = await getChecklist(a.checklistId).catch(() => null)
          if (!row || !(await verifyMcpProjectAccess(row.project_id)).hasAccess) return fail("Checklist not found or access denied")
          return ok(await loadPage(row))
        }
        if (!a.projectId || !(await verifyMcpProjectAccess(a.projectId)).hasAccess) return fail("Project not found or access denied")
        return ok({ pages: await listPages(a.projectId) })
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "gate_record_check",
    "Record that one or more checks passed or failed, as the builder (the agent doing the work) or the reviewer (a second agent that only saw the evidence). A failure needs a note. Optionally attach a picture as evidence for the first key. Returns the progress and the exact next check: follow it until it says you may finish.",
    {
      checklistId: z.string(), keys: z.array(z.string()).describe('Check keys: "control number|workflow name|state"'),
      status: z.enum(["passed", "failed"]), note: z.string().optional(), actor: z.enum(["builder", "reviewer"]).optional(),
      imageBase64: z.string().optional().describe("Evidence picture, base64. WebP or JPEG preferred. Max 4 MB."),
    },
    async (a: { checklistId: string; keys: string[]; status: "passed" | "failed"; note?: string; actor?: "builder" | "reviewer"; imageBase64?: string }) => {
      try {
        requireMcpScope("write")
        const row = await loadForWrite(a.checklistId)
        if (typeof row === "string") return fail(row)
        const userId = getMcpUserId()
        const progress = await recordResults({ checklist: row, userId, keys: a.keys, actor: a.actor ?? "builder", status: a.status, note: a.note })
        const image = a.imageBase64 ? await attachImage({ checklist: row, userId, kind: "evidence", refKey: a.keys[0], imageBase64: a.imageBase64 }) : null
        return ok({ ...progress, image })
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "gate_attach_image",
    "Store a picture for a checklist: the picture of a view (refKey = the view's key), or evidence for one check (refKey = the check key). Pictures are short-lived: view pictures stay for this version and the one before; evidence stays 3 days, or while its check is failed or disputed.",
    { checklistId: z.string(), kind: z.enum(["view", "evidence"]), refKey: z.string(), imageBase64: z.string().describe("Base64, no data: prefix needed. WebP or JPEG preferred. Max 4 MB.") },
    async (a: { checklistId: string; kind: "view" | "evidence"; refKey: string; imageBase64: string }) => {
      try {
        requireMcpScope("write")
        const row = await loadForWrite(a.checklistId)
        if (typeof row === "string") return fail(row)
        return ok(await attachImage({ checklist: row, userId: getMcpUserId(), kind: a.kind, refKey: a.refKey, imageBase64: a.imageBase64 }))
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "gate_plan",
    "The plan for a page: the controls it is supposed to have, how the latest scan compares (matched, missing, not planned, waiting on the owner), and the record of every change to the plan with the reason and whether the owner was asked.",
    { projectId: z.string(), route: z.string() },
    async ({ projectId, route }: { projectId: string; route: string }) => {
      try {
        requireMcpScope("read")
        if (!(await verifyMcpProjectAccess(projectId)).hasAccess) return fail("Project not found or access denied")
        const page = (await listPages(projectId)).find((p) => p.route === route)
        const list = page ? (await getChecklist(page.id))?.doc ?? null : null
        return ok(await loadPlan(projectId, route, list))
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "gate_plan_seed",
    "Start or extend a page's plan from a saved checklist: a scan of the approved mock-up (source mockup), of a flow (source flow), or your own reading of the task (source agent). Use this before building, so the build is held to everything it should have.",
    { checklistId: z.string().describe("The checklist to take the expected controls from"), route: z.string().optional().describe("The page the plan is for, when it differs from the checklist's own route (a mock-up page standing in for the real one)"), source: z.enum(["mockup", "flow", "agent"]), reason: z.string() },
    async (a: { checklistId: string; route?: string; source: "mockup" | "flow" | "agent"; reason: string }) => {
      try {
        requireMcpScope("write")
        const row = await loadForWrite(a.checklistId)
        if (typeof row === "string") return fail(row)
        return ok(await seedPlan({ projectId: row.project_id, userId: getMcpUserId(), route: a.route ?? row.route, from: row.doc, source: a.source, reason: a.reason }))
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "gate_plan_change",
    "Propose adding or removing one expected control on a page's plan, with the reason and what it rests on. Use it when the build shows something should be there that was not planned, or that a planned control should go. The planner decides whether the owner must be asked (their own words settle it; access, money and destroying data are theirs; dropping something shipped or something their plan asked for is theirs) and says why. If the owner is asked, do not wait: carry on with the rest.",
    {
      projectId: z.string(), route: z.string(), action: z.enum(["add", "remove"]), label: z.string(),
      must: z.string().optional().describe("For add: what the control must do"), kind: z.string().optional(), view: z.string().optional(),
      reason: z.string(), basis: z.enum(["owner_asked", "rule", "evidence", "judgment"]).describe("owner_asked needs the owner's own words in quote"),
      quote: z.string().optional(), replacedBy: z.string().optional().describe("For remove: the planned control that takes its place"),
    },
    async (a: { projectId: string; route: string; action: "add" | "remove"; label: string; must?: string; kind?: string; view?: string; reason: string; basis: "owner_asked" | "rule" | "evidence" | "judgment"; quote?: string; replacedBy?: string }) => {
      try {
        requireMcpScope("write")
        await requireMcpProjectWriteAccess(a.projectId)
        return ok(await proposePlanChange({ ...a, userId: getMcpUserId() }))
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "gate_guides",
    "The owner's stack entries and taste statements: what each asks for, the skill that holds the how-to, the files it applies to and the checks it creates. Read these before building, and load the skill named on any stack entry you are about to use.",
    { projectId: z.string().optional() },
    async ({ projectId }: { projectId?: string }) => {
      try {
        requireMcpScope("read")
        if (projectId && !(await verifyMcpProjectAccess(projectId)).hasAccess) return fail("Project not found or access denied")
        return ok({ guides: await listGuides(getMcpUserId(), projectId ?? null) })
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "gate_guide_save",
    "Add or replace a stack entry or a taste statement (matched by name). A statement drawn from research or your own reading is saved as a draft with source research or agent: drafts are shown to the owner and hold nobody up until they settle them. Use source owner only with the owner's own words and date in basis.",
    {
      kind: z.enum(["stack", "statement"]), name: z.string(), summary: z.string(), skill: z.string().optional(),
      files: z.array(z.string()).optional().describe("File globs it applies to"), imports: z.array(z.string()).optional().describe("Only files importing one of these packages"),
      checks: z.array(z.object({ id: z.string(), say: z.string(), auto: z.string().optional().describe("mentions:<regex>, forbids:<regex>, max-lines:<n>, no-secrets, no-emoji or has-check-file") })),
      source: z.enum(["owner", "research", "agent"]), basis: z.string().describe("The owner's words and date, or the research behind it"), projectId: z.string().optional(),
    },
    async (a: { kind: "stack" | "statement"; name: string; summary: string; skill?: string; files?: string[]; imports?: string[]; checks: { id: string; say: string; auto?: string }[]; source: "owner" | "research" | "agent"; basis: string; projectId?: string }) => {
      try {
        requireMcpScope("write")
        if (a.projectId) await requireMcpProjectWriteAccess(a.projectId)
        const status = a.source === "owner" ? "active" : "draft"
        const saved = await saveGuide(getMcpUserId(), { kind: a.kind, name: a.name, summary: a.summary, skill: a.skill, applies: { files: a.files, imports: a.imports }, checks: a.checks, status, source: a.source, basis: a.basis }, a.projectId ?? null)
        return ok({ ...saved, status, note: status === "draft" ? "Saved as a draft. It applies once the owner settles it." : "Saved and active." })
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "gate_prune_images",
    "Delete the checklist pictures the retention rule no longer keeps, for one project.",
    { projectId: z.string() },
    async ({ projectId }: { projectId: string }) => {
      try {
        requireMcpScope("write")
        await requireMcpProjectWriteAccess(projectId)
        return ok(await sweepGateImages(new Date(), projectId))
      } catch (e) { return fail(reason(e)) }
    },
  )
}
