UPDATE marketplace_pricing_policies
SET shipping_provider = lower(btrim(shipping_provider))
WHERE shipping_provider <> lower(btrim(shipping_provider));

UPDATE marketplace_pricing_policies
SET shipping_provider = 'fixed'
WHERE shipping_provider NOT IN ('fixed', 'melhor_envio', 'marketplace');

ALTER TABLE marketplace_pricing_policies
    ALTER COLUMN shipping_provider SET DEFAULT 'fixed';

ALTER TABLE marketplace_pricing_policies
    DROP CONSTRAINT IF EXISTS marketplace_pricing_policies_shipping_provider_check;

ALTER TABLE marketplace_pricing_policies
    ADD CONSTRAINT marketplace_pricing_policies_shipping_provider_check
        CHECK (shipping_provider IN ('fixed', 'melhor_envio', 'marketplace'));
