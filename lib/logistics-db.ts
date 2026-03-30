import { randomUUID } from 'crypto'
import { transaction } from '@/lib/db'
import { encryptSecretPayload, decryptSecretPayload } from '@/lib/marketplace-crypto'
import type {
  LogisticsProvider,
  LogisticsProviderStatus,
  LogisticsProviderType,
  LogisticsProviderAuthStrategy,
} from '@/types'

let infraEnsured = false

function effectiveTenantId(tenantId?: string): string {
  return tenantId || process.env.MS_TENANT_ID || 'tenant_default'
}

export async function ensureLogisticsInfrastructure(tenantId?: string): Promise<void> {
  if (infraEnsured) return

  const tenant = effectiveTenantId(tenantId)

  await transaction(
    async (client) => {
      // 1. Create tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS logistics_providers (
          provider_id text NOT NULL,
          tenant_id text NOT NULL,
          display_name text NOT NULL,
          provider_type text NOT NULL DEFAULT 'shipping',
          auth_strategy text NOT NULL,
          status text NOT NULL,
          has_stored_secret boolean NOT NULL DEFAULT false,
          last_validated_at timestamptz,
          last_error text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (tenant_id, provider_id)
        )
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS logistics_provider_secrets (
          provider_id text NOT NULL,
          tenant_id text NOT NULL,
          encrypted_payload jsonb NOT NULL,
          secret_fields text[] NOT NULL DEFAULT '{}',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (tenant_id, provider_id)
        )
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_logistics_providers_tenant
          ON logistics_providers (tenant_id, provider_id)
      `)

      // 2. Auto-migrate existing ME connection from marketplace_connections
      // Check if ME already migrated
      const alreadyMigrated = await client.query(
        `SELECT 1 FROM logistics_providers WHERE tenant_id = $1 AND provider_id = 'melhor-envio' LIMIT 1`,
        [tenant]
      )

      if (alreadyMigrated.rowCount === 0) {
        // Check if ME exists in marketplace_connections
        const meRow = await client.query(
          `SELECT mc.connection_id, mc.display_name, mc.auth_strategy, mc.status, mc.has_stored_secret, mc.last_validated_at, mc.last_error, mc.created_at
           FROM marketplace_connections mc
           WHERE mc.tenant_id = $1 AND mc.channel_id = 'melhor-envio'
           LIMIT 1`,
          [tenant]
        )

        if (meRow.rowCount && meRow.rowCount > 0) {
          const row = meRow.rows[0] as Record<string, unknown>

          // Insert into logistics_providers
          await client.query(
            `INSERT INTO logistics_providers (provider_id, tenant_id, display_name, provider_type, auth_strategy, status, has_stored_secret, last_validated_at, last_error, created_at, updated_at)
             VALUES ('melhor-envio', $1, $2, 'shipping', $3, $4, $5, $6, $7, $8, now())
             ON CONFLICT (tenant_id, provider_id) DO NOTHING`,
            [
              tenant,
              row.display_name,
              row.auth_strategy,
              row.status,
              row.has_stored_secret,
              row.last_validated_at ?? null,
              row.last_error ?? null,
              row.created_at,
            ]
          )

          // Migrate secrets
          await client.query(
            `INSERT INTO logistics_provider_secrets (provider_id, tenant_id, encrypted_payload, secret_fields, created_at, updated_at)
             SELECT 'melhor-envio', mcs.tenant_id, mcs.encrypted_payload, mcs.secret_fields, mcs.created_at, now()
             FROM marketplace_connection_secrets mcs
             WHERE mcs.connection_id = $1
             ON CONFLICT (tenant_id, provider_id) DO NOTHING`,
            [row.connection_id]
          )

          // Remove from marketplace_connections (CASCADE deletes secrets)
          await client.query(
            `DELETE FROM marketplace_connections WHERE tenant_id = $1 AND channel_id = 'melhor-envio'`,
            [tenant]
          )
        }
      }
    },
    tenantId
  )

  infraEnsured = true
}

function mapProviderRow(row: Record<string, unknown>): LogisticsProvider {
  return {
    providerId: String(row.provider_id),
    displayName: String(row.display_name),
    providerType: (row.provider_type as LogisticsProviderType) ?? 'shipping',
    authStrategy: row.auth_strategy as LogisticsProviderAuthStrategy,
    status: row.status as LogisticsProviderStatus,
    hasStoredSecret: Boolean(row.has_stored_secret),
    lastValidatedAt:
      typeof row.last_validated_at === 'string' ? row.last_validated_at : undefined,
    lastError: typeof row.last_error === 'string' ? row.last_error : undefined,
    updatedAt: String(row.updated_at),
  }
}

export async function listLogisticsProviders(tenantId?: string): Promise<LogisticsProvider[]> {
  await ensureLogisticsInfrastructure(tenantId)
  const tenant = effectiveTenantId(tenantId)

  const result = await transaction(async (client) => {
    return client.query(
      `SELECT provider_id, display_name, provider_type, auth_strategy, status, has_stored_secret, last_validated_at, last_error, updated_at
       FROM logistics_providers
       WHERE tenant_id = $1
       ORDER BY provider_id`,
      [tenant]
    )
  }, tenantId)

  return result.rows.map((row) => mapProviderRow(row as Record<string, unknown>))
}

type UpsertLogisticsProviderInput = {
  providerId: string
  displayName: string
  providerType?: LogisticsProviderType
  authStrategy: LogisticsProviderAuthStrategy
  status: LogisticsProviderStatus
  lastValidatedAt?: string
  lastError?: string
  secretPayload?: Record<string, unknown>
}

export async function upsertLogisticsProvider(
  input: UpsertLogisticsProviderInput,
  tenantId?: string
): Promise<LogisticsProvider> {
  await ensureLogisticsInfrastructure(tenantId)
  const tenant = effectiveTenantId(tenantId)
  const hasSecretPayload =
    input.secretPayload &&
    Object.values(input.secretPayload).some(
      (value) => typeof value === 'string' && value.trim().length > 0
    )

  return transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO logistics_providers (
        provider_id, tenant_id, display_name, provider_type, auth_strategy, status,
        has_stored_secret, last_validated_at, last_error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id, provider_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider_type = EXCLUDED.provider_type,
        auth_strategy = EXCLUDED.auth_strategy,
        status = EXCLUDED.status,
        has_stored_secret = logistics_providers.has_stored_secret OR EXCLUDED.has_stored_secret,
        last_validated_at = EXCLUDED.last_validated_at,
        last_error = EXCLUDED.last_error,
        updated_at = now()
      RETURNING provider_id, display_name, provider_type, auth_strategy, status, has_stored_secret, last_validated_at, last_error, updated_at`,
      [
        input.providerId,
        tenant,
        input.displayName,
        input.providerType ?? 'shipping',
        input.authStrategy,
        input.status,
        Boolean(hasSecretPayload),
        input.lastValidatedAt ?? null,
        input.lastError ?? null,
      ]
    )

    const row = result.rows[0] as Record<string, unknown>

    if (hasSecretPayload) {
      const encrypted = encryptSecretPayload(input.secretPayload!)
      const secretFields = Object.keys(input.secretPayload!).filter((field) => {
        const value = input.secretPayload?.[field]
        return typeof value === 'string' && value.trim().length > 0
      })

      await client.query(
        `INSERT INTO logistics_provider_secrets (provider_id, tenant_id, encrypted_payload, secret_fields)
         VALUES ($1, $2, $3::jsonb, $4::text[])
         ON CONFLICT (tenant_id, provider_id)
         DO UPDATE SET
           encrypted_payload = EXCLUDED.encrypted_payload,
           secret_fields = EXCLUDED.secret_fields,
           updated_at = now()`,
        [input.providerId, tenant, JSON.stringify(encrypted), secretFields]
      )
    }

    return mapProviderRow(row)
  }, tenantId)
}

export async function getLogisticsProviderByProviderId(
  providerId: string,
  tenantId?: string
): Promise<LogisticsProvider | null> {
  await ensureLogisticsInfrastructure(tenantId)
  const tenant = effectiveTenantId(tenantId)

  const result = await transaction(async (client) => {
    return client.query(
      `SELECT provider_id, display_name, provider_type, auth_strategy, status, has_stored_secret, last_validated_at, last_error, updated_at
       FROM logistics_providers
       WHERE tenant_id = $1 AND provider_id = $2
       LIMIT 1`,
      [tenant, providerId]
    )
  }, tenantId)

  const row = result.rows[0] as Record<string, unknown> | undefined
  return row ? mapProviderRow(row) : null
}

export async function getDecryptedLogisticsSecrets(
  providerId: string,
  tenantId?: string
): Promise<Record<string, unknown> | null> {
  await ensureLogisticsInfrastructure(tenantId)
  const tenant = effectiveTenantId(tenantId)

  const result = await transaction(async (client) => {
    return client.query(
      `SELECT encrypted_payload
       FROM logistics_provider_secrets
       WHERE tenant_id = $1 AND provider_id = $2
       LIMIT 1`,
      [tenant, providerId]
    )
  }, tenantId)

  const row = result.rows[0] as Record<string, unknown> | undefined
  if (!row) return null

  try {
    return decryptSecretPayload(row.encrypted_payload as Parameters<typeof decryptSecretPayload>[0])
  } catch {
    return null
  }
}