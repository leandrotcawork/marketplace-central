-- Harden tenant isolation in marketplace account/policy tables.
-- This keeps MPC tables merge-ready while ensuring tenant-scoped identity.

-- marketplace_accounts: move from global PK(account_id) to tenant-scoped PK.
ALTER TABLE marketplace_pricing_policies
  DROP CONSTRAINT IF EXISTS marketplace_pricing_policies_account_id_fkey;

ALTER TABLE marketplace_accounts
  DROP CONSTRAINT IF EXISTS marketplace_accounts_pkey;

ALTER TABLE marketplace_accounts
  ADD CONSTRAINT marketplace_accounts_pkey PRIMARY KEY (tenant_id, account_id);

-- marketplace_pricing_policies: move from global PK(policy_id) to tenant-scoped PK.
ALTER TABLE marketplace_pricing_policies
  DROP CONSTRAINT IF EXISTS marketplace_pricing_policies_pkey;

ALTER TABLE marketplace_pricing_policies
  ADD CONSTRAINT marketplace_pricing_policies_pkey PRIMARY KEY (tenant_id, policy_id);

ALTER TABLE marketplace_pricing_policies
  ADD CONSTRAINT marketplace_pricing_policies_account_id_fkey
  FOREIGN KEY (tenant_id, account_id)
  REFERENCES marketplace_accounts(tenant_id, account_id)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

-- Tenant-scoped lookup/index performance.
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_tenant_account
  ON marketplace_accounts (tenant_id, account_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_pricing_policies_tenant_policy
  ON marketplace_pricing_policies (tenant_id, policy_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_pricing_policies_tenant_account
  ON marketplace_pricing_policies (tenant_id, account_id);
