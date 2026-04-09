-- Expand source CHECK on marketplace_fee_schedules to accept 'seed'
-- (used by stub-seeded channels: Amazon, Leroy Merlin, Madeira Madeira).
-- Migration 0014 did this for marketplace_definitions but missed this table.

ALTER TABLE marketplace_fee_schedules
  DROP CONSTRAINT IF EXISTS marketplace_fee_schedules_source_check;

ALTER TABLE marketplace_fee_schedules
  ADD CONSTRAINT marketplace_fee_schedules_source_check
  CHECK (source IN ('api_sync', 'seeded', 'manual', 'seed'));
