package pgdb

import "testing"

func TestLoadConfigRequiresEncryptionKey(t *testing.T) {
	t.Setenv("MC_DATABASE_URL", "postgres://localhost/marketplace")
	t.Setenv("MC_DEFAULT_TENANT_ID", "tenant_custom")
	t.Setenv("MPC_ENCRYPTION_KEY", "")

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected error when MPC_ENCRYPTION_KEY is empty")
	}
}

func TestLoadConfigDefaultsTenantID(t *testing.T) {
	t.Setenv("MC_DATABASE_URL", "postgres://localhost/marketplace")
	t.Setenv("MC_DEFAULT_TENANT_ID", "")
	t.Setenv("MPC_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DefaultTenantID != "tenant_default" {
		t.Fatalf("expected tenant_default, got %q", cfg.DefaultTenantID)
	}
}
