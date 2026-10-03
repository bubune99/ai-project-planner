/*
 * The chat "model" picker lists agents, not models. Each agent picks its own
 * model (lib/agents/registry.ts); the old entries here ("Grok Vision", "Grok
 * Reasoning") were labels only — the API ignored them and always used one
 * Claude model. The ids are agent ids, sent as selectedChatModel.
 */
import { AGENTS, DEFAULT_AGENT_ID } from "@/lib/agents/catalog"

export const DEFAULT_CHAT_MODEL: string = DEFAULT_AGENT_ID

export type ChatModel = {
  id: string
  name: string
  description: string
}

export const chatModels: ChatModel[] = AGENTS.map(({ id, name, description }) => ({ id, name, description }))
