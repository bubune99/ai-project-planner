/**
 * Conversation Messages API
 *
 * GET /api/conversations/[id]/messages
 * Returns messages for a specific conversation in the format expected by useChat
 */

import { NextRequest, NextResponse } from "next/server";

;
import {
  getConversation,
  getConversationMessages,
} from "@/lib/ai/conversation-queries";

export const dynamic = "force-dynamic"

/**
 * Transform database messages to the format expected by AI SDK's useChat
 * This includes reconstructing toolInvocations from toolCalls and toolResults
 *
 * The AI SDK v5 uses two formats:
 * - Legacy: { role, content: string }
 * - Parts: { role, parts: [{ type: 'text', text: '...' }] }
 *
 * We return both for maximum compatibility
 */
function transformMessagesToUIChatFormat(messages: any[]) {
  return messages.map((msg) => {
    const baseMessage: any = {
      id: msg.id,
      role: msg.role,
      content: msg.content || "",
      createdAt: msg.createdAt,
    };

    // Build parts array from content and stored parts
    const parts: any[] = [];

    // Add text content as a part
    if (msg.content) {
      parts.push({ type: "text", text: msg.content });
    }

    // If we have stored parts (e.g., attachments), include them
    if (msg.parts && Array.isArray(msg.parts)) {
      parts.push(...msg.parts);
    }

    // Reconstruct toolInvocations for assistant messages
    if (msg.role === "assistant" && (msg.toolCalls || msg.toolResults)) {
      const toolInvocations: any[] = [];

      // If we have tool calls, create invocations
      if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
        msg.toolCalls.forEach((call: any, callIndex: number) => {
          const invocation: any = {
            toolCallId: call.toolCallId || `tool-${msg.id}-${callIndex}`,
            toolName: call.toolName,
            args: call.args || {},
            state: "result", // Completed tool calls
          };

          // Try to find matching result
          if (msg.toolResults && Array.isArray(msg.toolResults)) {
            const matchingResult = msg.toolResults.find(
              (r: any) => r.toolCallId === invocation.toolCallId
            );
            if (matchingResult) {
              invocation.result = matchingResult.result;
            }
          }

          toolInvocations.push(invocation);
        });
      }

      if (toolInvocations.length > 0) {
        baseMessage.toolInvocations = toolInvocations;

        // Also add tool invocations to parts for proper rendering
        toolInvocations.forEach((inv) => {
          parts.push({
            type: "tool-invocation",
            toolInvocation: inv,
          });
        });
      }
    }

    // Include parts if we have any
    if (parts.length > 0) {
      baseMessage.parts = parts;
    }

    return baseMessage;
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: conversationId } = await Promise.resolve(params);

    // Verify conversation exists
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Fetch messages
    const messages = await getConversationMessages(conversationId, {
      limit: 100,
    });

    // Transform to UI chat format
    const transformedMessages = transformMessagesToUIChatFormat(messages);

    return NextResponse.json({
      conversation,
      messages: transformedMessages,
    });
  } catch (error: any) {
    console.error("[Messages API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages", details: error.message },
      { status: 500 }
    );
  }
}
