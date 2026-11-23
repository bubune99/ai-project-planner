/**
 * What a card carries for whoever builds it: pictures (mock-ups, before and after), code samples and code references.
 *
 * Owner, 2026-11-23: "when we have mocks like this, we must be able to input the image and any necessary code samples
 * included for building this out or reference to code for implementation". Pictures were only on cards the owner
 * pasted into; an agent's pictures expired with its evidence after 3 days. These keep them on the card itself
 * (metadata.pictures, metadata.code, metadata.codeRefs) for as long as the card lasts; get_card returns them.
 *
 * Rules: lib/work/card-refs.ts and lib/work/card-view.ts (pure, with checks). Wire-up: registerCardRefTools(server)
 * in registerPlannerTools. Each tool is classified in lib/agents/risk.ts.
 */
import { z } from "zod"
import { sql } from "@/lib/db/client"
import { getMcpUserId, requireMcpProjectWriteAccess, requireMcpScope } from "@/lib/auth/mcp-context"
import { resolveStepId } from "./resolve-step-id"
import { addPicture, cardPictures, fileUrl, removePicture } from "@/lib/work/card-view"
import { addCodeRef, addCodeSample, codeRefs, codeSamples, readCodeRef, readCodeSample, removeRef } from "@/lib/work/card-refs"
import { readPictures } from "@/lib/inbox/pictures"
import { storageKeyFor } from "@/lib/storage/upload-rules"

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] })
const fail = (message: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true })
const reason = (e: unknown) => (e instanceof Error ? e.message : "Unknown error")

type Meta = Record<string, unknown> | null

/** Everything a card carries, as an agent reads it (pictures as planner links: open them signed in, or ask the owner). */
export function cardReferences(metadata: Meta, description: string | null, origin = "") {
  return {
    pictures: cardPictures(metadata, description).map((p) => ({ url: p.url.startsWith("/") ? `${origin}${p.url}` : p.url, caption: p.caption })),
    code: codeSamples(metadata),
    codeRefs: codeRefs(metadata),
  }
}

async function loadCard(given: string) {
  const userId = getMcpUserId()
  const id = await resolveStepId(sql as never, userId, given)
  const [row] = (await sql`SELECT id, project_id, title, description, metadata FROM project_steps WHERE id = ${id} AND deleted_at IS NULL`) as { id: string; project_id: string; title: string; description: string | null; metadata: Meta }[]
  if (!row) throw new Error("Card not found")
  await requireMcpProjectWriteAccess(row.project_id)
  return { userId, row }
}

async function saveMeta(id: string, metadata: Record<string, unknown>) {
  await sql`UPDATE project_steps SET metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = NOW() WHERE id = ${id}`
}

const ORIGIN = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || ""

export function registerCardRefTools(server: any) {
  server.tool(
    "add_task_reference",
    "Put a picture, a code sample or a code reference on a card, kept for as long as the card (not the 3-day evidence pictures). kind 'picture': base64 (PNG, JPEG or WebP, up to 1.5 MB) and a caption, e.g. a mock-up or a before/after capture. kind 'code': code and a title (a file name sets the language), e.g. the mock-up's script. kind 'link': a github.com link, or repo ('owner/name') with path, optional lines ('12-30') and ref (branch or commit). A build agent reads them with get_card. Requires write access.",
    {
      cardId: z.string().describe("The card: the full id, or its first 8+ characters as gates prints it"),
      kind: z.enum(["picture", "code", "link"]),
      base64: z.string().optional().describe("picture: the image as base64 (a data: prefix is fine)"),
      caption: z.string().optional().describe("picture: what it shows"),
      code: z.string().optional().describe("code: the text"),
      title: z.string().optional().describe("code: a title or file name, e.g. mock-overlay.js"),
      lang: z.string().optional().describe("code: ts, tsx, js, css, html, json, sql, sh, py, md or text"),
      url: z.string().optional().describe("link: a github.com link (blob link with #L12-L30 for lines)"),
      repo: z.string().optional().describe("link: owner/name, when not giving url"),
      path: z.string().optional().describe("link: the file's path in the repo"),
      lines: z.string().optional().describe("link: '12' or '12-30'"),
      ref: z.string().optional().describe("link: branch or commit (default main)"),
      label: z.string().optional().describe("link: what to call it"),
    },
    async (a: { cardId: string; kind: "picture" | "code" | "link"; base64?: string; caption?: string; code?: string; title?: string; lang?: string; url?: string; repo?: string; path?: string; lines?: string; ref?: string; label?: string }) => {
      try {
        requireMcpScope("write")
        const { userId, row } = await loadCard(a.cardId)
        let next: Record<string, unknown>
        if (a.kind === "code") {
          const s = readCodeSample({ code: a.code, title: a.title, lang: a.lang }, crypto.randomUUID())
          if (!s.ok) return fail(s.error)
          const m = addCodeSample(row.metadata, s.value)
          if (!m.ok) return fail(m.error)
          next = m.value
        } else if (a.kind === "link") {
          const r = readCodeRef({ url: a.url, repo: a.repo, path: a.path, lines: a.lines, ref: a.ref, label: a.label }, crypto.randomUUID())
          if (!r.ok) return fail(r.error)
          const m = addCodeRef(row.metadata, r.value)
          if (!m.ok) return fail(m.error)
          next = m.value
        } else {
          const pics = readPictures([{ base64: a.base64 ?? "", caption: a.caption }])
          if (!pics.ok) return fail(pics.error)
          const [p] = pics.value
          const type = `image/${p.type}`
          const { uploadToR2, isR2Configured } = await import("@/lib/storage/r2-client")
          if (!isR2Configured()) return fail("File storage is not configured on this server")
          const key = storageKeyFor(userId, row.project_id, type, crypto.randomUUID())
          if (!key) return fail("The card's project id is not valid for storage")
          const buf = Buffer.from(p.base64, "base64")
          const up = await uploadToR2(key, buf, type, { projectId: row.project_id, userId, stepId: row.id })
          const title = `Card picture: ${p.caption || row.title}`.slice(0, 200)
          const [doc] = (await sql`
            INSERT INTO documents (project_id, user_id, title, description, blob_key, blob_url, thumbnail_url, file_type, file_size, category, uploaded_by, metadata)
            VALUES (${row.project_id}, ${userId}, ${title}, ${`On card ${row.id}`}, ${key}, ${up.url}, ${up.url}, ${type}, ${buf.length}, 'image', ${userId},
                    ${JSON.stringify({ isImage: true, stepId: row.id, addedBy: "agent" })}::jsonb)
            RETURNING id
          `) as { id: string }[]
          next = addPicture(row.metadata, { url: fileUrl(doc.id), caption: p.caption ?? "" })
        }
        await saveMeta(row.id, next)
        return ok({ added: a.kind, card: { id: row.id, title: row.title }, references: cardReferences(next, row.description, ORIGIN), next_actions: ["get_card returns these to any agent that works the card."] })
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "remove_task_reference",
    "Take a picture, code sample or code reference off a card: give the sample's or reference's id, or the picture's url, as get_card lists them. Requires write access.",
    {
      cardId: z.string().describe("The card: the full id, or its first 8+ characters"),
      id: z.string().optional().describe("A code sample's or code reference's id"),
      pictureUrl: z.string().optional().describe("A picture's url as get_card lists it"),
    },
    async ({ cardId, id, pictureUrl }: { cardId: string; id?: string; pictureUrl?: string }) => {
      try {
        requireMcpScope("write")
        if (!id && !pictureUrl) return fail("Give the id of a code sample or reference, or a picture's url")
        const { row } = await loadCard(cardId)
        const before = cardReferences(row.metadata, null)
        let next: Record<string, unknown> = row.metadata ?? {}
        if (id) next = removeRef(next, id)
        if (pictureUrl) next = removePicture(next, ORIGIN && pictureUrl.startsWith(ORIGIN) ? pictureUrl.slice(ORIGIN.length) : pictureUrl)
        const after = cardReferences(next, null)
        const removed = before.code.length + before.codeRefs.length + before.pictures.length - (after.code.length + after.codeRefs.length + after.pictures.length)
        if (!removed) return fail("Nothing on the card has that id or url")
        await saveMeta(row.id, next)
        return ok({ removed, references: cardReferences(next, row.description, ORIGIN) })
      } catch (e) { return fail(reason(e)) }
    },
  )
}
