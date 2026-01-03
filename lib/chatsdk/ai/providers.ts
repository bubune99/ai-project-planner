/**
 * AI providers for chatsdk artifacts
 * Configured to use Anthropic Claude
 *
 * Model selection based on Chat SDK best practices:
 * - chat-model: Main conversation model (Sonnet for quality)
 * - title-model: Fast title generation (Haiku for speed/cost)
 * - artifact-model: Content generation (Sonnet for quality)
 */

import { anthropic } from "@ai-sdk/anthropic";
import { customProvider } from "ai";

// Use Anthropic Claude models for the chat SDK
export const myProvider = customProvider({
  languageModels: {
    // Main chat model - Sonnet for high-quality responses
    "chat-model": anthropic("claude-sonnet-4-20250514"),
    // Reasoning model - Sonnet (note: reasoning models disable tools)
    "chat-model-reasoning": anthropic("claude-sonnet-4-20250514"),
    // Title generation - Haiku for fast, cheap title generation
    "title-model": anthropic("claude-haiku-4-20250414"),
    // Artifact generation - Sonnet for high-quality content
    "artifact-model": anthropic("claude-sonnet-4-20250514"),
  },
});
