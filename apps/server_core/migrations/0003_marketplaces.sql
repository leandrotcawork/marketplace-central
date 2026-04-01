CREATE TABLE IF NOT EXISTS marketplace_accounts (
  account_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  channel_code text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL,
  connection_mode text NOT NULL,
  manual_credentials_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_pricing_policies (
  policy_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  account_id text NOT NULL REFERENCES marketplace_accounts(account_id),
  commission_percent numeric(8,2) NOT NULL,
  fixed_fee_amount numeric(14,2) NOT NULL,
  default_shipping_amount numeric(14,2) NOT NULL,
  tax_percent numeric(8,2) NOT NULL DEFAULT 0,
  min_margin_percent numeric(8,2) NOT NULL DEFAULT 0,
  sla_question_minutes integer NOT NULL DEFAULT 60,
  sla_dispatch_hours integer NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
