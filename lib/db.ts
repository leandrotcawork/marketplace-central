import { Pool, PoolClient } from 'pg'

let pool: Pool | null = null

/**
 * Get or create PostgreSQL connection pool
 * Supports both connection string (MS_DATABASE_URL) and individual env vars
 */
export function getPool(): Pool {
  if (pool) {
    return pool
  }

  const connectionString =
    process.env.MS_DATABASE_URL ||
    `postgres://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=${process.env.PGSSLMODE || 'disable'}`

  if (!connectionString) {
    throw new Error(
      'Database connection requires either MS_DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGPORT/PGDATABASE'
    )
  }

  pool = new Pool({
    connectionString,
    max: parseInt(process.env.MS_PG_MAX_OPEN_CONNS || '25'),
    idleTimeoutMillis: parseInt(process.env.MS_PG_CONN_MAX_IDLE_TIME_SECONDS || '300') * 1000,
    connectionTimeoutMillis: parseInt(process.env.MS_PG_PING_TIMEOUT_SECONDS || '5') * 1000,
  })

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err)
  })

  return pool
}

/**
 * Execute query with automatic tenant context setup
 * Sets app.current_tenant_id for RLS enforcement
 */
export async function query(
  sql: string,
  values: any[] = [],
  tenantId?: string
): Promise<any> {
  const client = await getPool().connect()
  try {
    // Set tenant context for RLS — current_tenant_id() reads from app.tenant_id
    const effectiveTenantId = tenantId || process.env.MS_TENANT_ID || 'tenant_default'
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', effectiveTenantId])

    // Execute the actual query
    const result = await client.query(sql, values)
    return result
  } finally {
    client.release()
  }
}

/**
 * Execute multiple queries in a transaction with tenant context
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>,
  tenantId?: string
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    // Set tenant context for RLS — current_tenant_id() reads from app.tenant_id
    const effectiveTenantId = tenantId || process.env.MS_TENANT_ID || 'tenant_default'
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', effectiveTenantId])

    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Close the connection pool
 * Use for graceful shutdown
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
