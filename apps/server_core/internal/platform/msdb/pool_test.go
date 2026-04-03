package msdb

import "testing"

func TestLoadConfigRequiresDatabaseURL(t *testing.T) {
	t.Setenv("MS_DATABASE_URL", "")
	t.Setenv("MS_TENANT_ID", "tnt_test")

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected error when MS_DATABASE_URL is empty")
	}
}

func TestLoadConfigRequiresTenantID(t *testing.T) {
	t.Setenv("MS_DATABASE_URL", "postgres://localhost/ms")
	t.Setenv("MS_TENANT_ID", "")

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected error when MS_TENANT_ID is empty")
	}
}

func TestLoadConfigSuccess(t *testing.T) {
	t.Setenv("MS_DATABASE_URL", "postgres://localhost/ms")
	t.Setenv("MS_TENANT_ID", "tnt_test")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DatabaseURL != "postgres://localhost/ms" {
		t.Fatalf("expected postgres://localhost/ms, got %q", cfg.DatabaseURL)
	}
	if cfg.TenantID != "tnt_test" {
		t.Fatalf("expected tnt_test, got %q", cfg.TenantID)
	}
}
