"use client"

/*
 * The one dialog that shows a question asked with askConfirm / askText (lib/ui/ask.ts). Mounted once, in the root
 * layout. Display only: which question is on screen and what an answer means are decided in lib/ui/ask.ts.
 *
 * It closes by its buttons, by Esc and by pressing outside (the last two cancel), and focus goes back to whatever
 * opened it. The button that goes ahead is never where focus starts: Cancel is, or the text field when there is one.
 */

import { useId, useRef, useState, useSyncExternalStore } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { asker, textAnswer, type Pending } from "@/lib/ui/ask"

const none = () => null

export function AskDialog() {
  const question = useSyncExternalStore(asker.subscribe, asker.current, none)
  // Keyed by the question, so the text typed for one never carries into the next.
  return question ? <Asked key={question.id} question={question} /> : null
}

function Asked({ question }: { question: Pending }) {
  const [typed, setTyped] = useState("")
  const cancelRef = useRef<HTMLButtonElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fieldId = useId()
  const { field } = question
  const blank = !!field && textAnswer(typed, field.required) === null
  const cancel = () => asker.settle(question.id, null)
  const go = () => asker.settle(question.id, field ? typed : "")

  return (
    <Dialog open onOpenChange={(open) => { if (!open) cancel() }}>
      <DialogContent
        {...(question.body ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(e) => { e.preventDefault(); (fieldRef.current ?? cancelRef.current)?.focus() }}
      >
        <form className="opx-col gap-4" onSubmit={(e) => { e.preventDefault(); go() }}>
          <DialogHeader>
            <DialogTitle>{question.title}</DialogTitle>
            {question.body && <DialogDescription>{question.body}</DialogDescription>}
          </DialogHeader>
          {field && (
            <div className="opx-col gap-2">
              <label htmlFor={fieldId}>{field.label}{field.required ? "" : " (optional)"}</label>
              <textarea ref={fieldRef} id={fieldId} className="opx-input" rows={3} value={typed} required={field.required} onChange={(e) => setTyped(e.target.value)} />
            </div>
          )}
          <div className="opx-row flex-wrap">
            <button ref={cancelRef} type="button" className="opx-btn" onClick={cancel}>Cancel</button>
            <button type="submit" className={`opx-btn ${question.danger ? "danger" : "primary"}`} disabled={blank}>{question.confirm}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
