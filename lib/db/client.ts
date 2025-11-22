import { neon, neonConfig, Pool } from '@neondatabase/serverless'

// Configure Neon for optimal performance
neonConfig.fetchConnectionCache = true

// Database connection URL from environment
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set')
}

/**
 * Neon SQL client for simple queries
 * Use this for straightforward SQL operations
 */
export const sql = neon(connectionString)

/**
 * Connection pool for transaction support and complex operations
 * Use this when you need transactions or prepared statements
 */
export const pool = new Pool({ connectionString })

/**
 * Health check function to verify database connectivity
 * @returns Promise<boolean> - true if connection is healthy
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await sql`SELECT 1 as health`
    return result.length > 0 && result[0].health === 1
  } catch (error) {
    console.error('Database health check failed:', error)
    return false
  }
}

/**
 * Get database connection info
 * @returns Promise<object> - connection information
 */
export async function getConnectionInfo() {
  try {
    const result = await sql`
      SELECT
        current_database() as database,
        current_user as user,
        version() as version
    `
    return result[0]
  } catch (error) {
    console.error('Failed to get connection info:', error)
    throw error
  }
}

/**
 * Close the connection pool
 * Call this when shutting down the application
 */
export async function closePool() {
  await pool.end()
}

// Export types for use in other modules
export type SQL = typeof sql
export type { NeonQueryFunction } from '@neondatabase/serverless'
