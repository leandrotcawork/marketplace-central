import { randomUUID } from 'crypto'
import { transaction } from '@/lib/db'
import { encryptSecretPayload } from '@/lib/marketplace-crypto'
import type {
  MarketplaceAuthStrategy,
  MarketplaceConnection,
  MarketplaceConnectionStatus,
  MarketplaceRemoteListing,
  MarketplaceSyncJob,
  MarketplaceSyncJobType,
  MarketplaceSyncStatus,
} from '@/types'

let infraEnsured = false

function effectiveTenantId(tenantId?: string): string {
  return tenantId || process.env.MS_TENANT_ID || 'tenant_default'
}

export async function ensureMarketplaceInfrastructure(tenantId?: string): Promise<void> {
  if (infraEnsured) return

  await transaction(
    async (client) => {
      const statements = [
        `CREATE TABLE IF NOT EXISTS marketplace_connections (
          connection_id text PRIMARY KEY,
          tenant_id text NOT NULL,
          channel_id text NOT NULL,
          display_name text NOT NULL,
          account_id text,
          auth_strategy text NOT NULL,
          status text NOT NULL,
          has_stored_secret boolean NOT NULL DEFAULT false,
          last_validated_at timestamptz,
          last_error text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (tenant_id, channel_id)
        )`,
        `CREATE TABLE IF NOT EXISTS marketplace_connection_secrets (
          connection_id text PRIMARY KEY REFERENCES marketplace_connections(connection_id) ON DELETE CASCADE,
          tenant_id text NOT NULL,
          encrypted_payload jsonb NOT NULL,
          secret_fields text[] NOT NULL DEFAULT '{}',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE TABLE IF NOT EXISTS marketplace_sync_jobs (
          sync_job_id text PRIMARY KEY,
          tenant_id text NOT NULL,
          channel_id text NOT NULL,
          connection_id text REFERENCES marketplace_connections(connection_id) ON DELETE SET NULL,
          product_id text,
          publication_id text,
          job_type text NOT NULL,
          status text NOT NULL,
          external_reference text,
          request_payload jsonb,
          result_payload jsonb,
          error_message text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          started_at timestamptz,
          finished_at timestamptz
        )`,
        `CREATE TABLE IF NOT EXISTS marketplace_remote_listings (
          remote_listing_id text PRIMARY KEY,
          tenant_id text NOT NULL,
          channel_id text NOT NULL,
          connection_id text REFERENCES marketplace_connections(connection_id) ON DELETE SET NULL,
          product_id text NOT NULL,
          external_listing_id text NOT NULL,
          external_sku text,
          listing_status text NOT NULL,
          last_price numeric(14,2),
          last_stock numeric(14,2),
          last_synced_at timestamptz,
          raw_payload jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (tenant_id, channel_id, product_id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_connections_tenant
          ON marketplace_connections (tenant_id, channel_id)`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_sync_jobs_tenant
          ON marketplace_sync_jobs (tenant_id, channel_id, status)`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_remote_listings_tenant
          ON marketplace_remote_listings (tenant_id, channel_id, product_id)`,
      ]

      for (const statement of statements) {
        await client.query(statement)
      }
    },
    tenantId
  )

  infraEnsured = true
}

function mapConnectionRow(row: Record<string, unknown>): MarketplaceConnection {
  return {
    connectionId: String(row.connection_id),
    channelId: String(row.channel_id),
    displayName: String(row.display_name),
    accountId: typeof row.account_id === 'string' ? row.account_id : undefined,
    authStrategy: row.auth_strategy as MarketplaceAuthStrategy,
    status: row.status as MarketplaceConnectionStatus,
    hasStoredSecret: Boolean(row.has_stored_secret),
    lastValidatedAt:
      typeof row.last_validated_at === 'string' ? row.last_validated_at : undefined,
    lastError: typeof row.last_error === 'string' ? row.last_error : undefined,
    updatedAt: String(row.updated_at),
  }
}

export async function listMarketplaceConnections(tenantId?: string): Promise<MarketplaceConnection[]> {
  await ensureMarketplaceInfrastructure(tenantId)
  const tenant = effectiveTenantId(tenantId)

  const result = await transaction(async (client) => {
    return client.query(
      `SELECT
        connection_id,
        channel_id,
        display_name,
        account_id,
        auth_strategy,
        status,
        has_stored_secret,
        last_validated_at,
        last_error,
        updated_at
      FROM marketplace_connections
      WHERE tenant_id = $1
      ORDER BY channel_id`,
      [tenant]
    )
  }, tenantId)

  return result.rows.map((row) => mapConnectionRow(row as Record<string, unknown>))
}

type UpsertConnectionInput = {
  channelId: string
  displayName: string
  accountId?: string
  authStrategy: MarketplaceAuthStrategy
  status: MarketplaceConnectionStatus
  lastValidatedAt?: string
  lastError?: string
  secretPayload?: Record<string, unknown>
}

export async function upsertMarketplaceConnection(
  input: UpsertConnectionInput,
  tenantId?: string
): Promise<MarketplaceConnection> {
  await ensureMarketplaceInfrastructure(tenantId)
  const tenant = effectiveTenantId(tenantId)
  const connectionId = randomUUID()
  const hasSecretPayload =
    input.secretPayload &&
    Object.values(input.secretPayload).some(
      (value) => typeof value === 'string' && value.trim().length > 0
    )

  return transaction(async (client) => {
    const connectionResult = await client.query(
      `INSERT INTO marketplace_connections (
        connection_id,
        tenant_id,
        channel_id,
        display_name,
        account_id,
        auth_strategy,
        status,
        has_stored_secret,
        last_validated_at,
        last_error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (tenant_id, channel_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        account_id = EXCLUDED.account_id,
        auth_strategy = EXCLUDED.auth_strategy,
        status = EXCLUDED.status,
        has_stored_secret = marketplace_connections.has_stored_secret OR EXCLUDED.has_stored_secret,
        last_validated_at = EXCLUDED.last_validated_at,
        last_error = EXCLUDED.last_error,
        updated_at = now()
      RETURNING
        connection_id,
        channel_id,
        display_name,
        account_id,
        auth_strategy,
        status,
        has_stored_secret,
        last_validated_at,
        last_error,
        updated_at`,
      [
        connectionId,
        tenant,
        input.channelId,
        input.displayName,
        input.accountId ?? null,
        input.authStrategy,
        input.status,
        Boolean(hasSecretPayload),
        input.lastValidatedAt ?? null,
        input.lastError ?? null,
      ]
    )

    const row = connectionResult.rows[0] as Record<string, unknown>
    const resolvedConnectionId = String(row.connection_id)

    if (hasSecretPayload) {
      const encrypted = encryptSecretPayload(input.secretPayload!)
      const secretFields = Object.keys(input.secretPayload!).filter((field) => {
        const value = input.secretPayload?.[field]
        return typeof value === 'string' && value.trim().length > 0
      })

      await client.query(
        `INSERT INTO marketplace_connection_secrets (
          connection_id,
          tenant_id,
          encrypted_payload,
          secret_fields
        )
        VALUES ($1, $2, $3::jsonb, $4::text[])
        ON CONFLICT (connection_id)
        DO UPDATE SET
          encrypted_payload = EXCLUDED.encrypted_payload,
          secret_fields = EXCLUDED.secret_fields,
          updated_at = now()`,
        [resolvedConnectionId, tenant, JSON.stringify(encrypted), secretFields]
      )
    }

    return mapConnectionRow(row)
  }, tenantId)
}

type CreateSyncJobInput = {
  channelId: string
  connectionId?: string
  productId?: string
  publicationId?: string
  jobType: MarketplaceSyncJobType
  status: MarketplaceSyncStatus
  externalReference?: string
  requestPayload?: unknown
  resultPayload?: unknown
  errorMessage?: string
  startedAt?: string
  finishedAt?: string
}

export async function createMarketplaceSyncJob(
  input: CreateSyncJobInput,
  tenantId?: string
): Promise<MarketplaceSyncJob> {
  await ensureMarketplaceInfrastructure(tenantId)
  const tenant = effectiveTenantId(tenantId)
  const syncJobId = randomUUID()

  const result = await transaction(async (client) => {
    return client.query(
      `INSERT INTO marketplace_sync_jobs (
        sync_job_id,
        tenant_id,
        channel_id,
        connection_id,
        product_id,
        publication_id,
        job_type,
        status,
        external_reference,
        request_payload,
        result_payload,
        error_message,
        started_at,
        finished_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14)
      RETURNING *`,
      [
        syncJobId,
        tenant,
        input.channelId,
        input.connectionId ?? null,
        input.productId ?? null,
        input.publicationId ?? null,
        input.jobType,
        input.status,
        input.externalReference ?? null,
        input.requestPayload ? JSON.stringify(input.requestPayload) : null,
        input.resultPayload ? JSON.stringify(input.resultPayload) : null,
        input.errorMessage ?? null,
        input.startedAt ?? null,
        input.finishedAt ?? null,
      ]
    )
  }, tenantId)

  const row = result.rows[0] as Record<string, unknown>

  return {
    id: String(row.sync_job_id),
    channelId: String(row.channel_id),
    connectionId: typeof row.connection_id === 'string' ? row.connection_id : undefined,
    productId: typeof row.product_id === 'string' ? row.product_id : undefined,
    publicationId: typeof row.publication_id === 'string' ? row.publication_id : undefined,
    jobType: row.job_type as MarketplaceSyncJobType,
    status: row.status as MarketplaceSyncStatus,
    externalReference:
      typeof row.external_reference === 'string' ? row.external_reference : undefined,
    requestPayload: row.request_payload ?? undefined,
    resultPayload: row.result_payload ?? undefined,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    startedAt: typeof row.started_at === 'string' ? row.started_at : undefined,
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : undefined,
  }
}

type UpsertRemoteListingInput = {
  channelId: string
  connectionId?: string
  productId: string
  externalListingId: string
  externalSku?: string
  status: MarketplaceSyncStatus
  lastPrice?: number
  lastStock?: number
  lastSyncedAt?: string
  rawPayload?: unknown
}

export async function upsertMarketplaceRemoteListing(
  input: UpsertRemoteListingInput,
  tenantId?: string
): Promise<MarketplaceRemoteListing> {
  await ensureMarketplaceInfrastructure(tenantId)
  const tenant = effectiveTenantId(tenantId)
  const remoteListingId = randomUUID()

  const result = await transaction(async (client) => {
    return client.query(
      `INSERT INTO marketplace_remote_listings (
        remote_listing_id,
        tenant_id,
        channel_id,
        connection_id,
        product_id,
        external_listing_id,
        external_sku,
        listing_status,
        last_price,
        last_stock,
        last_synced_at,
        raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      ON CONFLICT (tenant_id, channel_id, product_id)
      DO UPDATE SET
        connection_id = EXCLUDED.connection_id,
        external_listing_id = EXCLUDED.external_listing_id,
        external_sku = EXCLUDED.external_sku,
        listing_status = EXCLUDED.listing_status,
        last_price = EXCLUDED.last_price,
        last_stock = EXCLUDED.last_stock,
        last_synced_at = EXCLUDED.last_synced_at,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = now()
      RETURNING *`,
      [
        remoteListingId,
        tenant,
        input.channelId,
        input.connectionId ?? null,
        input.productId,
        input.externalListingId,
        input.externalSku ?? null,
        input.status,
        input.lastPrice ?? null,
        input.lastStock ?? null,
        input.lastSyncedAt ?? null,
        input.rawPayload ? JSON.stringify(input.rawPayload) : null,
      ]
    )
  }, tenantId)

  const row = result.rows[0] as Record<string, unknown>

  return {
    id: String(row.remote_listing_id),
    channelId: String(row.channel_id),
    connectionId: typeof row.connection_id === 'string' ? row.connection_id : undefined,
    productId: String(row.product_id),
    externalListingId: String(row.external_listing_id),
    externalSku: typeof row.external_sku === 'string' ? row.external_sku : undefined,
    status: row.listing_status as MarketplaceSyncStatus,
    lastPrice: typeof row.last_price === 'number' ? row.last_price : undefined,
    lastStock: typeof row.last_stock === 'number' ? row.last_stock : undefined,
    lastSyncedAt: typeof row.last_synced_at === 'string' ? row.last_synced_at : undefined,
    rawPayload: row.raw_payload ?? undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}
