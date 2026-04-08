CREATE TABLE IF NOT EXISTS marketplace_definitions (
    marketplace_code  text PRIMARY KEY,
    display_name      text NOT NULL,
    fee_source        text NOT NULL CHECK (fee_source IN ('api_sync', 'static_table')),
    capabilities      text[] NOT NULL DEFAULT '{}',
    credential_schema jsonb NOT NULL DEFAULT '[]',
    active            boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- Seed initial marketplace definitions so migration 0012 FK backfill is valid
INSERT INTO marketplace_definitions (marketplace_code, display_name, fee_source, capabilities, credential_schema)
VALUES
  ('mercado_livre', 'Mercado Livre', 'api_sync',     ARRAY['fee_api','orders','messages'],
   '[{"key":"client_id","label":"Client ID","secret":false},{"key":"client_secret","label":"Client Secret","secret":true},{"key":"redirect_uri","label":"Redirect URI","secret":false}]'),
  ('shopee',        'Shopee',        'static_table',  ARRAY['orders','messages'],
   '[{"key":"partner_id","label":"Partner ID","secret":false},{"key":"secret_key","label":"Secret Key","secret":true},{"key":"shop_id","label":"Shop ID","secret":false}]'),
  ('magalu',        'Magalu',        'static_table',  ARRAY['orders','messages'],
   '[{"key":"api_key","label":"API Key","secret":true},{"key":"seller_id","label":"Seller ID","secret":false}]')
ON CONFLICT (marketplace_code) DO NOTHING;
