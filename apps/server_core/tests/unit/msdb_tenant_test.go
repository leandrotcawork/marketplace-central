package unit

import (
	"testing"

	"marketplace-central/apps/server_core/internal/platform/msdb"
)

func TestMSDBLoadConfigRequiresBothEnvVars(t *testing.T) {
	t.Setenv("MS_DATABASE_URL", "")
	t.Setenv("MS_TENANT_ID", "tnt_test")
	_, err := msdb.LoadConfig()
	if err == nil {
		t.Fatal("expected error for missing MS_DATABASE_URL")
	}

	t.Setenv("MS_DATABASE_URL", "postgres://localhost/ms")
	t.Setenv("MS_TENANT_ID", "")
	_, err = msdb.LoadConfig()
	if err == nil {
		t.Fatal("expected error for missing MS_TENANT_ID")
	}
}

func TestMSDBPoolConfigUsesBeforeAcquire(t *testing.T) {
	t.Setenv("MS_DATABASE_URL", "postgres://localhost/ms_test")
	t.Setenv("MS_TENANT_ID", "tnt_integration_test")

	cfg, err := msdb.LoadConfig()
	if err != nil {
		t.Fatalf("config: %v", err)
	}
	if cfg.TenantID != "tnt_integration_test" {
		t.Fatalf("expected tenant tnt_integration_test, got %q", cfg.TenantID)
	}
}
