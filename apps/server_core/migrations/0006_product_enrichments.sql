-- apps/server_core/migrations/0006_product_enrichments.sql
CREATE TABLE product_enrichments (
    product_id              TEXT NOT NULL,
    tenant_id               TEXT NOT NULL,
    height_cm               NUMERIC(10,2),
    width_cm                NUMERIC(10,2),
    length_cm               NUMERIC(10,2),
    suggested_price_amount  NUMERIC(14,2),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, product_id)
);
