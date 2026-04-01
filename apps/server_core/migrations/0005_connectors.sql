-- Publication batches: one per user-triggered publish action
CREATE TABLE IF NOT EXISTS publication_batches (
  batch_id         text PRIMARY KEY,
  tenant_id        text NOT NULL,
  vtex_account     text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  total_products   integer NOT NULL DEFAULT 0,
  succeeded_count  integer NOT NULL DEFAULT 0,
  failed_count     integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

-- Publication operations: one per product in a batch
CREATE TABLE IF NOT EXISTS publication_operations (
  operation_id  text PRIMARY KEY,
  batch_id      text NOT NULL REFERENCES publication_batches(batch_id),
  tenant_id     text NOT NULL,
  vtex_account  text NOT NULL,
  product_id    text NOT NULL,
  current_step  text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'pending',
  error_code    text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate active operations for the same product+account
CREATE UNIQUE INDEX IF NOT EXISTS idx_publication_operations_active
  ON publication_operations (tenant_id, vtex_account, product_id)
  WHERE status IN ('pending', 'in_progress');

-- Pipeline step results: one per step per operation
CREATE TABLE IF NOT EXISTS pipeline_step_results (
  step_result_id text PRIMARY KEY,
  operation_id   text NOT NULL REFERENCES publication_operations(operation_id),
  tenant_id      text NOT NULL,
  step_name      text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  vtex_entity_id text,
  attempt_count  integer NOT NULL DEFAULT 0,
  error_code     text NOT NULL DEFAULT '',
  error_message  text NOT NULL DEFAULT '',
  started_at     timestamptz,
  completed_at   timestamptz
);

-- VTEX entity mappings: durable local_id <-> vtex_id per account
CREATE TABLE IF NOT EXISTS vtex_entity_mappings (
  mapping_id   text PRIMARY KEY,
  tenant_id    text NOT NULL,
  vtex_account text NOT NULL,
  entity_type  text NOT NULL,
  local_id     text NOT NULL,
  vtex_id      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vtex_account, entity_type, local_id)
);
