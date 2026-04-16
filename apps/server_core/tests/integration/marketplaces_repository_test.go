package integration

import (
	"context"
	"os"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/adapters/postgres"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/platform/pgdb"
)

func TestMarketplacesRepositoryTenantIsolationForSameIDs(t *testing.T) {
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

	tenantA := "tenant_iso_a"
	tenantB := "tenant_iso_b"
	accountID := "acct-isolation-shared"
	policyID := "policy-isolation-shared"

	repoA := postgres.NewRepository(pool, tenantA)
	repoB := postgres.NewRepository(pool, tenantB)

	accountA := domain.Account{
		TenantID:       tenantA,
		AccountID:      accountID,
		ChannelCode:    "vtex",
		DisplayName:    "Tenant A",
		Status:         "active",
		ConnectionMode: "api",
	}
	accountB := domain.Account{
		TenantID:       tenantB,
		AccountID:      accountID,
		ChannelCode:    "vtex",
		DisplayName:    "Tenant B",
		Status:         "active",
		ConnectionMode: "api",
	}

	if err := repoA.SaveAccount(context.Background(), accountA); err != nil {
		t.Fatalf("save account A error: %v", err)
	}
	if err := repoB.SaveAccount(context.Background(), accountB); err != nil {
		t.Fatalf("save account B error: %v", err)
	}

	policyA := domain.Policy{
		TenantID:           tenantA,
		PolicyID:           policyID,
		AccountID:          accountID,
		CommissionPercent:  0.12,
		FixedFeeAmount:     1,
		DefaultShipping:    2,
		TaxPercent:         0,
		MinMarginPercent:   0.05,
		SLAQuestionMinutes: 60,
		SLADispatchHours:   24,
		ShippingProvider:   "fixed",
	}
	policyB := domain.Policy{
		TenantID:           tenantB,
		PolicyID:           policyID,
		AccountID:          accountID,
		CommissionPercent:  0.24,
		FixedFeeAmount:     3,
		DefaultShipping:    4,
		TaxPercent:         0,
		MinMarginPercent:   0.10,
		SLAQuestionMinutes: 120,
		SLADispatchHours:   48,
		ShippingProvider:   "marketplace",
	}

	if err := repoA.SavePolicy(context.Background(), policyA); err != nil {
		t.Fatalf("save policy A error: %v", err)
	}
	if err := repoB.SavePolicy(context.Background(), policyB); err != nil {
		t.Fatalf("save policy B error: %v", err)
	}

	accountsA, err := repoA.ListAccounts(context.Background())
	if err != nil {
		t.Fatalf("list accounts A error: %v", err)
	}
	accountsB, err := repoB.ListAccounts(context.Background())
	if err != nil {
		t.Fatalf("list accounts B error: %v", err)
	}

	var foundA, foundB bool
	for _, a := range accountsA {
		if a.AccountID == accountID && a.DisplayName == "Tenant A" {
			foundA = true
		}
	}
	for _, a := range accountsB {
		if a.AccountID == accountID && a.DisplayName == "Tenant B" {
			foundB = true
		}
	}
	if !foundA || !foundB {
		t.Fatalf("tenant account isolation failed: foundA=%v foundB=%v", foundA, foundB)
	}

	policiesA, err := repoA.ListPolicies(context.Background())
	if err != nil {
		t.Fatalf("list policies A error: %v", err)
	}
	policiesB, err := repoB.ListPolicies(context.Background())
	if err != nil {
		t.Fatalf("list policies B error: %v", err)
	}

	var policyAFixed, policyBMarket bool
	for _, p := range policiesA {
		if p.PolicyID == policyID && p.CommissionPercent == 0.12 && p.ShippingProvider == "fixed" {
			policyAFixed = true
		}
	}
	for _, p := range policiesB {
		if p.PolicyID == policyID && p.CommissionPercent == 0.24 && p.ShippingProvider == "marketplace" {
			policyBMarket = true
		}
	}
	if !policyAFixed || !policyBMarket {
		t.Fatalf("tenant policy isolation failed: policyAFixed=%v policyBMarket=%v", policyAFixed, policyBMarket)
	}
}

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
