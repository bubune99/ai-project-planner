/**
 * Pictures on an inbox question.
 *
 * Owner, 2026-11-16: "Inbox items should be allowed to have images for context".
 * An agent that asks about a screen sends up to four pictures with the question; the card shows them. The rules for
 * what is accepted are here, with nothing of the server in them. Checked in pictures.assert.ts.
 */
export const MAX_PICTURES = 4
export const MAX_PICTURE_BYTES = 1_500_000
/** A question and its pictures travel in one request, which the host caps at 4.5 MB. */
export const MAX_TOTAL_BYTES = 3_000_000
const MAX_CAPTION = 160

export type PictureType = "png" | "jpeg" | "webp"
/**
 * A picture may stand for one of the question's options (`option`, its exact words), so the card shows that option
 * as its picture and pressing the picture chooses it; or show how it is now (`current`). Owner, 2026-11-16: a design
 * question asked "with one picture per option". Neither is needed: a plain picture is context.
 */
export interface PictureIn { type: PictureType; base64: string; bytes: number; caption: string | null; option: string | null; current: boolean }
export interface StoredPicture { key: string; caption: string | null; option?: string | null; current?: boolean }

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** The kind of picture, read from its first bytes (given as base64), never from what the sender says it is. */
export function pictureType(base64: string): PictureType | null {
  const head = base64.slice(0, 24)
  if (head.startsWith("iVBORw0KGgo")) return "png"
  if (head.startsWith("/9j/")) return "jpeg"
  if (head.startsWith("UklGR") && /^UklGR.{3}.{0,6}XRUJQ|^UklGR[A-Za-z0-9+/]{5,7}V0VCU/.test(head)) return "webp"
  return null
}

const sizeOf = (base64: string) => Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0)

/** What an agent sent as `images`, checked against the question's `options`. Nothing sent is fine: a question needs no picture. */
export function readPictures(raw: unknown, options: string[] = []): Result<PictureIn[]> {
  if (raw == null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "images must be a list of { base64, caption }" }
  if (raw.length > MAX_PICTURES) return { ok: false, error: `at most ${MAX_PICTURES} pictures on one question` }
  const out: PictureIn[] = []
  let total = 0
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i] as { base64?: unknown; caption?: unknown; option?: unknown; current?: unknown } | string
    const given = typeof it === "string" ? it : it?.base64
    if (typeof given !== "string" || !given.trim()) return { ok: false, error: `picture ${i + 1} has no base64 data` }
    const base64 = given.trim().replace(/^data:image\/[\w.+-]+;base64,/, "").replace(/\s+/g, "")
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { ok: false, error: `picture ${i + 1} is not base64` }
    const type = pictureType(base64)
    if (!type) return { ok: false, error: `picture ${i + 1} must be a PNG, JPEG or WebP` }
    const bytes = sizeOf(base64)
    if (bytes > MAX_PICTURE_BYTES) return { ok: false, error: `picture ${i + 1} is over 1.5 MB: send a smaller or cropped one` }
    total += bytes
    if (total > MAX_TOTAL_BYTES) return { ok: false, error: "the pictures together are over 3 MB" }
    const cap = typeof it === "object" && typeof it?.caption === "string" && it.caption.trim() ? it.caption.trim().slice(0, MAX_CAPTION) : null
    const option = typeof it === "object" && typeof it?.option === "string" && it.option.trim() ? it.option.trim() : null
    if (option && !options.includes(option)) return { ok: false, error: `picture ${i + 1} is for the option "${option.slice(0, 60)}", which is not one of the options` }
    if (option && out.some((p) => p.option === option)) return { ok: false, error: `two pictures are for the option "${option.slice(0, 60)}"` }
    const current = typeof it === "object" && it?.current === true
    if (option && current) return { ok: false, error: `picture ${i + 1} is both an option and how it is now: send them as two pictures` }
    if (current && out.some((p) => p.current)) return { ok: false, error: "only one picture can show how it is now" }
    out.push({ type, base64, bytes, caption: cap, option, current })
  }
  return { ok: true, value: out }
}

/** The pictures kept with a question, read back from its stored input. Anything malformed is left out. */
export function storedPictures(input: unknown): StoredPicture[] {
  const list = input && typeof input === "object" ? (input as { images?: unknown }).images : null
  if (!Array.isArray(list)) return []
  return list
    .filter((p): p is { key: string; caption?: unknown; option?: unknown; current?: unknown } => !!p && typeof p === "object" && typeof (p as { key?: unknown }).key === "string" && (p as { key: string }).key.startsWith("inbox/"))
    .slice(0, MAX_PICTURES)
    .map((p) => ({
      key: p.key, caption: typeof p.caption === "string" && p.caption ? p.caption : null,
      option: typeof p.option === "string" && p.option ? p.option : null, current: p.current === true,
    }))
}

/** How a card lays its pictures out: how it is now, one per option (in the options' order), and the rest as context. */
export function pictureLayout<P extends { option?: string | null; current?: boolean }>(pictures: P[], options: string[]) {
  const byOption = new Map(pictures.filter((p) => p.option && options.includes(p.option)).map((p) => [p.option as string, p]))
  return {
    current: pictures.find((p) => p.current && !p.option) ?? null,
    choices: options.filter((o) => byOption.has(o)).map((o) => ({ option: o, picture: byOption.get(o) as P })),
    context: pictures.filter((p) => !p.current && !(p.option && options.includes(p.option))),
  }
}

/** Where a question's picture is kept. The owner's id is in the path, so one owner's pictures are never another's. */
export function pictureKey(userId: string, id: string, index: number, type: PictureType): string {
  return `inbox/${userId}/${id}-${index + 1}.${type === "jpeg" ? "jpg" : type}`
}
