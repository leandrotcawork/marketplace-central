CREATE TABLE classifications (
    classification_id   TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    name                TEXT NOT NULL,
    ai_context          TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_classifications_tenant ON classifications(tenant_id);

CREATE TABLE classification_products (
    classification_id   TEXT NOT NULL REFERENCES classifications(classification_id) ON DELETE CASCADE,
    tenant_id           TEXT NOT NULL,
    product_id          TEXT NOT NULL,
    added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, classification_id, product_id)
);

CREATE INDEX idx_classification_products_tenant ON classification_products(tenant_id);
