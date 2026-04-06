-- apps/server_core/migrations/0008_simulator_v2.sql

-- Product weight for Melhor Envio freight quotes
ALTER TABLE product_enrichments ADD COLUMN IF NOT EXISTS weight_g NUMERIC(10,3);

-- Shipping provider per marketplace policy
ALTER TABLE marketplace_pricing_policies
    ADD COLUMN IF NOT EXISTS shipping_provider TEXT NOT NULL DEFAULT 'fixed';

-- OAuth tokens for third-party logistics integrations (Melhor Envio, etc.)
CREATE TABLE IF NOT EXISTS connector_oauth_tokens (
    channel_code  TEXT NOT NULL,
    tenant_id     TEXT NOT NULL,
    access_token  TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, channel_code)
);
