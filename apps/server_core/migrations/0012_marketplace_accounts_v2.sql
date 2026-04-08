ALTER TABLE marketplace_accounts
    ADD COLUMN IF NOT EXISTS marketplace_code  text REFERENCES marketplace_definitions(marketplace_code),
    ADD COLUMN IF NOT EXISTS credentials_json  jsonb,
    ADD COLUMN IF NOT EXISTS last_fee_sync_at  timestamptz;

-- Backfill marketplace_code from channel_code for known mappings
UPDATE marketplace_accounts
SET marketplace_code = channel_code
WHERE channel_code IN ('mercado_livre', 'shopee', 'magalu', 'amazon', 'leroy_merlin', 'madeira_madeira')
  AND marketplace_code IS NULL;

-- Migrate existing credential data to new column
UPDATE marketplace_accounts
SET credentials_json = manual_credentials_json
WHERE manual_credentials_json IS NOT NULL
  AND credentials_json IS NULL;

-- Index for tenant-scoped account lookups by marketplace
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_marketplace_code
    ON marketplace_accounts (tenant_id, marketplace_code);

-- Note: manual_credentials_json is kept read-only for backward compatibility
-- during this release. It can be dropped in a follow-up migration once
-- all writes go through credentials_json.
