DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'catalog_products'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name = 'catalog_products_pkey'
  ) THEN
    ALTER TABLE catalog_products DROP CONSTRAINT catalog_products_pkey;
  END IF;
END
$$;

ALTER TABLE catalog_products
  ADD CONSTRAINT catalog_products_pkey PRIMARY KEY (tenant_id, product_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_products_tenant_sku
  ON catalog_products (tenant_id, sku);
