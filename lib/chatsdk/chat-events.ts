/** Window events that connect long-press menus, swipe gestures and the composer. */
export const QUOTE_EVENT = "chat:quote" // detail: { text }  -> composer gets a quoted reply
export const ASK_EVENT = "jarvis:ask" // detail: { text }    -> composer gets a prefilled question (on /chat)
export const SHEET_EVENT = "jarvis:sheet" // detail: { text }  -> pull-up sheet (other pages)

export type TextDetail = { text: string }

export const emit = (name: string, text: string) =>
  window.dispatchEvent(new CustomEvent<TextDetail>(name, { detail: { text } }))

/** "> quoted line" block followed by a blank line, capped so a long reply stays a short quote. */
export function asQuote(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim()
  const cut = clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
  return `> ${cut}\n\n`
}

/** What the person is pointing at, as a question stub for the agent. */
export function askStub(text: string, path: string): string {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 140)
  return clean ? `About “${clean}” on ${path}: ` : `About this page (${path}): `
}
