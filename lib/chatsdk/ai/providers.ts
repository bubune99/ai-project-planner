/**
 * AI providers for chatsdk artifacts
 * Configured to use Anthropic Claude
 */

import { anthropic } from "@ai-sdk/anthropic";
import { customProvider } from "ai";

// Use Anthropic Claude models for the chat SDK
export const myProvider = customProvider({
  languageModels: {
    "chat-model": anthropic("claude-sonnet-4-20250514"),
    "chat-model-reasoning": anthropic("claude-sonnet-4-20250514"),
    "title-model": anthropic("claude-sonnet-4-20250514"),
    "artifact-model": anthropic("claude-sonnet-4-20250514"),
  },
});
