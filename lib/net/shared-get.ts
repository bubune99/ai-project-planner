/**
 * One GET per address while a page loads.
 *
 * Each part of a page reads what it needs for itself (useJson), so a project page asked for the same card list from
 * its header and from the open tab, and People and flows asked for its walks and its checks twice (measured on staging
 * 2026-11-23). getJsonShared joins a read of the same address already on its way and reuses one made in the last
 * moment; a reload after a press always reads again. Each caller gets its own copy, so one part sorting or changing
 * its data cannot reach another.
 */

/** How long one read serves every part of the page that asks for the same address. */
export const SHARED_GET_MS = 1000

/** Whether a caller may take the last read instead of asking again. Pure: `now` is passed in. */
export function reuseGet(last: { at: number } | undefined, now: number, force: boolean): boolean {
  return !force && !!last && now - last.at >= 0 && now - last.at < SHARED_GET_MS
}

type Entry = { at: number; body: unknown }
const done = new Map<string, Entry>()
const going = new Map<string, Promise<unknown>>()

const copy = <T>(v: T): T => (v == null || typeof v !== "object" ? v : (structuredClone(v) as T))

/** GET `url` as JSON, shared with every other caller asking for it at the same moment. Throws the server's message. */
export async function getJsonShared<T = unknown>(url: string, force = false): Promise<T> {
  const last = done.get(url)
  if (reuseGet(last, Date.now(), force)) return copy(last!.body as T)
  let p = going.get(url)
  if (!p) {
    p = fetch(url)
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!r.ok) throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`)
        done.set(url, { at: Date.now(), body: j })
        return j
      })
      .finally(() => { going.delete(url) })
    going.set(url, p)
  }
  return copy((await p) as T)
}
