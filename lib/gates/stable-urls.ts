/**
 * Keeps a picture's address the same across reloads when the picture has not changed.
 *
 * Stored pictures are served through short-lived signed addresses, and every load of a page's data hands back a
 * new address for the same file. A screen that reloads its data (the Checks tab, People and flows) then swaps every
 * address, so the browser fetches and redraws each picture: they blink (owner, 2026-11-14: "the images in the
 * controls on sidebar have a weird refresh going on and the images keep blinking").
 *
 * The rule: the first address seen for a picture (same kind, key and capture time) is kept until it is close to
 * expiring; a picture that was retaken, or an address that is getting old, takes the new one.
 *
 * Pure: pass `now`. Checked in stable-urls.assert.ts.
 */
export interface Pic { kind: string; key: string; url: string; capturedAt?: string }
export type Kept = Record<string, { url: string; capturedAt: string; since: number }>

/** Signed addresses last an hour; one is kept for at most 40 minutes. */
export const KEEP_MS = 40 * 60 * 1000

export function stableUrls<T extends Pic>(images: T[], kept: Kept, now: number): { images: T[]; kept: Kept } {
  const next: Kept = {}
  const out = images.map((img) => {
    const id = `${img.kind}\u0000${img.key}`, shot = img.capturedAt ?? ""
    const prev = kept[id]
    if (prev && prev.capturedAt === shot && now - prev.since < KEEP_MS) { next[id] = prev; return prev.url === img.url ? img : { ...img, url: prev.url } }
    next[id] = { url: img.url, capturedAt: shot, since: now }
    return img
  })
  return { images: out, kept: next }
}
