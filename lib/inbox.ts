/*
 * Inbox — questions agents ask the owner, answered from /inbox.
 *
 * A question is an agent_jobs row created straight into 'awaiting-unlock', with
 * input = { kind: "question", options, context, projectId, stepId }. No schema
 * change: options live in the existing input JSON, the answer in unlock_note
 * and result. Legacy unlocks (a running job paused via request_unlock) show up
 * too, as option-less cards.
 *
 * Pure: no React, no SQL, no clock. Assertions in lib/inbox.assert.ts.
 */

export const MAX_OPTIONS = 6
const MAX_OPTION_LEN = 120
const MAX_QUESTION_LEN = 2000
const MAX_CONTEXT_LEN = 4000
const MAX_REPLY_LEN = 4000

export type InboxKind = "question" | "unlock"

export interface QuestionJobInput {
  kind: "question"
  options: string[]
  context: string | null
  projectId: string | null
  stepId: string | null
}

export interface InboxItem {
  id: string
  kind: InboxKind
  question: string
  options: string[]
  context: string | null
  projectId: string | null
  projectName: string | null
  stepId: string | null
  askedBy: string | null
  askedAt: string
}

export interface Answer {
  option: string | null
  reply: string | null
  /** What lands in unlock_note — readable on its own. */
  note: string
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
type AnswerResult = { ok: true; answer: Answer } | { ok: false; error: string }

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

export function buildQuestionInput(raw: {
  question: unknown
  options?: unknown
  context?: unknown
  projectId?: unknown
  stepId?: unknown
}): Result<{ question: string; input: QuestionJobInput }> {
  const question = str(raw.question)
  if (!question) return { ok: false, error: "question is required" }
  if (question.length > MAX_QUESTION_LEN) return { ok: false, error: `question is over ${MAX_QUESTION_LEN} characters` }

  const rawOptions = raw.options ?? []
  if (!Array.isArray(rawOptions) || rawOptions.some((o) => typeof o !== "string")) {
    return { ok: false, error: "options must be an array of strings" }
  }
  const seen = new Set<string>()
  const options: string[] = []
  for (const o of rawOptions as string[]) {
    const t = o.trim()
    if (!t || seen.has(t.toLowerCase())) continue
    if (t.length > MAX_OPTION_LEN) return { ok: false, error: `option "${t.slice(0, 20)}…" is over ${MAX_OPTION_LEN} characters` }
    seen.add(t.toLowerCase())
    options.push(t)
  }
  // One option is not a choice. Zero is fine: the owner answers in words.
  if (options.length === 1) return { ok: false, error: "give at least 2 options, or none for a free-text answer" }
  if (options.length > MAX_OPTIONS) return { ok: false, error: `at most ${MAX_OPTIONS} options — a phone screen holds about that many` }

  const context = str(raw.context)
  if (context && context.length > MAX_CONTEXT_LEN) return { ok: false, error: `context is over ${MAX_CONTEXT_LEN} characters` }

  return {
    ok: true,
    value: {
      question,
      input: { kind: "question", options, context, projectId: str(raw.projectId), stepId: str(raw.stepId) },
    },
  }
}

export function toInboxItem(row: Record<string, any>, projectNames: Record<string, string>): InboxItem {
  let input: Record<string, any> = {}
  try {
    input = typeof row.input === "string" ? JSON.parse(row.input) : (row.input ?? {})
  } catch {
    input = {}
  }
  const isQuestion = input?.kind === "question"
  const projectId = isQuestion ? str(input.projectId) : null
  return {
    id: String(row.id),
    kind: isQuestion ? "question" : "unlock",
    question: str(row.unlock_prompt) ?? str(row.title) ?? "(no prompt)",
    options: isQuestion && Array.isArray(input.options) ? input.options.filter((o: unknown): o is string => typeof o === "string") : [],
    context: isQuestion ? str(input.context) : null,
    projectId,
    projectName: projectId ? projectNames[projectId] ?? null : null,
    stepId: isQuestion ? str(input.stepId) : null,
    askedBy: str(row.assigned_to),
    askedAt: String(row.created_at),
  }
}

export function resolveAnswer(item: InboxItem, body: { option?: unknown; reply?: unknown }): AnswerResult {
  const option = str(body.option)
  const reply = str(body.reply)
  if (!option && !reply) return { ok: false, error: "pick an option or write a reply" }
  // Exact match: the asking agent branches on the option string it offered.
  if (option && !item.options.includes(option)) return { ok: false, error: "that is not one of the options offered" }
  if (reply && reply.length > MAX_REPLY_LEN) return { ok: false, error: `reply is over ${MAX_REPLY_LEN} characters` }
  const note = option && reply ? `${option} — ${reply}` : (option ?? reply)!
  return { ok: true, answer: { option, reply, note } }
}

/** A question has nothing left to run once answered; a paused job resumes. */
export function statusAfterAnswer(kind: InboxKind): "completed" | "queued" {
  return kind === "question" ? "completed" : "queued"
}
