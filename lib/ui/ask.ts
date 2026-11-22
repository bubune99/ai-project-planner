/*
 * The product's own question, in place of the browser's confirm() and prompt(): a screen asks, and the one dialog
 * mounted in the root layout (components/ui/AskDialog.tsx) shows it and answers. Unlike the browser's box it does not
 * freeze the tab, and it closes by its buttons, by Esc and by pressing outside.
 *
 * Use it only where the action cannot be taken back. Where an Undo already works, do the action at once and let the
 * notice with Undo follow (as /sops does on delete).
 *
 * Pure: no React, no DOM. One question shows at a time; a second one waits its turn.
 */

export interface Question {
  /** What is being asked, short: 'Delete "Onboarding"?' */
  title: string
  /** What will be lost or changed, in plain words. */
  body?: string
  /** The button that goes ahead, saying what it does: "Delete", "Revoke key". */
  confirm: string
  /** The action destroys something: the button is drawn as a warning. */
  danger?: boolean
  /** Asks for a line of text with the question (the reason for closing a card). */
  field?: { label: string; required: boolean }
}

export interface Pending extends Question { id: number }

/** What a text question resolves to: the trimmed text, or null when it was left blank and an answer is required. */
export function textAnswer(typed: string, required: boolean): string | null {
  const text = typed.trim()
  return required && !text ? null : text
}

type Entry = { pending: Pending; resolve: (answer: string | null) => void }

export function createAsker() {
  let queue: Entry[] = []
  let nextId = 1
  const listeners = new Set<() => void>()
  const changed = () => { listeners.forEach((l) => l()) }

  const ask = (q: Question) => new Promise<string | null>((resolve) => {
    queue = [...queue, { pending: { ...q, id: nextId++ }, resolve }]
    changed()
  })

  return {
    /** Resolves true when the person goes ahead; false when they cancel, press Esc or press outside. */
    confirm: (q: Omit<Question, "field">): Promise<boolean> => ask(q).then((a) => a !== null),
    /** Resolves to the text typed (trimmed); null when they cancel. A required field cannot be sent blank. */
    text: (q: Question & { field: NonNullable<Question["field"]> }): Promise<string | null> => ask(q),
    /** The question on screen now, or null. */
    current: (): Pending | null => queue[0]?.pending ?? null,
    /** Answers the question on screen: null cancels; a string goes ahead (the text typed, "" for a plain confirm). */
    settle: (id: number, answer: string | null): void => {
      const head = queue[0]
      if (!head || head.pending.id !== id) return
      const sent = answer !== null && head.pending.field ? textAnswer(answer, head.pending.field.required) : answer
      if (answer !== null && sent === null) return // a required answer left blank: the question stays
      queue = queue.slice(1)
      head.resolve(sent)
      changed()
    },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

export const asker = createAsker()
export const askConfirm = asker.confirm
export const askText = asker.text
