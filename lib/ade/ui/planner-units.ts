/*
 * The parts of the planner the agent can point at. Each unit's key IS the
 * data-ui attribute on the element, so pointing never depends on page text or
 * layout. Aliases are the words people actually use. Add a unit by adding an
 * entry here AND data-ui="<key>" on the element.
 */
import type { ControlUnit } from "./control"

const u = (key: string, label: string, aliases: string[] = []): ControlUnit => ({
  key,
  label,
  selector: `[data-ui="${key}"]`,
  aliases,
})

export const PLANNER_UNITS: ReadonlyArray<ControlUnit> = [
  u("chat.composer", "Message box", ["composer", "chat box", "where I type", "input", "text box"]),
  u("chat.agent", "Agent picker", ["agent", "which agent", "who am I talking to", "model", "jarvis"]),
  u("chat.think", "Think switch", ["thinking", "reasoning", "think"]),
  u("chat.memory", "Memory switch", ["memory", "past chats", "remember"]),
  u("chat.mic", "Hold to talk", ["microphone", "mic", "voice", "dictate", "talk"]),
  u("chat.send", "Send button", ["send", "submit"]),
  u("chat.history", "Chat history", ["history", "past conversations", "old chats", "previous chats"]),
  u("chat.new", "New chat", ["new conversation", "start over", "new"]),
  u("chat.menu", "Menu", ["navigation", "hamburger", "menu", "sidebar"]),
  u("nav.tab.today", "Today tab", ["today", "todos", "my todos", "tasks tab"]),
  u("nav.tab.projects", "Projects tab", ["projects", "my projects"]),
  u("nav.tab.ask", "Ask tab", ["ask", "chat tab", "assistant"]),
  u("nav.tab.inbox", "Inbox tab", ["inbox", "questions for me", "approvals"]),
  u("nav.tab.more", "More tab", ["more", "everything else", "all pages"]),
]

/** Keys only, for the tool description. */
export const PLANNER_UNIT_LABELS = PLANNER_UNITS.map((x) => x.label).join(", ")
