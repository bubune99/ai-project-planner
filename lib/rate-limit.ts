/**
 * Simple in-memory rate limiter
 *
 * For production, consider using Upstash Redis rate limiter instead.
 * This provides basic per-key rate limiting with a sliding window.
 */

const rateLimit = new Map<string, { count: number; resetTime: number }>()

/**
 * Check if a request is within the rate limit
 * @param key - Unique identifier (e.g., userId, IP address)
 * @param limit - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds (default: 60 seconds)
 * @returns true if the request is allowed, false if rate limited
 */
export function checkRateLimit(key: string, limit: number = 60, windowMs: number = 60000): boolean {
  const now = Date.now()
  const entry = rateLimit.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimit.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}

// Periodically clean up expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimit.entries()) {
    if (now > entry.resetTime) {
      rateLimit.delete(key)
    }
  }
}, 60000) // Clean up every minute
