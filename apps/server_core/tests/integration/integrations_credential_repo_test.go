package integration

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	integrationspostgres "marketplace-central/apps/server_core/internal/modules/integrations/adapters/postgres"
	integrationsdomain "marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func TestCredentialRepositorySaveCredentialVersionMaintainsSingleActiveCredential(t *testing.T) {
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

	installationRepo := integrationspostgres.NewInstallationRepository(pool, cfg.DefaultTenantID)
	credentialRepo := integrationspostgres.NewCredentialRepository(pool, cfg.DefaultTenantID)

	installationID := fmt.Sprintf("inst-cred-rotate-%d", time.Now().UTC().UnixNano())
	now := time.Now().UTC()
	if err := installationRepo.CreateInstallation(context.Background(), integrationsdomain.Installation{
		InstallationID: installationID,
		TenantID:       cfg.DefaultTenantID,
		ProviderCode:   "magalu",
		Family:         integrationsdomain.IntegrationFamilyMarketplace,
		DisplayName:    "Magalu Test",
		Status:         integrationsdomain.InstallationStatusDraft,
		HealthStatus:   integrationsdomain.HealthStatusHealthy,
		CreatedAt:      now,
		UpdatedAt:      now,
	}); err != nil {
		t.Fatalf("create installation error: %v", err)
	}

	cred1 := integrationsdomain.Credential{
		CredentialID:     fmt.Sprintf("cred-1-%d", now.UnixNano()),
		TenantID:         cfg.DefaultTenantID,
		InstallationID:   installationID,
		Version:          1,
		SecretType:       "oauth2",
		EncryptedPayload: []byte(`{"access_token":"a1"}`),
		EncryptionKeyID:  "local-key-v1",
		IsActive:         true,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := credentialRepo.SaveCredentialVersion(context.Background(), cred1); err != nil {
		t.Fatalf("save credential 1 error: %v", err)
	}

	cred2 := integrationsdomain.Credential{
		CredentialID:     fmt.Sprintf("cred-2-%d", now.UnixNano()),
		TenantID:         cfg.DefaultTenantID,
		InstallationID:   installationID,
		Version:          2,
		SecretType:       "oauth2",
		EncryptedPayload: []byte(`{"access_token":"a2"}`),
		EncryptionKeyID:  "local-key-v1",
		IsActive:         true,
		CreatedAt:        now.Add(time.Second),
		UpdatedAt:        now.Add(time.Second),
	}
	if err := credentialRepo.SaveCredentialVersion(context.Background(), cred2); err != nil {
		t.Fatalf("save credential 2 error: %v", err)
	}

	active, found, err := credentialRepo.GetActiveCredential(context.Background(), installationID)
	if err != nil {
		t.Fatalf("GetActiveCredential error: %v", err)
	}
	if !found {
		t.Fatal("expected active credential")
	}
	if active.CredentialID != cred2.CredentialID {
		t.Fatalf("active credential = %q, want %q", active.CredentialID, cred2.CredentialID)
	}

	var activeCount int
	if err := pool.QueryRow(context.Background(), `
		SELECT count(*)
		FROM integration_credentials
		WHERE tenant_id = $1
		  AND installation_id = $2
		  AND is_active = true
	`, cfg.DefaultTenantID, installationID).Scan(&activeCount); err != nil {
		t.Fatalf("count active credentials error: %v", err)
	}
	if activeCount != 1 {
		t.Fatalf("active credential count = %d, want 1", activeCount)
	}
}

func TestCredentialRepositoryConcurrentActiveRotationDoesNotViolateUniqueIndex(t *testing.T) {
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

	installationRepo := integrationspostgres.NewInstallationRepository(pool, cfg.DefaultTenantID)
	credentialRepo := integrationspostgres.NewCredentialRepository(pool, cfg.DefaultTenantID)

	installationID := fmt.Sprintf("inst-cred-concurrent-%d", time.Now().UTC().UnixNano())
	now := time.Now().UTC()
	if err := installationRepo.CreateInstallation(context.Background(), integrationsdomain.Installation{
		InstallationID: installationID,
		TenantID:       cfg.DefaultTenantID,
		ProviderCode:   "magalu",
		Family:         integrationsdomain.IntegrationFamilyMarketplace,
		DisplayName:    "Magalu Concurrent Test",
		Status:         integrationsdomain.InstallationStatusDraft,
		HealthStatus:   integrationsdomain.HealthStatusHealthy,
		CreatedAt:      now,
		UpdatedAt:      now,
	}); err != nil {
		t.Fatalf("create installation error: %v", err)
	}

	seed := integrationsdomain.Credential{
		CredentialID:     fmt.Sprintf("cred-seed-%d", now.UnixNano()),
		TenantID:         cfg.DefaultTenantID,
		InstallationID:   installationID,
		Version:          1,
		SecretType:       "oauth2",
		EncryptedPayload: []byte(`{"access_token":"seed"}`),
		EncryptionKeyID:  "local-key-v1",
		IsActive:         true,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := credentialRepo.SaveCredentialVersion(context.Background(), seed); err != nil {
		t.Fatalf("seed save error: %v", err)
	}

	start := make(chan struct{})
	errCh := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			cred := integrationsdomain.Credential{
				CredentialID:     fmt.Sprintf("cred-concurrent-%d-%d", i, time.Now().UTC().UnixNano()),
				TenantID:         cfg.DefaultTenantID,
				InstallationID:   installationID,
				Version:          i + 2,
				SecretType:       "oauth2",
				EncryptedPayload: []byte(fmt.Sprintf(`{"access_token":"tok-%d"}`, i)),
				EncryptionKeyID:  "local-key-v1",
				IsActive:         true,
				CreatedAt:        time.Now().UTC(),
				UpdatedAt:        time.Now().UTC(),
			}
			errCh <- credentialRepo.SaveCredentialVersion(context.Background(), cred)
		}()
	}
	close(start)
	wg.Wait()
	close(errCh)

	for saveErr := range errCh {
		if saveErr != nil {
			t.Fatalf("concurrent save error: %v", saveErr)
		}
	}

	var activeCount int
	if err := pool.QueryRow(context.Background(), `
		SELECT count(*)
		FROM integration_credentials
		WHERE tenant_id = $1
		  AND installation_id = $2
		  AND is_active = true
	`, cfg.DefaultTenantID, installationID).Scan(&activeCount); err != nil {
		t.Fatalf("count active credentials error: %v", err)
	}
	if activeCount != 1 {
		t.Fatalf("active credential count = %d, want 1", activeCount)
	}
}
