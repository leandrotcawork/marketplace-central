CREATE TABLE IF NOT EXISTS marketplace_connections (
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
);

CREATE TABLE IF NOT EXISTS marketplace_connection_secrets (
  connection_id text PRIMARY KEY REFERENCES marketplace_connections(connection_id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  encrypted_payload jsonb NOT NULL,
  secret_fields text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_sync_jobs (
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
);

CREATE TABLE IF NOT EXISTS marketplace_remote_listings (
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
);

CREATE INDEX IF NOT EXISTS idx_marketplace_connections_tenant
  ON marketplace_connections (tenant_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_sync_jobs_tenant
  ON marketplace_sync_jobs (tenant_id, channel_id, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_remote_listings_tenant
  ON marketplace_remote_listings (tenant_id, channel_id, product_id);
