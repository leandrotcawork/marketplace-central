CREATE TABLE IF NOT EXISTS platform_migrations (
  migration_id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
