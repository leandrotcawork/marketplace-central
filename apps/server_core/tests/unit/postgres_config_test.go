package unit

import (
	"testing"

	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func TestLoadConfigBuildsTenantReadyDefaults(t *testing.T) {
	t.Setenv("MC_DATABASE_URL", "postgres://postgres:postgres@localhost:5432/marketplace_central?sslmode=disable")
	t.Setenv("MC_DEFAULT_TENANT_ID", "tenant_default")

	cfg, err := pgdb.LoadConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.DefaultTenantID != "tenant_default" {
		t.Fatalf("expected tenant_default, got %q", cfg.DefaultTenantID)
	}

	if cfg.DatabaseURL == "" {
		t.Fatal("expected database url")
	}
}

func TestLoadConfigDefaultsTenantWhenUnset(t *testing.T) {
	t.Setenv("MC_DATABASE_URL", "postgres://postgres:postgres@localhost:5432/marketplace_central?sslmode=disable")
	t.Setenv("MC_DEFAULT_TENANT_ID", "")

	cfg, err := pgdb.LoadConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.DefaultTenantID != "tenant_default" {
		t.Fatalf("expected tenant_default, got %q", cfg.DefaultTenantID)
	}
}
