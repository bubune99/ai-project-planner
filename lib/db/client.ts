import { neon, neonConfig, Pool } from '@neondatabase/serverless'

neonConfig.fetchConnectionCache = true

let _sql: ReturnType<typeof neon> | null = null
let _pool: Pool | null = null

function dbUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is not set')
  return url
}

function getSql() {
  if (!_sql) _sql = neon(dbUrl())
  return _sql
}

function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: dbUrl() })
  return _pool
}

export const sql = new Proxy(function sql() {} as unknown as ReturnType<typeof neon>, {
  apply: (_t, thisArg, args) => Reflect.apply(getSql() as unknown as (...a: unknown[]) => unknown, thisArg, args),
  get: (_t, prop) => Reflect.get(getSql(), prop as string),
}) as ReturnType<typeof neon>

export const pool = new Proxy({} as Pool, {
  get: (_t, prop) => Reflect.get(getPool(), prop as string),
})

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await sql`SELECT 1 as health`
    return result.length > 0 && result[0].health === 1
  } catch {
    return false
  }
}

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

export async function closePool() {
  await getPool().end()
}

export type SQL = typeof sql
export type { NeonQueryFunction } from '@neondatabase/serverless'
