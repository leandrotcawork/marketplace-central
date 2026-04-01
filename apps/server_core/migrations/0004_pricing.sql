CREATE TABLE IF NOT EXISTS pricing_simulations (
  simulation_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  product_id text NOT NULL,
  account_id text NOT NULL,
  input_snapshot_json jsonb NOT NULL,
  result_snapshot_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_manual_overrides (
  override_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  product_id text NOT NULL,
  account_id text NOT NULL,
  target_price_amount numeric(14,2) NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
