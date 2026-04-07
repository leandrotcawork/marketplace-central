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
	connected        bool
	quoteErr         error
	resultsByProduct map[string]pricingports.FreightResult
	quoteCalls       []pricingports.FreightRequest
}

func (s *stubFreightQuoter) IsConnected(_ context.Context) (bool, error) {
	return s.connected, nil
}

func (s *stubFreightQuoter) QuoteFreight(_ context.Context, req pricingports.FreightRequest) (map[string]pricingports.FreightResult, error) {
	s.quoteCalls = append(s.quoteCalls, req)
	if s.quoteErr != nil {
		return nil, s.quoteErr
	}
	if len(req.Products) == 0 {
		return map[string]pricingports.FreightResult{}, nil
	}

	productID := req.Products[0].ProductID
	if s.resultsByProduct != nil {
		if result, ok := s.resultsByProduct[productID]; ok {
			return map[string]pricingports.FreightResult{productID: result}, nil
		}
	}

	return map[string]pricingports.FreightResult{
		productID: {Amount: 0, Source: "me_error"},
	}, nil
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
	if p1Result.Status != "warning" {
		t.Fatalf("expected warning, got %q", p1Result.Status)
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

func TestBatchOrchestratorQuotesFreightPerProductAndUsesReturnedAmounts(t *testing.T) {
	products := []pricingports.BatchProduct{
		{
			ProductID:   "p1",
			CostAmount:  80,
			PriceAmount: 150,
			HeightCM:    floatPtr(10),
			WidthCM:     floatPtr(20),
			LengthCM:    floatPtr(30),
			WeightG:     floatPtr(1000),
		},
		{
			ProductID:   "p2",
			CostAmount:  60,
			PriceAmount: 140,
			HeightCM:    floatPtr(12),
			WidthCM:     floatPtr(22),
			LengthCM:    floatPtr(32),
			WeightG:     floatPtr(1200),
		},
	}
	policies := []pricingports.BatchPolicy{
		{PolicyID: "pol-me", CommissionPercent: 0.16, FixedFeeAmount: 0, DefaultShipping: 0, MinMarginPercent: 0.10, ShippingProvider: "melhor_envio"},
	}
	freight := &stubFreightQuoter{
		connected: true,
		resultsByProduct: map[string]pricingports.FreightResult{
			"p1": {Amount: 5.50, Source: "melhor_envio"},
			"p2": {Amount: 12.75, Source: "melhor_envio"},
		},
	}

	orch := application.NewBatchOrchestrator(
		&stubProductProvider{products: products},
		&stubPolicyProvider{policies: policies},
		freight,
		"tenant_default",
	)

	result, err := orch.RunBatch(context.Background(), application.BatchRunRequest{
		ProductIDs:  []string{"p1", "p2"},
		PolicyIDs:   []string{"pol-me"},
		OriginCEP:   "01310100",
		DestCEP:     "30140071",
		PriceSource: "my_price",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(freight.quoteCalls) != 2 {
		t.Fatalf("expected 2 freight quote calls, got %d", len(freight.quoteCalls))
	}

	p1 := batchItemByIDs(t, result.Items, "p1", "pol-me")
	p2 := batchItemByIDs(t, result.Items, "p2", "pol-me")

	if p1.FreightAmount != 5.50 {
		t.Fatalf("expected p1 freight 5.50, got %v", p1.FreightAmount)
	}
	if p2.FreightAmount != 12.75 {
		t.Fatalf("expected p2 freight 12.75, got %v", p2.FreightAmount)
	}
	if p1.FreightAmount == p2.FreightAmount {
		t.Fatalf("expected different freight amounts per product, got %v and %v", p1.FreightAmount, p2.FreightAmount)
	}
}

func TestBatchOrchestratorMarksMELoadIssuesAsCritical(t *testing.T) {
	products := []pricingports.BatchProduct{
		{
			ProductID:   "p1",
			CostAmount:  20,
			PriceAmount: 100,
			HeightCM:    floatPtr(10),
			WidthCM:     floatPtr(20),
			LengthCM:    floatPtr(30),
			WeightG:     floatPtr(1000),
		},
	}
	policies := []pricingports.BatchPolicy{
		{PolicyID: "pol-me", CommissionPercent: 0.10, FixedFeeAmount: 0, DefaultShipping: 0, MinMarginPercent: 0.10, ShippingProvider: "melhor_envio"},
	}
	freight := &stubFreightQuoter{connected: false}

	orch := application.NewBatchOrchestrator(
		&stubProductProvider{products: products},
		&stubPolicyProvider{policies: policies},
		freight,
		"tenant_default",
	)

	result, err := orch.RunBatch(context.Background(), application.BatchRunRequest{
		ProductIDs:  []string{"p1"},
		PolicyIDs:   []string{"pol-me"},
		OriginCEP:   "01310100",
		DestCEP:     "30140071",
		PriceSource: "my_price",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(freight.quoteCalls) != 0 {
		t.Fatalf("expected no freight quote calls when disconnected, got %d", len(freight.quoteCalls))
	}

	item := batchItemByIDs(t, result.Items, "p1", "pol-me")
	if item.FreightSource != "me_not_connected" {
		t.Fatalf("expected me_not_connected, got %q", item.FreightSource)
	}
	if item.Status != "critical" {
		t.Fatalf("expected critical status, got %q", item.Status)
	}
}

func TestBatchOrchestratorMarksMEQuoteErrorsAsCritical(t *testing.T) {
	products := []pricingports.BatchProduct{
		{
			ProductID:   "p1",
			CostAmount:  20,
			PriceAmount: 100,
			HeightCM:    floatPtr(10),
			WidthCM:     floatPtr(20),
			LengthCM:    floatPtr(30),
			WeightG:     floatPtr(1000),
		},
	}
	policies := []pricingports.BatchPolicy{
		{PolicyID: "pol-me", CommissionPercent: 0.10, FixedFeeAmount: 0, DefaultShipping: 0, MinMarginPercent: 0.10, ShippingProvider: "melhor_envio"},
	}
	freight := &stubFreightQuoter{
		connected: true,
		quoteErr:  context.Canceled,
	}

	orch := application.NewBatchOrchestrator(
		&stubProductProvider{products: products},
		&stubPolicyProvider{policies: policies},
		freight,
		"tenant_default",
	)

	result, err := orch.RunBatch(context.Background(), application.BatchRunRequest{
		ProductIDs:  []string{"p1"},
		PolicyIDs:   []string{"pol-me"},
		OriginCEP:   "01310100",
		DestCEP:     "30140071",
		PriceSource: "my_price",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	item := batchItemByIDs(t, result.Items, "p1", "pol-me")
	if item.FreightSource != "me_error" {
		t.Fatalf("expected me_error, got %q", item.FreightSource)
	}
	if item.Status != "critical" {
		t.Fatalf("expected critical status, got %q", item.Status)
	}
}

func TestBatchOrchestratorMarksMissingDimensionsAsCritical(t *testing.T) {
	products := []pricingports.BatchProduct{
		{
			ProductID:   "p1",
			CostAmount:  20,
			PriceAmount: 100,
			HeightCM:    floatPtr(10),
			WidthCM:     floatPtr(20),
			LengthCM:    floatPtr(30),
			WeightG:     nil,
		},
	}
	policies := []pricingports.BatchPolicy{
		{PolicyID: "pol-me", CommissionPercent: 0.10, FixedFeeAmount: 0, DefaultShipping: 0, MinMarginPercent: 0.10, ShippingProvider: "melhor_envio"},
	}
	freight := &stubFreightQuoter{connected: true}

	orch := application.NewBatchOrchestrator(
		&stubProductProvider{products: products},
		&stubPolicyProvider{policies: policies},
		freight,
		"tenant_default",
	)

	result, err := orch.RunBatch(context.Background(), application.BatchRunRequest{
		ProductIDs:  []string{"p1"},
		PolicyIDs:   []string{"pol-me"},
		OriginCEP:   "01310100",
		DestCEP:     "30140071",
		PriceSource: "my_price",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(freight.quoteCalls) != 0 {
		t.Fatalf("expected no freight quote calls for missing dimensions, got %d", len(freight.quoteCalls))
	}

	item := batchItemByIDs(t, result.Items, "p1", "pol-me")
	if item.FreightSource != "no_dimensions" {
		t.Fatalf("expected no_dimensions, got %q", item.FreightSource)
	}
	if item.Status != "critical" {
		t.Fatalf("expected critical status, got %q", item.Status)
	}
}

func TestBatchOrchestratorMarksCriticalWhenFreightMissingEvenIfMarginIsHigh(t *testing.T) {
	products := []pricingports.BatchProduct{
		{
			ProductID:   "p1",
			CostAmount:  20,
			PriceAmount: 100,
			HeightCM:    floatPtr(10),
			WidthCM:     floatPtr(20),
			LengthCM:    floatPtr(30),
			WeightG:     floatPtr(1000),
		},
	}
	policies := []pricingports.BatchPolicy{
		{PolicyID: "pol-me", CommissionPercent: 0.05, FixedFeeAmount: 0, DefaultShipping: 0, MinMarginPercent: 0.10, ShippingProvider: "melhor_envio"},
	}
	freight := &stubFreightQuoter{
		connected: true,
		quoteErr:  context.Canceled,
	}

	orch := application.NewBatchOrchestrator(
		&stubProductProvider{products: products},
		&stubPolicyProvider{policies: policies},
		freight,
		"tenant_default",
	)

	result, err := orch.RunBatch(context.Background(), application.BatchRunRequest{
		ProductIDs:  []string{"p1"},
		PolicyIDs:   []string{"pol-me"},
		OriginCEP:   "01310100",
		DestCEP:     "30140071",
		PriceSource: "my_price",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	item := batchItemByIDs(t, result.Items, "p1", "pol-me")
	if item.MarginPercent <= 0.10 {
		t.Fatalf("test setup broken: expected margin above threshold, got %v", item.MarginPercent)
	}
	if item.Status != "critical" {
		t.Fatalf("expected critical status when freight is missing, got %q", item.Status)
	}
}

func batchItemByIDs(t *testing.T, items []application.BatchSimulationItem, productID, policyID string) application.BatchSimulationItem {
	t.Helper()
	for _, item := range items {
		if item.ProductID == productID && item.PolicyID == policyID {
			return item
		}
	}
	t.Fatalf("missing item for product %s policy %s", productID, policyID)
	return application.BatchSimulationItem{}
}

func floatPtr(v float64) *float64 {
	return &v
}
