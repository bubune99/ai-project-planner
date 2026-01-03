/**
 * Redis Client for AI Chat Session Caching
 *
 * Supports both Vercel KV and direct Upstash naming conventions:
 * - Vercel KV: KV_REST_API_URL, KV_REST_API_TOKEN
 * - Upstash: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

import { Redis } from '@upstash/redis'

// Support both Vercel KV and direct Upstash naming
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

// Check if Redis is configured
export const isRedisConfigured = !!(url && token)

// Create Redis client (or null if not configured)
export const redis = isRedisConfigured
  ? new Redis({ url: url!, token: token! })
  : null

/**
 * Safe Redis operations that gracefully degrade when Redis is unavailable
 */
export const safeRedis = {
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return null
    try {
      return await redis.get<T>(key)
    } catch (error) {
      console.warn('[Redis] GET failed:', error)
      return null
    }
  },

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<boolean> {
    if (!redis) return false
    try {
      if (options?.ex) {
        await redis.set(key, value, { ex: options.ex })
      } else {
        await redis.set(key, value)
      }
      return true
    } catch (error) {
      console.warn('[Redis] SET failed:', error)
      return false
    }
  },

  async del(key: string): Promise<boolean> {
    if (!redis) return false
    try {
      await redis.del(key)
      return true
    } catch (error) {
      console.warn('[Redis] DEL failed:', error)
      return false
    }
  },

  async lpush(key: string, ...values: unknown[]): Promise<boolean> {
    if (!redis) return false
    try {
      await redis.lpush(key, ...values)
      return true
    } catch (error) {
      console.warn('[Redis] LPUSH failed:', error)
      return false
    }
  },

  async rpush(key: string, ...values: unknown[]): Promise<boolean> {
    if (!redis) return false
    try {
      await redis.rpush(key, ...values)
      return true
    } catch (error) {
      console.warn('[Redis] RPUSH failed:', error)
      return false
    }
  },

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    if (!redis) return []
    try {
      return await redis.lrange<T>(key, start, stop)
    } catch (error) {
      console.warn('[Redis] LRANGE failed:', error)
      return []
    }
  },

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!redis) return false
    try {
      await redis.expire(key, seconds)
      return true
    } catch (error) {
      console.warn('[Redis] EXPIRE failed:', error)
      return false
    }
  },

  async exists(key: string): Promise<boolean> {
    if (!redis) return false
    try {
      const result = await redis.exists(key)
      return result === 1
    } catch (error) {
      console.warn('[Redis] EXISTS failed:', error)
      return false
    }
  },

  async ttl(key: string): Promise<number> {
    if (!redis) return -2
    try {
      return await redis.ttl(key)
    } catch (error) {
      console.warn('[Redis] TTL failed:', error)
      return -2
    }
  },
}

export default redis
