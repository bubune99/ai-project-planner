/** Window events for the attention layer (components/agents/Attention.tsx). */
export const ATTENTION_EVENT = "ade:attention" // detail: PointDetail
export const TOUR_EVENT = "ade:tour" // detail: { steps }
export const ACK_EVENT = "ade:ack" // detail: { key, action }  (the person pressed Got it / Skip / Stop)

export interface PointDetail { key?: string; ask?: string; mode: "highlight" | "spotlight"; caption?: string }
export interface TourStep { key: string; caption: string }

/** The built-in walkthrough of the chat screen ("Show me around the planner"). */
export const CHAT_TOUR: ReadonlyArray<TourStep> = [
  { key: "chat.composer", caption: "Type here to ask or tell me anything. I can look things up and make changes for you." },
  { key: "chat.agent", caption: "This is who you are talking to. JARVIS hands work to specialists when needed." },
  { key: "chat.think", caption: "Turn on Think to see my reasoning on the next message." },
  { key: "chat.memory", caption: "Turn on Memory so I can search your past chats." },
  { key: "chat.mic", caption: "Hold to talk, let go, and your words land in the box." },
  { key: "chat.history", caption: "Your past conversations live here." },
  { key: "chat.new", caption: "Start a fresh chat any time." },
]

export const point = (d: PointDetail) => window.dispatchEvent(new CustomEvent<PointDetail>(ATTENTION_EVENT, { detail: d }))
export const startTour = (steps: ReadonlyArray<TourStep> = CHAT_TOUR) =>
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: { steps } }))
