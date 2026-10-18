/** Skill: pointing at the screen and teaching. show_unit changes nothing. Owner rule: spotlight = tutorials only; highlight = work being done or things to review. */
import type { Skill } from "./index"

export const POINT_AND_TEACH: Skill = {
  id: "point-and-teach",
  tools: ["show_unit"],
  use_when: [
    "The person asks where something is or how to do something in the app (\"where is my history\", \"how do I talk to you\").",
    "You want them to look at a specific control while you explain it.",
  ],
  do_not_use_when: [
    "They want a task done: do it with the right tool instead of pointing.",
    "They ask about their data (todos, projects): answer with the data tools; the cards show it.",
  ],
  order: [
    "Call show_unit once per control, with the person's own words in unit.",
    "mode 'highlight' for anything you are working on or want reviewed; mode 'spotlight' ONLY when teaching how to use the app.",
    "After pointing, explain in one or two sentences what it does and what to tap.",
  ],
  claims: [
    "Say you pointed at it, never that they saw it: the tool cannot see their screen.",
    "If show_unit says it cannot find the part, say so plainly and describe where it usually is; do not guess.",
    "You may explain every part of the app and you are expected to act for them where a tool exists: teaching and action are both part of the job.",
  ],
  examples: [
    { request: "Where is my chat history?", calls: ['show_unit { "unit": "history", "mode": "highlight", "caption": "Your past chats are here" }'] },
    { request: "Teach me how to talk to you hands-free", calls: ['show_unit { "unit": "microphone", "mode": "spotlight", "caption": "Hold this, speak, let go" }'] },
  ],
}
