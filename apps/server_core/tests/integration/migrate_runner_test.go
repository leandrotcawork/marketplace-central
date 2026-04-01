package integration

import (
	"context"
	"os"
	"testing"

	"marketplace-central/apps/server_core/internal/platform/migrate"
	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func TestMigrationRunnerIsIdempotent(t *testing.T) {
	if os.Getenv("MC_DATABASE_URL") == "" {
		t.Skip("MC_DATABASE_URL not set")
	}

	cfg, err := pgdb.LoadConfig()
	if err != nil {
		t.Fatalf("config error: %v", err)
	}

	pool, err := pgdb.NewPool(context.Background(), cfg)
	if err != nil {
		t.Fatalf("pool error: %v", err)
	}
	defer pool.Close()

	migrationsDir := os.Getenv("MC_MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "../../../../migrations" // relative from tests/integration/ to apps/server_core/migrations/
	}

	// First run: apply pending migrations
	applied, err := migrate.Run(context.Background(), pool, migrationsDir)
	if err != nil {
		t.Fatalf("first run error: %v", err)
	}
	t.Logf("first run applied %d migrations", applied)

	// Second run: must apply zero (idempotent)
	applied2, err := migrate.Run(context.Background(), pool, migrationsDir)
	if err != nil {
		t.Fatalf("second run error: %v", err)
	}
	if applied2 != 0 {
		t.Fatalf("expected 0 migrations on second run, got %d", applied2)
	}

	// Verify schema_migrations has entries
	var count int
	err = pool.QueryRow(context.Background(), `SELECT count(*) FROM schema_migrations`).Scan(&count)
	if err != nil {
		t.Fatalf("query error: %v", err)
	}
	if count == 0 {
		t.Fatal("expected applied migrations in schema_migrations")
	}
}
