package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/pricing/application"
	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type pricingRepoStub struct {
	saved domain.Simulation
}

func (s *pricingRepoStub) SaveSimulation(_ context.Context, simulation domain.Simulation) error {
	s.saved = simulation
	return nil
}

func (s *pricingRepoStub) ListSimulations(context.Context) ([]domain.Simulation, error) {
	return nil, nil
}

func TestRunSimulationCalculatesMarginAndStatus(t *testing.T) {
	repo := &pricingRepoStub{}
	service := application.NewService(repo, "tenant_default")

	simulation, err := service.RunSimulation(context.Background(), application.RunSimulationInput{
		SimulationID:      "sim-001",
		ProductID:         "SKU-001",
		AccountID:         "mercado-livre-main",
		BasePriceAmount:   250,
		CostAmount:        100,
		CommissionPercent: 0.16,
		FixedFeeAmount:    0,
		ShippingAmount:    20,
		MinMarginPercent:  0.12,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if simulation.MarginAmount != 90 {
		t.Fatalf("expected margin 90, got %v", simulation.MarginAmount)
	}

	if simulation.Status != "healthy" {
		t.Fatalf("expected healthy, got %q", simulation.Status)
	}
}

// --- BatchOrchestrator tests ---

type stubProductProvider struct {
	products []pricingports.BatchProduct
}

func (s *stubProductProvider) GetProductsForBatch(_ context.Context, _ []string) ([]pricingports.BatchProduct, error) {
	return s.products, nil
}

type stubPolicyProvider struct {
	policies []pricingports.BatchPolicy
}

func (s *stubPolicyProvider) GetPoliciesForBatch(_ context.Context, _ []string) ([]pricingports.BatchPolicy, error) {
	return s.policies, nil
}

type stubFreightQuoter struct {
	connected bool
	results   map[string]pricingports.FreightResult
}

func (s *stubFreightQuoter) IsConnected(_ context.Context) (bool, error) {
	return s.connected, nil
}

func (s *stubFreightQuoter) QuoteFreight(_ context.Context, _ pricingports.FreightRequest) (map[string]pricingports.FreightResult, error) {
	return s.results, nil
}

func TestBatchOrchestratorCalculatesMarginForAllProductsAndPolicies(t *testing.T) {
	products := []pricingports.BatchProduct{
		{ProductID: "p1", CostAmount: 80, PriceAmount: 150},
		{ProductID: "p2", CostAmount: 50, PriceAmount: 100},
	}
	policies := []pricingports.BatchPolicy{
		{PolicyID: "pol1", CommissionPercent: 0.16, FixedFeeAmount: 0, DefaultShipping: 20, MinMarginPercent: 0.12, ShippingProvider: "fixed"},
	}

	orch := application.NewBatchOrchestrator(
		&stubProductProvider{products: products},
		&stubPolicyProvider{policies: policies},
		&stubFreightQuoter{connected: false},
		"tenant_default",
	)

	result, err := orch.RunBatch(context.Background(), application.BatchRunRequest{
		ProductIDs:  []string{"p1", "p2"},
		PolicyIDs:   []string{"pol1"},
		OriginCEP:   "01310100",
		DestCEP:     "30140071",
		PriceSource: "my_price",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Items) != 2 {
		t.Fatalf("expected 2 items (2 products x 1 policy), got %d", len(result.Items))
	}

	var p1Result application.BatchSimulationItem
	for _, item := range result.Items {
		if item.ProductID == "p1" {
			p1Result = item
		}
	}
	if p1Result.ProductID == "" {
		t.Fatal("no result for p1")
	}
	expectedMarginAmt := 150.0 - 80.0 - (150.0 * 0.16) - 0 - 20.0
	if p1Result.MarginAmount != expectedMarginAmt {
		t.Fatalf("expected margin %v, got %v", expectedMarginAmt, p1Result.MarginAmount)
	}
	if p1Result.Status != "healthy" {
		t.Fatalf("expected healthy, got %q", p1Result.Status)
	}
}

func TestBatchOrchestratorUsesSuggestedPriceWhenRequested(t *testing.T) {
	suggested := 200.0
	products := []pricingports.BatchProduct{
		{ProductID: "p1", CostAmount: 80, PriceAmount: 150, SuggestedPrice: &suggested},
	}
	policies := []pricingports.BatchPolicy{
		{PolicyID: "pol1", CommissionPercent: 0.16, FixedFeeAmount: 0, DefaultShipping: 0, MinMarginPercent: 0.10, ShippingProvider: "fixed"},
	}

	orch := application.NewBatchOrchestrator(
		&stubProductProvider{products: products},
		&stubPolicyProvider{policies: policies},
		&stubFreightQuoter{connected: false},
		"tenant_default",
	)

	result, err := orch.RunBatch(context.Background(), application.BatchRunRequest{
		ProductIDs:  []string{"p1"},
		PolicyIDs:   []string{"pol1"},
		PriceSource: "suggested_price",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Items[0].SellingPrice != 200.0 {
		t.Fatalf("expected selling price 200 (suggested), got %v", result.Items[0].SellingPrice)
	}
}
