CREATE TABLE IF NOT EXISTS marketplace_fee_schedules (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_code   text NOT NULL REFERENCES marketplace_definitions(marketplace_code),
    category_id        text NOT NULL,
    listing_type       text,
    commission_percent numeric(8,4) NOT NULL,
    fixed_fee_amount   numeric(14,2) NOT NULL DEFAULT 0,
    notes              text,
    source             text NOT NULL CHECK (source IN ('api_sync', 'seeded', 'manual')),
    synced_at          timestamptz NOT NULL DEFAULT now(),
    valid_from         date,
    valid_to           date,
    UNIQUE NULLS NOT DISTINCT (marketplace_code, category_id, listing_type)
);

CREATE INDEX IF NOT EXISTS idx_fee_schedules_lookup
    ON marketplace_fee_schedules (marketplace_code, category_id);
