/**
 * AI Chat API Route — the in-app agents.
 *
 * The agent (JARVIS, Project Operator, Researcher) comes from the picker
 * (selectedChatModel carries an agent id) and is defined in
 * lib/agents/registry.ts. Its tools are the planner's own MCP tools, run as
 * the signed-in user — see lib/agents/runtime.ts. This replaced a separate
 * 24-tool copy in lib/ai/tools.ts and a model picker whose "Grok" entries
 * were ignored (every request used Claude Sonnet 4).
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

import { createUIMessageStream, createUIMessageStreamResponse, generateId as generateUUID, streamText, type UIMessage } from "ai";
import { TraceRecorder } from "@/lib/agents/trace";
import { sql } from "@/lib/db/client";
import { resolveAgent } from "@/lib/agents/registry";
import { prepareAgent } from "@/lib/agents/runtime";
import { isUuid } from "@/lib/ai/chat-format";
import {
  getOrCreateConversation,
  getOrCreateConversationById,
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

// Agent runs make several model rounds and can delegate; 60s cut a real
// multi-step run off mid-answer (Vercel Runtime Timeout, 2026-10-03).
export const maxDuration = 300;
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



interface ChatRequestBody {
  /** The chat's own id (UUID) — also the conversation id. */
  id?: string;
  /** Legacy clients send the whole list; the chat UI sends just the latest. */
  messages?: UIMessage[];
  message?: UIMessage;
  /** The picker's value — an agent id (lib/agents/catalog.ts). */
  selectedChatModel?: string;
  /** Show the agent's reasoning for this message (extended thinking). */
  thinking?: boolean;
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
      context,
      contextType = context?.projectId ? "project" : "general",
      contextId = context?.projectId,
    } = body;

    const messages: UIMessage[] = body.messages ?? (body.message ? [body.message] : []);
    const agent = resolveAgent(body.selectedChatModel);

    // Step 2: The conversation for this chat. Keyed by the chat's id, so every
    // message in one chat lands in one conversation and the agent sees the
    // earlier turns. (Without an id, a chat with no project context used to get
    // a new conversation per message.) Clients that send no id keep the old
    // context-based behaviour.
    let conversation;
    if (isUuid(body.id)) {
      conversation = await getOrCreateConversationById({
        id: body.id,
        userId,
        contextType,
        contextId,
        modelId: agent.id,
        metadata: context ? { initialContext: context } : {},
      });
      if (!conversation) {
        return new Response(
          JSON.stringify({ error: "Forbidden", code: "NOT_OWNER" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
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

    // The project the owner is looking at, if the client says so. Name looked
    // up with an ownership check so the prompt never names someone else's.
    const projectId = context?.projectId ?? null;
    let projectName: string | null = null;
    if (projectId) {
      const rows = (await sql`
        SELECT name FROM projects WHERE id = ${projectId} AND user_id = ${userId} AND deleted_at IS NULL
      `) as { name: string }[];
      projectName = rows[0]?.name ?? null;
    }
    // Step 6: Run the agent. Its trace streams to the client as data-span
    // parts (one id per span, so a span's start and end update the same
    // part): live progress in the reply, and a timeline of the run.
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const trace = new TraceRecorder(
          generateUUID().slice(0, 8),
          () => Date.now(),
          (span) => writer.write({ type: "data-span", id: span.id, data: span })
        );
        const root = trace.begin({ label: agent.id, title: agent.name, kind: "agent" });
        const prepared = await prepareAgent(
          agent,
          {
            userId,
            projectId: projectName ? projectId : null,
            projectName,
            today: new Date().toISOString().slice(0, 10),
            thinking: body.thinking === true,
          },
          trace,
          root
        );

        const result = streamText({
          ...prepared,
          messages: fullHistory,
          onError: ({ error }) => {
            trace.end(root, { status: "error", detail: error instanceof Error ? error.message.slice(0, 60) : "Failed" });
          },
          onFinish: async ({ text, toolCalls, toolResults, totalUsage, steps }) => {
            const toolCount = steps.reduce((n, st) => n + st.toolCalls.length, 0);
            trace.end(root, {
              status: "ok",
              detail: `${toolCount} tool call${toolCount === 1 ? "" : "s"}`,
              tokens: totalUsage?.totalTokens,
            });
            // Step 7: Save the reply with its trace, so a reopened chat keeps it.
            try {
              await saveMessage({
                conversationId: conversation.id,
                role: "assistant",
                content: text || "",
                toolCalls: toolCalls?.length ? toolCalls : undefined,
                toolResults: toolResults?.length ? toolResults : undefined,
                metadata: { timestamp: Date.now(), agent: agent.id, trace: trace.snapshot() },
              });

              if (!conversation.title && text) {
                await updateConversationTitle(conversation.id, generateTitle(userMessageText, text));
              }
              if (userId) await sessionCache.touchSession(userId);
            } catch (saveError) {
              console.error("[Chat] Failed to save assistant message:", saveError);
            }
          },
        });

        writer.merge(result.toUIMessageStream({ sendReasoning: true }));
      },
      onError: (error) => (error instanceof Error ? error.message : "Agent run failed"),
    });

    return createUIMessageStreamResponse({
      stream,
      headers: { "X-Conversation-Id": conversation.id },
    });
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
