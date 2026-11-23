"use client"

/**
 * A card's code: samples (a mock-up's script, a snippet) and references to files in a repo, for whoever builds it.
 * Owner, 2026-11-23: "when we have mocks like this, we must be able to input the image and any necessary code samples
 * included for building this out or reference to code for implementation". Rules in lib/work/card-refs.ts; agents add
 * the same things with add_task_reference.
 */
import { useState } from "react"
import { Check, Code2, Copy, ExternalLink, Link2, X } from "lucide-react"
import { toast } from "sonner"
import type { BoardStep } from "@/lib/types"
import { addCodeRef, addCodeSample, codeRefs, codeSamples, readCodeRef, readCodeSample, removeRef } from "@/lib/work/card-refs"
import { askConfirm } from "@/lib/ui/ask"

type Save = (m: Record<string, unknown>) => Promise<void>
const meta = (s: BoardStep) => (s.metadata ?? null) as Record<string, unknown> | null
const smallBtn = "inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground min-h-8 px-2 rounded-md hover:bg-accent"
const field = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground"

export function CardCode({ step, onSaveMetadata }: { step: BoardStep; onSaveMetadata: Save }) {
  const samples = codeSamples(meta(step))
  const refs = codeRefs(meta(step))
  const [adding, setAdding] = useState<"code" | "link" | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const save = async (next: { ok: true; value: Record<string, unknown> } | { ok: false; error: string }, done: string) => {
    if (!next.ok) { toast.error(next.error); return false }
    setBusy(true)
    try { await onSaveMetadata(next.value); toast.success(done); return true }
    catch (e) { toast.error(e instanceof Error ? e.message : "It could not be saved"); return false }
    finally { setBusy(false) }
  }

  const remove = async (id: string, what: string) => {
    if (!(await askConfirm({ title: `Remove ${what}?`, body: "It is taken off this card. The card itself is not changed otherwise.", confirm: "Remove", danger: true }))) return
    await save({ ok: true, value: removeRef(meta(step), id) }, "Removed")
  }

  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500) }
    catch { toast.error("Copying is blocked in this browser: select the text instead") }
  }

  const count = samples.length + refs.length
  return (
    <section data-testid="card-code">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h4 className="text-[13px] font-semibold text-muted-foreground">Code {count > 0 && <span className="font-normal">· {count}</span>}</h4>
        <div className="flex items-center gap-1">
          <button type="button" className={smallBtn} aria-expanded={adding === "code"} onClick={() => setAdding(adding === "code" ? null : "code")}><Code2 className="w-3.5 h-3.5" /> Add code</button>
          <button type="button" className={smallBtn} aria-expanded={adding === "link"} onClick={() => setAdding(adding === "link" ? null : "link")}><Link2 className="w-3.5 h-3.5" /> Add a file link</button>
        </div>
      </div>

      {adding === "code" && <AddCode busy={busy} onCancel={() => setAdding(null)} onAdd={async (title, code) => {
        const s = readCodeSample({ title, code }, crypto.randomUUID())
        if (await save(s.ok ? addCodeSample(meta(step), s.value) : s, "Code added")) setAdding(null)
      }} />}
      {adding === "link" && <AddLink busy={busy} onCancel={() => setAdding(null)} onAdd={async (url, label) => {
        const r = readCodeRef({ url, label }, crypto.randomUUID())
        if (await save(r.ok ? addCodeRef(meta(step), r.value) : r, "Link added")) setAdding(null)
      }} />}

      {count === 0 && !adding && <p className="text-[13px] text-muted-foreground">None yet. Add a code sample (a mock-up's script, a snippet) or a link to a file on GitHub for whoever builds this.</p>}

      {refs.length > 0 && (
        <ul className="mb-3 space-y-1">
          {refs.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-[13px]">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-foreground hover:underline">
                <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{r.label}</span>
              </a>
              <button type="button" className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Remove the link ${r.label}`} title="Remove" onClick={() => remove(r.id, `the link "${r.label}"`)}><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}

      {samples.map((s) => (
        <figure key={s.id} className="m-0 mb-3 overflow-hidden rounded-lg border border-border">
          <figcaption className="flex items-center gap-2 bg-accent/40 px-3 py-1.5 text-[12px] text-muted-foreground">
            <span className="truncate text-foreground">{s.title}</span><span>{s.lang}</span>
            <button type="button" className="ml-auto inline-flex h-8 items-center gap-1 rounded-md px-2 hover:bg-accent hover:text-foreground" onClick={() => copy(s.id, s.code)}>
              {copied === s.id ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </button>
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
              aria-label={`Remove the code ${s.title}`} title="Remove" onClick={() => remove(s.id, `the code "${s.title}"`)}><X className="w-4 h-4" /></button>
          </figcaption>
          <pre className="m-0 max-h-80 overflow-auto px-3 py-2 text-[12.5px] leading-relaxed text-foreground whitespace-pre"><code>{s.code}</code></pre>
        </figure>
      ))}
    </section>
  )
}

function AddCode({ busy, onAdd, onCancel }: { busy: boolean; onAdd: (title: string, code: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("")
  const [code, setCode] = useState("")
  return (
    <form data-card-overlay className="mb-3 space-y-2 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); onAdd(title, code) }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel() } }}>
      <label className="block text-[12px] text-muted-foreground">Title or file name
        <input className={`${field} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mock-overlay.js" autoFocus />
      </label>
      <label className="block text-[12px] text-muted-foreground">Code
        <textarea className={`${field} mt-1 min-h-32 resize-y`} value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className={smallBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={busy || !code.trim()} className="opx-btn sm">{busy ? "Adding…" : "Add code"}</button>
      </div>
    </form>
  )
}

function AddLink({ busy, onAdd, onCancel }: { busy: boolean; onAdd: (url: string, label: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("")
  const [label, setLabel] = useState("")
  return (
    <form data-card-overlay className="mb-3 space-y-2 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); onAdd(url, label) }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel() } }}>
      <label className="block text-[12px] text-muted-foreground">GitHub link to the file (with #L12-L30 for lines)
        <input className={`${field} mt-1`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/blob/main/path/file.tsx#L12-L30" autoFocus inputMode="url" />
      </label>
      <label className="block text-[12px] text-muted-foreground">What to call it (optional)
        <input className={`${field} mt-1`} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className={smallBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={busy || !url.trim()} className="opx-btn sm">{busy ? "Adding…" : "Add link"}</button>
      </div>
    </form>
  )
}
