/**
 * Chat History API
 *
 * Provides the /api/history endpoint expected by sidebar-history.tsx
 * Bridges our ai_conversations table to the Chat format expected by the SDK
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getUserConversations, deleteConversation } from "@/lib/ai/conversation-queries";

// Default user ID for local development (no auth)
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * GET /api/history
 * Returns chat history in the format expected by sidebar-history.tsx
 *
 * Query params:
 * - limit: max number of chats to return (default 20)
 * - ending_before: cursor-based pagination - get chats before this ID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const endingBefore = searchParams.get("ending_before");

    // For now, we use the default user ID (no auth implemented)
    const userId = DEFAULT_USER_ID;

    // Fetch conversations from our database
    const conversations = await getUserConversations(userId, {
      status: "active",
      limit: limit + 1, // Fetch one extra to check if there are more
      offset: 0, // We'll implement cursor-based pagination differently
    });

    // Handle cursor-based pagination
    let filteredConversations = conversations;
    if (endingBefore) {
      const cursorIndex = conversations.findIndex((c) => c.id === endingBefore);
      if (cursorIndex !== -1) {
        filteredConversations = conversations.slice(cursorIndex + 1);
      }
    }

    // Check if there are more results
    const hasMore = filteredConversations.length > limit;
    const chats = filteredConversations.slice(0, limit);

    // Transform our Conversation type to the Chat type expected by sidebar-history
    const transformedChats = chats.map((conv) => ({
      id: conv.id,
      createdAt: conv.createdAt,
      title: conv.title || "New Chat",
      userId: conv.userId,
      visibility: "private" as const, // Default to private
      lastContext: conv.metadata,
    }));

    return NextResponse.json({
      chats: transformedChats,
      hasMore,
    });
  } catch (error: any) {
    console.error("[History API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat history", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/history
 * Deletes all conversations for the current user
 */
export async function DELETE() {
  try {
    const userId = DEFAULT_USER_ID;

    // Get all conversations for the user
    const conversations = await getUserConversations(userId, {
      status: "active",
      limit: 1000, // Get all conversations
    });

    // Delete each conversation
    for (const conv of conversations) {
      await deleteConversation(conv.id);
    }

    return NextResponse.json({
      success: true,
      deletedCount: conversations.length,
    });
  } catch (error: any) {
    console.error("[History API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete chat history", details: error.message },
      { status: 500 }
    );
  }
}
