ALTER TABLE marketplace_pricing_policies
    ADD COLUMN IF NOT EXISTS commission_override numeric(8,4);

COMMENT ON COLUMN marketplace_pricing_policies.commission_override IS
    'When set, overrides fee_schedules lookup. Use for tenants with non-standard contract rates.';
