"use client"

/**
 * A change's before and after pictures, with what changed marked on both.
 *
 * Owner, 2026-11-16: "is there a way that we can get a highlight of the changes before and after in the images so
 * that I am not playing where is waldo?" Both pictures are read from the planner's own address (a browser may only
 * read the pixels of those), drawn small, compared (lib/gates/picture-diff.ts), and the changed areas are outlined
 * on both. A switch hides the marks.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { diffBoxes, sameShape, type Diff } from "@/lib/gates/picture-diff"

const SMALL = 240

function pixels(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray | null {
  try {
    const c = document.createElement("canvas"); c.width = w; c.height = h
    const x = c.getContext("2d", { willReadFrequently: true }); if (!x) return null
    x.drawImage(img, 0, 0, w, h)
    return x.getImageData(0, 0, w, h).data
  } catch { return null }
}

export function compare(before: HTMLImageElement, after: HTMLImageElement): Diff | null {
  const bw = before.naturalWidth, bh = before.naturalHeight, aw = after.naturalWidth, ah = after.naturalHeight
  if (!bw || !aw) return null
  if (!sameShape(bw, bh, aw, ah)) return { verdict: "shape", boxes: [], changed: 0 }
  const w = Math.min(SMALL, bw), h = Math.max(1, Math.round((w * bh) / bw))
  const a = pixels(before, w, h), b = pixels(after, w, h)
  return a && b ? diffBoxes(a, b, w, h) : null
}

const LINE: Record<Diff["verdict"], (n: number) => string> = {
  same: () => "No visible change between the two pictures.",
  some: (n) => `${n} change${n === 1 ? "" : "s"} marked on both pictures.`,
  most: () => "Most of the picture changed, so nothing is marked.",
  shape: () => "The two pictures are different shapes, so changes cannot be marked.",
}

export function ChangePair({ projectId, id, title, before, after, onPictureLoad, onPictureError }: {
  projectId: string; id: string; title: string; before: string | null; after: string | null
  onPictureLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void; onPictureError: () => void
}) {
  const local = (which: "before" | "after") => `/api/projects/${projectId}/gates/changes/${id}/picture?which=${which}`
  const refs = { before: useRef<HTMLImageElement>(null), after: useRef<HTMLImageElement>(null) }
  const [diff, setDiff] = useState<Diff | null>(null)
  const [show, setShow] = useState(true)
  const tryCompare = useCallback(() => {
    const b = refs.before.current, a = refs.after.current
    if (b?.complete && a?.complete && b.naturalWidth && a.naturalWidth) setDiff(compare(b, a))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { tryCompare() }, [tryCompare])
  const pictures = [["Before", "before", before], ["After", "after", after]] as const
  return (
    <>
      <div className="opx-ch-pair">
        {pictures.map(([label, which, src]) => (
          <figure key={which}>
            <figcaption>{label}</figcaption>
            {src ? (
              <a href={local(which)} target="_blank" rel="noreferrer" aria-label={`Open the ${label.toLowerCase()} picture at full size`}>
                <span className="opx-ch-frame">
                  <img ref={refs[which]} src={local(which)} alt={`${label}: ${title}`} loading="lazy" onLoad={(e) => { onPictureLoad(e); tryCompare() }} onError={onPictureError} />
                  {show && diff?.verdict === "some" && diff.boxes.map((b, i) => (
                    <span key={i} className="opx-ch-mark" aria-hidden="true" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} />
                  ))}
                </span>
              </a>
            ) : <div className="opx-empty">The picture is not available.</div>}
          </figure>
        ))}
      </div>
      {diff && (
        <div className="opx-ch-diff" data-testid="change-marks">
          <span className="opx-muted">{LINE[diff.verdict](diff.boxes.length)}</span>
          {diff.verdict === "some" && <button type="button" className="opx-btn sm" aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? "Hide the marks" : "Show what changed"}</button>}
        </div>
      )}
    </>
  )
}
