CREATE TABLE IF NOT EXISTS catalog_products (
  product_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  cost_amount numeric(14,2) NOT NULL,
  weight_grams integer NOT NULL DEFAULT 0,
  width_cm numeric(10,2) NOT NULL DEFAULT 0,
  height_cm numeric(10,2) NOT NULL DEFAULT 0,
  length_cm numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
