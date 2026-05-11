/**
 * AI Chat API Route with Comprehensive Tools and Persistence
 *
 * This endpoint powers the AI assistant with full project management
 * capabilities, UI control, context-aware interactions, and conversation history.
 *
 * Implements the 7-step message flow pattern:
 * 1. Extract request data
 * 2. Get/create conversation with consistent ID
 * 3. Load history (cache-first, DB fallback)
 * 4. Combine history with new messages
 * 5. Save user message BEFORE calling LLM
 * 6. Call LLM with full context
 * 7. Save assistant response after streaming
 */

import { anthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs, type UIMessage } from "ai";
import { allTools } from "@/lib/ai/tools";
import {
  getOrCreateConversation,
  saveMessage,
  getRecentMessages,
  updateConversationTitle,
  deleteConversation,
  getConversation,
} from "@/lib/ai/conversation-queries";
import { sessionCache } from "@/lib/ai/session-cache";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic"

export const maxDuration = 60;
;

/**
 * Extract text content from UIMessage
 * Supports BOTH formats for backward compatibility:
 * - Chat SDK v3: parts: [{ type: 'text', text: '...' }]
 * - Legacy: content: '...'
 */
function getTextFromMessage(message: UIMessage): string {
  if (!message) return "";

  // Try Chat SDK v3 format first (parts array)
  if (message.parts && message.parts.length > 0) {
    const text = message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text" && !!part.text)
      .map((part) => part.text || "")
      .join("\n");
    if (text) return text;
  }

  // Fall back to legacy content string format
  const legacyMessage = message as UIMessage & { content?: string };
  if (typeof legacyMessage.content === "string" && legacyMessage.content) {
    return legacyMessage.content;
  }

  return "";
}

const systemPrompt = `You are an AI project planning assistant integrated into a project management dashboard.

You have access to tools for managing projects and tasks.

## Guidelines
- Use tools when appropriate to help users manage their projects
- Be concise and actionable
- Use markdown formatting for data presentation`;

interface ChatRequestBody {
  messages: UIMessage[];
  context?: {
    activeTab?: string;
    selectedTask?: unknown;
    selectedDocument?: unknown;
    projectId?: string;
  };
  conversationId?: string;
  contextType?: string;
  contextId?: string;
}

export async function POST(request: Request) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext();
    if (!authContext) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId } = authContext;

    // Rate limit: 30 requests per minute per user for LLM calls
    if (!checkRateLimit(`chat:${userId}`, 30, 60000)) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 1: Extract request data
    const body: ChatRequestBody = await request.json();
    const {
      messages,
      context,
      conversationId: requestConversationId,
      contextType = context?.projectId ? "project" : "general",
      contextId = context?.projectId,
    } = body;

    // Step 2: Get or create conversation
    let conversation;
    if (requestConversationId) {
      // Use provided conversation ID
      conversation = await getOrCreateConversation({
        userId,
        contextType,
        contextId,
      });
    } else {
      // Create or find conversation based on context
      conversation = await getOrCreateConversation({
        userId,
        contextType,
        contextId,
        metadata: context ? { initialContext: context } : {},
      });
    }

    // Step 3: Load history (cache-first, DB fallback)
    const historyMessages = await getRecentMessages(conversation.id, 50);

    // Step 4: Combine history with new messages
    // The frontend typically sends all messages, but we use DB as source of truth
    // Get the latest user message from the request
    const latestUserMessage = messages.filter((m) => m.role === "user").pop();

    if (!latestUserMessage) {
      return new Response(
        JSON.stringify({ error: "No user message provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Extract text content from the latest user message
    const userMessageText = getTextFromMessage(latestUserMessage);

    if (!userMessageText) {
      return new Response(
        JSON.stringify({ error: "No text content in user message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 5: Save user message BEFORE calling LLM
    await saveMessage({
      conversationId: conversation.id,
      role: "user",
      content: userMessageText,
      metadata: { timestamp: Date.now() },
    });

    // Build the full message history for LLM context
    const fullHistory = historyMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // Add the latest user message
    fullHistory.push({
      role: "user" as const,
      content: userMessageText,
    });

    // Add context to the system prompt if provided
    let enhancedSystemPrompt = systemPrompt;
    if (context) {
      enhancedSystemPrompt += `\n\n## Current Context
- Active View: ${context.activeTab || "unknown"}
- Selected Task: ${context.selectedTask ? JSON.stringify(context.selectedTask) : "none"}
- Selected Document: ${context.selectedDocument ? JSON.stringify(context.selectedDocument) : "none"}
- Project ID: ${context.projectId || "none"}
- Conversation ID: ${conversation.id}`;
    }

    // Step 6: Call LLM with full context
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: enhancedSystemPrompt,
      messages: fullHistory,
      tools: allTools,
      stopWhen: stepCountIs(10), // Allow up to 10 steps for multi-step tool execution (AI SDK v5 pattern)
      onFinish: async ({ text, toolCalls, toolResults }) => {
        // Step 7: Save assistant response after streaming
        try {
          await saveMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: text || "",
            toolCalls: toolCalls?.length ? toolCalls : undefined,
            toolResults: toolResults?.length ? toolResults : undefined,
            metadata: { timestamp: Date.now() },
          });

          // Auto-generate title from first exchange if none exists
          if (!conversation.title && text) {
            const title = generateTitle(userMessageText, text);
            await updateConversationTitle(conversation.id, title);
          }

          // Update session cache activity
          if (userId) {
            await sessionCache.touchSession(userId);
          }
        } catch (saveError) {
          console.error("[Chat] Failed to save assistant message:", saveError);
          // Don't throw - the response was still sent successfully
        }
      },
    });

    // Return streaming response with conversation ID header
    const response = result.toUIMessageStreamResponse();

    // Add conversation ID to response headers for client tracking
    response.headers.set("X-Conversation-Id", conversation.id);

    return response;
  } catch (error) {
    console.error("[Chat] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process chat request",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Generate a conversation title from the first exchange
 */
function generateTitle(userMessage: string | undefined | null, assistantResponse: string): string {
  // Use the user's first message, truncated
  const maxLength = 50;
  if (!userMessage) return "New Chat";
  let title = userMessage;

  // Remove common prefixes
  title = title.replace(/^(hi|hello|hey|can you|please|i want to|i need to)\s+/i, "");

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // Truncate with ellipsis
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + "...";
  }

  return title || "New Chat";
}

/**
 * DELETE /api/chat?id={conversationId}
 * Deletes a specific conversation
 */
export async function DELETE(request: Request) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext();
    if (!authContext) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId } = authContext;
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("id");

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: "Conversation ID required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify conversation exists and belongs to user
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify ownership
    if (conversation.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "Forbidden", code: "NOT_OWNER" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Delete the conversation
    await deleteConversation(conversationId);

    return new Response(
      JSON.stringify({ success: true, deletedId: conversationId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Chat] DELETE error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to delete conversation",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
