/**
 * show_unit: point at a part of the planner screen. Read-only (it changes
 * nothing; the browser draws a ring or a walkthrough step). All resolving logic
 * is lib/ade/ui/control.ts + planner-units.ts, asserted in ui-tools.assert.ts.
 */
import { z } from "zod"
import { resolveUnit, notFound } from "@/lib/ade/ui/control"
import { PLANNER_UNITS, PLANNER_UNIT_LABELS } from "@/lib/ade/ui/planner-units"

export function showUnit(input: { unit: string; mode?: "highlight" | "spotlight"; caption?: string }) {
  const hit = resolveUnit(input.unit, PLANNER_UNITS)
  if (!hit) {
    const closest = resolveUnit(input.unit.split(/\s+/)[0] ?? "", PLANNER_UNITS)
    return notFound(input.unit, closest)
  }
  return {
    ok: true as const,
    shown: hit.label,
    key: hit.key,
    mode: input.mode ?? ("highlight" as const),
    caption: (input.caption ?? "").slice(0, 140),
    sentence: `Pointing at “${hit.label}”. If it is not on the person's screen right now, they will be told so.`,
  }
}

export function registerUiTools(server: any): void {
  server.tool(
    "show_unit",
    `Point at a part of the app on the person's screen. Read-only: it changes nothing. Known parts: ${PLANNER_UNIT_LABELS}. Use mode "highlight" when you are working on or reviewing something; use "spotlight" ONLY to teach someone how to use the app (it dims the rest of the page and waits for them). Do not claim they saw it: say you pointed at it.`,
    {
      unit: z.string().describe("What to point at, in the person's words, e.g. 'history' or 'the microphone'"),
      mode: z.enum(["highlight", "spotlight"]).optional(),
      caption: z.string().optional().describe("One short line shown on the pointer, e.g. 'Tap here to start a new chat'"),
    },
    async (input: { unit: string; mode?: "highlight" | "spotlight"; caption?: string }) => {
      const out = showUnit(input)
      return { content: [{ type: "text" as const, text: JSON.stringify(out) }], ...(out.ok ? {} : { isError: false }) }
    },
  )
}
