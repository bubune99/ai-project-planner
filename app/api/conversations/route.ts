/**
 * AI Conversations API
 *
 * Endpoints for managing conversation history.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic";
import {
  getUserConversations,
  getConversation,
  getConversationMessages,
  archiveConversation,
  deleteConversation,
  updateConversationTitle,
} from "@/lib/ai/conversation-queries";

/**
 * GET /api/conversations
 * List user's conversations with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { userId } = authContext;
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("id");
    const contextType = searchParams.get("contextType") || undefined;
    const contextId = searchParams.get("contextId") || undefined;
    const status = (searchParams.get("status") as "active" | "archived") || "active";
    const includeMessages = searchParams.get("includeMessages") === "true";
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Get single conversation with messages
    if (conversationId) {
      const conversation = await getConversation(conversationId);
      if (!conversation) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }

      const messages = includeMessages
        ? await getConversationMessages(conversationId, { limit: 100 })
        : [];

      return NextResponse.json({ conversation, messages });
    }

    // List conversations
    const conversations = await getUserConversations(userId, {
      contextType,
      contextId,
      status,
      limit,
      offset,
    });

    return NextResponse.json({ conversations });
  } catch (error: any) {
    console.error("[Conversations API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/conversations
 * Update conversation (title, archive, etc.)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId, title, archive } = body;

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID required" },
        { status: 400 }
      );
    }

    // Check conversation exists
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Update title
    if (title !== undefined) {
      await updateConversationTitle(conversationId, title);
    }

    // Archive conversation
    if (archive === true) {
      await archiveConversation(conversationId);
    }

    // Fetch updated conversation
    const updated = await getConversation(conversationId);

    return NextResponse.json({ conversation: updated });
  } catch (error: any) {
    console.error("[Conversations API] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update conversation", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversations
 * Delete a conversation and all messages
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("id");

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID required" },
        { status: 400 }
      );
    }

    // Check conversation exists
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    await deleteConversation(conversationId);

    return NextResponse.json({ success: true, deletedId: conversationId });
  } catch (error: any) {
    console.error("[Conversations API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation", details: error.message },
      { status: 500 }
    );
  }
}
