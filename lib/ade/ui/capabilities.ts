/**
 * UI capabilities — what the assistant may do on the screen in front of the
 * person, declared per screen (owner: "the agent must be able to navigate
 * and operate all of this"). One dispatcher runs them; the assistant only
 * ever sees the capabilities the current screen offers, and every one maps
 * to something the person could do themselves with a click.
 *
 * Pure and app-agnostic: the host app supplies the table. Asserted by
 * capabilities.assert.ts.
 */

export type UiEffect =
  /** Looks/moves around only (navigate, select, preview, spotlight). */
  | 'view'
  /** Changes the person's layout (dividers, full view). */
  | 'layout'
  /** Changes a draft (held for review like any other edit). */
  | 'draft'
  /** Changes a To-do item's state through the approval engine. */
  | 'state'
  /** Would publish: never runs on the assistant's say-so — the person confirms. */
  | 'approve'
  /** Commits something (sends, proposes for real, saves live settings): the person presses it. */
  | 'commit'
  /** Deletes, clears, refunds, cancels: the person presses it (never the assistant in v1). */
  | 'destructive'

export type ParamSpec =
  | { type: 'string'; required?: boolean; max?: number; describe: string }
  | { type: 'number'; required?: boolean; min: number; max: number; describe: string }
  | { type: 'boolean'; required?: boolean; describe: string }
  | { type: 'enum'; required?: boolean; values: readonly string[]; describe: string }

export interface UiCapability {
  id: string
  /** Plain words, shown in the chat and the audit log. */
  label: string
  /** Screen keys (lib/ade/screens) where it exists, or 'any'. */
  screens: readonly string[] | 'any'
  effect: UiEffect
  params: Readonly<Record<string, ParamSpec>>
  /** When set, the effect depends on the arguments (e.g. moving to Done approves). */
  effectFor?: (args: Record<string, unknown>) => UiEffect
}

export type UiCall = { capability: string; args: Record<string, unknown> }

/**
 * The commit boundary (control layer C11): capabilities with these effects are
 * the person's to press. The assistant may point at them and say what they do,
 * never run them — enforced here for every caller that acts for the assistant.
 */
export const PERSON_ONLY_EFFECTS: ReadonlySet<UiEffect> = new Set<UiEffect>(['approve', 'commit', 'destructive'])

export type Actor = 'assistant' | 'person'

export type CheckResult =
  | { ok: true; capability: UiCapability; args: Record<string, unknown>; effect: UiEffect; needsConfirm: boolean }
  | { ok: false; error: string; personOnly?: true }

export function capabilitiesFor(table: ReadonlyArray<UiCapability>, screen: string): UiCapability[] {
  return table.filter((c) => c.screens === 'any' || c.screens.includes(screen))
}

function checkParam(name: string, spec: ParamSpec, v: unknown): string | null {
  if (v === undefined || v === null || v === '') return spec.required ? `“${name}” is required` : null
  switch (spec.type) {
    case 'string':
      return typeof v === 'string' && v.length <= (spec.max ?? 200) ? null : `“${name}” must be text`
    case 'number':
      return typeof v === 'number' && Number.isFinite(v) && v >= spec.min && v <= spec.max ? null : `“${name}” must be a number from ${spec.min} to ${spec.max}`
    case 'boolean':
      return typeof v === 'boolean' ? null : `“${name}” must be true or false`
    case 'enum':
      return typeof v === 'string' && spec.values.includes(v) ? null : `“${name}” must be one of: ${spec.values.join(', ')}`
  }
}

/** Is this call allowed on this screen, with these arguments? */
export function checkUiCall(table: ReadonlyArray<UiCapability>, screen: string, call: UiCall, opts: { actor?: Actor } = {}): CheckResult {
  const cap = table.find((c) => c.id === call.capability)
  if (!cap) return { ok: false, error: `There is no “${call.capability}”.` }
  if (cap.screens !== 'any' && !cap.screens.includes(screen)) return { ok: false, error: `“${cap.label}” isn’t available on this screen.` }
  const args = call.args && typeof call.args === 'object' ? call.args : {}
  for (const k of Object.keys(args)) if (!(k in cap.params)) return { ok: false, error: `“${cap.label}” doesn’t take “${k}”.` }
  for (const [name, spec] of Object.entries(cap.params)) {
    const err = checkParam(name, spec, args[name])
    if (err) return { ok: false, error: err }
  }
  const effect = cap.effectFor ? cap.effectFor(args) : cap.effect
  if (opts.actor === 'assistant' && PERSON_ONLY_EFFECTS.has(effect)) {
    return { ok: false, error: `“${cap.label}” is for the person to press. Point at it and say what it will do; never press it yourself.`, personOnly: true }
  }
  return { ok: true, capability: cap, args, effect, needsConfirm: effect === 'approve' }
}

/** The model-facing list for one screen (kept short: id(args) — label). */
export function describeCapabilities(table: ReadonlyArray<UiCapability>, screen: string): string {
  return capabilitiesFor(table, screen)
    .map((c) => {
      const params = Object.entries(c.params)
        .map(([k, p]) => `${k}${p.required ? '' : '?'}: ${p.type === 'enum' ? p.values.join('|') : p.type}`)
        .join(', ')
      const note = PERSON_ONLY_EFFECTS.has(c.effect) ? ' (the person presses this — point at it)' : c.effectFor ? ' (some uses are the person’s to press)' : ''
      return `- ${c.id}(${params}) — ${c.label}${note}`
    })
    .join('\n')
}
