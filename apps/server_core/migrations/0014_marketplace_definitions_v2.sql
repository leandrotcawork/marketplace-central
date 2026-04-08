-- Add auth_strategy, capability_profile, metadata, is_active to marketplace_definitions.
-- capability_profile replaces the old capabilities text[] (now computed from plugin code).
-- is_active is the canonical active flag going forward; old `active` is deprecated (drop in 0015).

ALTER TABLE marketplace_definitions
  ADD COLUMN IF NOT EXISTS auth_strategy      text    NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS capability_profile jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata           jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active          boolean NOT NULL DEFAULT true;

-- Backfill is_active from the old active column so existing rows are consistent.
UPDATE marketplace_definitions SET is_active = active;

COMMENT ON COLUMN marketplace_definitions.active IS 'Deprecated: use is_active. Will be dropped in migration 0015.';
