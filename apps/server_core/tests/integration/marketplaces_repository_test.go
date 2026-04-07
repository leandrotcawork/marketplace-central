package integration

import (
	"context"
	"os"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/adapters/postgres"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func TestMarketplacesRepositorySaveAndList(t *testing.T) {
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

	repo := postgres.NewRepository(pool, cfg.DefaultTenantID)

	account := domain.Account{
		TenantID:       cfg.DefaultTenantID,
		AccountID:      "acct-test",
		ChannelCode:    "vtex",
		DisplayName:    "VTEX",
		Status:         "active",
		ConnectionMode: "api",
	}

	if err := repo.SaveAccount(context.Background(), account); err != nil {
		t.Fatalf("save account error: %v", err)
	}

	accounts, err := repo.ListAccounts(context.Background())
	if err != nil {
		t.Fatalf("list accounts error: %v", err)
	}
	if len(accounts) == 0 {
		t.Fatalf("expected accounts")
	}
}

func TestMarketplacesRepositorySaveAndListPoliciesIncludeShippingProvider(t *testing.T) {
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

	repo := postgres.NewRepository(pool, cfg.DefaultTenantID)

	account := domain.Account{
		TenantID:       cfg.DefaultTenantID,
		AccountID:      "acct-policy-test",
		ChannelCode:    "vtex",
		DisplayName:    "VTEX Policy Test",
		Status:         "active",
		ConnectionMode: "api",
	}

	if err := repo.SaveAccount(context.Background(), account); err != nil {
		t.Fatalf("save account error: %v", err)
	}

	policy := domain.Policy{
		TenantID:           cfg.DefaultTenantID,
		PolicyID:           "policy-shipping-provider-test",
		AccountID:          account.AccountID,
		CommissionPercent:  0.16,
		FixedFeeAmount:     5.0,
		DefaultShipping:    10.0,
		TaxPercent:         0,
		MinMarginPercent:   0.10,
		SLAQuestionMinutes: 60,
		SLADispatchHours:   24,
		ShippingProvider:   "marketplace",
	}

	if err := repo.SavePolicy(context.Background(), policy); err != nil {
		t.Fatalf("save policy error: %v", err)
	}

	policies, err := repo.ListPolicies(context.Background())
	if err != nil {
		t.Fatalf("list policies error: %v", err)
	}

	for _, listedPolicy := range policies {
		if listedPolicy.PolicyID == policy.PolicyID {
			if listedPolicy.ShippingProvider != "marketplace" {
				t.Fatalf("expected shipping provider marketplace, got %q", listedPolicy.ShippingProvider)
			}
			return
		}
	}

	t.Fatalf("expected to find policy %s", policy.PolicyID)
}

func TestMarketplacesRepositorySavePolicyUpsertUpdatesShippingProvider(t *testing.T) {
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

	repo := postgres.NewRepository(pool, cfg.DefaultTenantID)

	account := domain.Account{
		TenantID:       cfg.DefaultTenantID,
		AccountID:      "acct-policy-upsert-test",
		ChannelCode:    "vtex",
		DisplayName:    "VTEX Policy Upsert Test",
		Status:         "active",
		ConnectionMode: "api",
	}

	if err := repo.SaveAccount(context.Background(), account); err != nil {
		t.Fatalf("save account error: %v", err)
	}

	policy := domain.Policy{
		TenantID:           cfg.DefaultTenantID,
		PolicyID:           "policy-upsert-shipping-provider-test",
		AccountID:          account.AccountID,
		CommissionPercent:  0.16,
		FixedFeeAmount:     5.0,
		DefaultShipping:    10.0,
		TaxPercent:         0,
		MinMarginPercent:   0.10,
		SLAQuestionMinutes: 60,
		SLADispatchHours:   24,
		ShippingProvider:   "fixed",
	}

	if err := repo.SavePolicy(context.Background(), policy); err != nil {
		t.Fatalf("save policy error: %v", err)
	}

	policy.ShippingProvider = "marketplace"
	if err := repo.SavePolicy(context.Background(), policy); err != nil {
		t.Fatalf("upsert policy error: %v", err)
	}

	policies, err := repo.ListPolicies(context.Background())
	if err != nil {
		t.Fatalf("list policies error: %v", err)
	}

	for _, listedPolicy := range policies {
		if listedPolicy.PolicyID == policy.PolicyID {
			if listedPolicy.ShippingProvider != "marketplace" {
				t.Fatalf("expected updated shipping provider marketplace, got %q", listedPolicy.ShippingProvider)
			}
			return
		}
	}

	t.Fatalf("expected to find policy %s", policy.PolicyID)
}
