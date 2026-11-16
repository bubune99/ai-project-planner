"use client"

/** The pictures an agent sent with a question: shown at a size that can be read, each opening at full size. */
export interface QuestionPicture { url: string | null; caption: string | null }

export function QuestionPictures({ pictures, small }: { pictures?: QuestionPicture[] | null; small?: boolean }) {
  const list = (pictures ?? []).filter((p) => p.url)
  if (!list.length) return null
  return (
    <div className={`opx-qpics${small ? " small" : ""}`} data-testid="question-pictures">
      {list.map((p, i) => (
        <figure key={i}>
          <a href={p.url!} target="_blank" rel="noreferrer" aria-label={`Open picture ${i + 1}${p.caption ? `: ${p.caption}` : ""} at full size`}>
            <img src={p.url!} alt={p.caption || `Picture ${i + 1} sent with this question`} loading="lazy" />
          </a>
          {p.caption && <figcaption>{p.caption}</figcaption>}
        </figure>
      ))}
    </div>
  )
}
