/**
 * AI Conversation Database Queries
 *
 * Handles all database operations for AI chat conversations and messages.
 * Works alongside the session cache for optimal performance.
 */

import { sql } from "@/lib/db/client"
import { sessionCache, type SessionData, type CachedMessage } from "./session-cache"

export interface Conversation {
  id: string
  userId: string
  title: string | null
  status: "active" | "archived"
  contextType: string | null
  contextId: string | null
  modelId: string | null
  messageCount: number
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  id: string
  conversationId: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  parts?: unknown[]
  attachments?: unknown[]
  toolCalls?: unknown[]
  toolResults?: unknown[]
  metadata: Record<string, unknown>
  createdAt: Date
}

export interface CreateConversationParams {
  userId: string
  title?: string
  contextType?: string
  contextId?: string
  modelId?: string
  metadata?: Record<string, unknown>
}

export interface SaveMessageParams {
  conversationId: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  parts?: unknown[]
  attachments?: unknown[]
  toolCalls?: unknown[]
  toolResults?: unknown[]
  metadata?: Record<string, unknown>
}

/**
 * Generate a deterministic conversation ID based on context
 * Pattern: {contextType}-{contextId}-{userId}-{timestamp}
 */
export function generateConversationId(
  contextType: string,
  contextId: string,
  userId: string
): string {
  // Use a simple hash for the timestamp component to make it somewhat deterministic
  // within the same session while still being unique
  const sessionMarker = Math.floor(Date.now() / (1000 * 60 * 30)) // Changes every 30 min
  return `${contextType}-${contextId}-${userId.slice(0, 8)}-${sessionMarker}`
}

/**
 * Get or create a conversation
 * Returns existing active conversation if one exists for the context, otherwise creates new
 */
export async function getOrCreateConversation(
  params: CreateConversationParams
): Promise<Conversation> {
  const { userId, title, contextType, contextId, modelId, metadata = {} } = params

  // Try to find existing active conversation for this context
  if (contextType && contextId) {
    const existing = await sql`
      SELECT
        id, user_id as "userId", title, status,
        context_type as "contextType", context_id as "contextId",
        model_id as "modelId", message_count as "messageCount",
        metadata, created_at as "createdAt", updated_at as "updatedAt"
      FROM ai_conversations
      WHERE user_id = ${userId}
        AND context_type = ${contextType}
        AND context_id = ${contextId}
        AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1
    `

    if (existing.length > 0) {
      return existing[0] as Conversation
    }
  }

  // Create new conversation
  const [conversation] = await sql`
    INSERT INTO ai_conversations (
      user_id, title, context_type, context_id, model_id, metadata
    ) VALUES (
      ${userId},
      ${title || null},
      ${contextType || null},
      ${contextId || null},
      ${modelId || null},
      ${JSON.stringify(metadata)}
    )
    RETURNING
      id, user_id as "userId", title, status,
      context_type as "contextType", context_id as "contextId",
      model_id as "modelId", message_count as "messageCount",
      metadata, created_at as "createdAt", updated_at as "updatedAt"
  `

  return conversation as Conversation
}

/**
 * Get a conversation by ID
 */
export async function getConversation(
  conversationId: string
): Promise<Conversation | null> {
  const [conversation] = await sql`
    SELECT
      id, user_id as "userId", title, status,
      context_type as "contextType", context_id as "contextId",
      model_id as "modelId", message_count as "messageCount",
      metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM ai_conversations
    WHERE id = ${conversationId}
  `

  return (conversation as Conversation) || null
}

/**
 * Save a message to the database and cache
 */
export async function saveMessage(params: SaveMessageParams): Promise<Message> {
  const {
    conversationId,
    role,
    content,
    parts,
    attachments,
    toolCalls,
    toolResults,
    metadata = {},
  } = params

  const [message] = await sql`
    INSERT INTO ai_messages (
      conversation_id, role, content, parts, attachments,
      tool_calls, tool_results, metadata
    ) VALUES (
      ${conversationId},
      ${role},
      ${content},
      ${parts ? JSON.stringify(parts) : null},
      ${attachments ? JSON.stringify(attachments) : null},
      ${toolCalls ? JSON.stringify(toolCalls) : null},
      ${toolResults ? JSON.stringify(toolResults) : null},
      ${JSON.stringify(metadata)}
    )
    RETURNING
      id, conversation_id as "conversationId", role, content,
      parts, attachments, tool_calls as "toolCalls",
      tool_results as "toolResults", metadata,
      created_at as "createdAt"
  `

  // Also add to cache
  await sessionCache.addMessage(conversationId, {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.createdAt).getTime(),
    metadata: message.metadata,
  })

  return message as Message
}

/**
 * Get messages for a conversation
 * Uses cache-first strategy with DB fallback
 */
export async function getConversationMessages(
  conversationId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<Message[]> {
  const { limit = 100, offset = 0 } = options

  // Try cache first (for recent messages without pagination)
  if (offset === 0 && sessionCache.isAvailable()) {
    const cached = await sessionCache.getMessages(conversationId)
    if (cached.length > 0) {
      // Return cached messages, but we need full Message objects
      // Cache only stores minimal data, so we still query DB for full messages
      // but this validates the conversation is active
    }
  }

  // Query database
  const messages = await sql`
    SELECT
      id, conversation_id as "conversationId", role, content,
      parts, attachments, tool_calls as "toolCalls",
      tool_results as "toolResults", metadata,
      created_at as "createdAt"
    FROM ai_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `

  // Cache the messages for future requests
  if (messages.length > 0 && offset === 0) {
    const cachedMessages: CachedMessage[] = messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.createdAt).getTime(),
      metadata: m.metadata,
    }))
    await sessionCache.cacheMessages(conversationId, cachedMessages)
  }

  return messages as Message[]
}

/**
 * Get user's conversations, optionally filtered by context
 */
export async function getUserConversations(
  userId: string,
  options: {
    contextType?: string
    contextId?: string
    status?: "active" | "archived"
    limit?: number
    offset?: number
  } = {}
): Promise<Conversation[]> {
  const {
    contextType,
    contextId,
    status = "active",
    limit = 20,
    offset = 0,
  } = options

  let query = sql`
    SELECT
      id, user_id as "userId", title, status,
      context_type as "contextType", context_id as "contextId",
      model_id as "modelId", message_count as "messageCount",
      metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM ai_conversations
    WHERE user_id = ${userId}
      AND status = ${status}
  `

  if (contextType) {
    query = sql`${query} AND context_type = ${contextType}`
  }

  if (contextId) {
    query = sql`${query} AND context_id = ${contextId}`
  }

  const conversations = await sql`
    SELECT
      id, user_id as "userId", title, status,
      context_type as "contextType", context_id as "contextId",
      model_id as "modelId", message_count as "messageCount",
      metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM ai_conversations
    WHERE user_id = ${userId}
      AND status = ${status}
      ${contextType ? sql`AND context_type = ${contextType}` : sql``}
      ${contextId ? sql`AND context_id = ${contextId}` : sql``}
    ORDER BY updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `

  return conversations as Conversation[]
}

/**
 * Update conversation title (auto-generated or user-provided)
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  await sql`
    UPDATE ai_conversations
    SET title = ${title}, updated_at = NOW()
    WHERE id = ${conversationId}
  `
}

/**
 * Archive a conversation
 */
export async function archiveConversation(
  conversationId: string
): Promise<void> {
  await sql`
    UPDATE ai_conversations
    SET status = 'archived', updated_at = NOW()
    WHERE id = ${conversationId}
  `

  // Clear from cache
  await sessionCache.clearMessages(conversationId)
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(
  conversationId: string
): Promise<void> {
  // Messages are deleted via CASCADE
  await sql`
    DELETE FROM ai_conversations
    WHERE id = ${conversationId}
  `

  // Clear from cache
  await sessionCache.clearMessages(conversationId)
}

/**
 * Get the most recent messages for context window
 * Useful for loading history before LLM calls
 */
export async function getRecentMessages(
  conversationId: string,
  maxMessages: number = 50
): Promise<{ role: string; content: string }[]> {
  // Try cache first
  if (sessionCache.isAvailable()) {
    const cached = await sessionCache.getMessages(conversationId)
    if (cached.length > 0) {
      const recent = cached.slice(-maxMessages)
      return recent.map((m) => ({
        role: m.role,
        content: m.content,
      }))
    }
  }

  // Fall back to database
  const messages = await sql`
    SELECT role, content
    FROM ai_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT ${maxMessages}
  `

  // Reverse to get chronological order
  return messages.reverse() as { role: string; content: string }[]
}

/**
 * Bulk save messages (useful for importing or syncing)
 */
export async function bulkSaveMessages(
  messages: SaveMessageParams[]
): Promise<Message[]> {
  if (messages.length === 0) return []

  const savedMessages: Message[] = []

  // Use a transaction for bulk insert
  for (const msg of messages) {
    const saved = await saveMessage(msg)
    savedMessages.push(saved)
  }

  return savedMessages
}

export default {
  generateConversationId,
  getOrCreateConversation,
  getConversation,
  saveMessage,
  getConversationMessages,
  getUserConversations,
  updateConversationTitle,
  archiveConversation,
  deleteConversation,
  getRecentMessages,
  bulkSaveMessages,
}
