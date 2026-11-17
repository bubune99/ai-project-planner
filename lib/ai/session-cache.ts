/**
 * Session cache for the AI chat: switched off. Every message is read from Postgres (ai_messages).
 *
 * It was an Upstash (Redis) cache in front of those reads. On 2026-11-17 the database check C3 found that store
 * shared by production and staging, and it was answering "temporarily rate-limited", so the cache worked nowhere.
 * The owner's call the same day: drop Upstash; anything worth keeping lives in Neon ("Neon should have vector if
 * we need it"). Postgres already holds every message, so the chat loses nothing but a cache.
 *
 * The interface is kept so callers need no change: nothing is cached, isAvailable() is false, and every read falls
 * through to the database exactly as it did whenever Redis was missing.
 */

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

export const sessionCache = {
  isAvailable(): boolean {
    return false
  },
  async getSession(_visitorId: string): Promise<SessionData | null> {
    return null
  },
  async setSession(_visitorId: string, _data: SessionData): Promise<boolean> {
    return false
  },
  async touchSession(_visitorId: string): Promise<boolean> {
    return false
  },
  async clearSession(_visitorId: string): Promise<boolean> {
    return false
  },
  async getMessages(_conversationId: string): Promise<CachedMessage[]> {
    return []
  },
  async cacheMessages(_conversationId: string, _messages: CachedMessage[]): Promise<boolean> {
    return false
  },
  async addMessage(_conversationId: string, _message: CachedMessage): Promise<boolean> {
    return false
  },
  async clearMessages(_conversationId: string): Promise<boolean> {
    return false
  },
  async getMessageCount(_conversationId: string): Promise<number> {
    return 0
  },
  async hasMessages(_conversationId: string): Promise<boolean> {
    return false
  },
}

export default sessionCache
