/**
 * Session Cache for AI Chat
 *
 * Provides Redis-based caching for:
 * - Session metadata (conversation ID, user ID, activity status)
 * - Message history (for fast retrieval without DB queries)
 *
 * Gracefully degrades to DB-only mode if Redis is unavailable.
 */

import { safeRedis, isRedisConfigured } from '@/lib/redis'

// TTL constants
const SESSION_TTL = 30 * 60 // 30 minutes
const MESSAGES_TTL = 2 * 60 * 60 // 2 hours

// Key patterns
const getSessionKey = (visitorId: string) => `ai:session:${visitorId}`
const getMessagesKey = (conversationId: string) => `ai:messages:${conversationId}`

export interface SessionData {
  conversationId: string
  userId: string
  isActive: boolean
  messageCount: number
  lastActivity: number
  contextType?: string
  contextId?: string
}

export interface CachedMessage {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp?: number
  metadata?: Record<string, unknown>
}

/**
 * Session Cache API
 */
export const sessionCache = {
  /**
   * Check if Redis caching is available
   */
  isAvailable(): boolean {
    return isRedisConfigured
  },

  /**
   * Get session data for a visitor
   */
  async getSession(visitorId: string): Promise<SessionData | null> {
    return safeRedis.get<SessionData>(getSessionKey(visitorId))
  },

  /**
   * Create or update session data
   */
  async setSession(visitorId: string, data: SessionData): Promise<boolean> {
    const success = await safeRedis.set(
      getSessionKey(visitorId),
      { ...data, lastActivity: Date.now() },
      { ex: SESSION_TTL }
    )
    return success
  },

  /**
   * Update session activity timestamp
   */
  async touchSession(visitorId: string): Promise<boolean> {
    const session = await this.getSession(visitorId)
    if (session) {
      return this.setSession(visitorId, {
        ...session,
        lastActivity: Date.now(),
      })
    }
    return false
  },

  /**
   * Clear session data
   */
  async clearSession(visitorId: string): Promise<boolean> {
    return safeRedis.del(getSessionKey(visitorId))
  },

  /**
   * Get cached message history for a conversation
   */
  async getMessages(conversationId: string): Promise<CachedMessage[]> {
    const messages = await safeRedis.lrange<CachedMessage>(
      getMessagesKey(conversationId),
      0,
      -1
    )
    return messages || []
  },

  /**
   * Cache multiple messages (usually when loading from DB)
   */
  async cacheMessages(
    conversationId: string,
    messages: CachedMessage[]
  ): Promise<boolean> {
    if (messages.length === 0) return true

    const key = getMessagesKey(conversationId)
    // Clear existing and push all messages
    await safeRedis.del(key)

    for (const msg of messages) {
      await safeRedis.rpush(key, {
        ...msg,
        timestamp: msg.timestamp || Date.now(),
      })
    }

    await safeRedis.expire(key, MESSAGES_TTL)
    return true
  },

  /**
   * Add a single message to the cache
   */
  async addMessage(
    conversationId: string,
    message: CachedMessage
  ): Promise<boolean> {
    const key = getMessagesKey(conversationId)
    const success = await safeRedis.rpush(key, {
      ...message,
      timestamp: message.timestamp || Date.now(),
    })

    if (success) {
      await safeRedis.expire(key, MESSAGES_TTL)
    }
    return success
  },

  /**
   * Clear message cache for a conversation
   */
  async clearMessages(conversationId: string): Promise<boolean> {
    return safeRedis.del(getMessagesKey(conversationId))
  },

  /**
   * Get message count for a conversation
   */
  async getMessageCount(conversationId: string): Promise<number> {
    const messages = await this.getMessages(conversationId)
    return messages.length
  },

  /**
   * Check if conversation has cached messages
   */
  async hasMessages(conversationId: string): Promise<boolean> {
    return safeRedis.exists(getMessagesKey(conversationId))
  },
}

export default sessionCache
