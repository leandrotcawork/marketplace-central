package application_test

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/pricing/application"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type stubFeeScheduleLookup struct {
	fee   pricingports.MarketplaceFees
	found bool
}

func (s *stubFeeScheduleLookup) LookupFee(_ context.Context, _, _, _ string) (pricingports.MarketplaceFees, bool, error) {
	return s.fee, s.found, nil
}

type stubBatchProductProvider struct{}

func (s *stubBatchProductProvider) GetProductsForBatch(_ context.Context, _ []string) ([]pricingports.BatchProduct, error) {
	return []pricingports.BatchProduct{
		{ProductID: "prod-1", CategoryID: "electronics", CostAmount: 100, PriceAmount: 200},
	}, nil
}

type stubBatchPolicyProvider struct {
	override        *float64
	marketplaceCode string
}

func (s *stubBatchPolicyProvider) GetPoliciesForBatch(_ context.Context, _ []string) ([]pricingports.BatchPolicy, error) {
	return []pricingports.BatchPolicy{
		{
			PolicyID:           "pol-1",
			MarketplaceCode:    s.marketplaceCode,
			CommissionPercent:  0.10,
			CommissionOverride: s.override,
			FixedFeeAmount:     0,
			DefaultShipping:    0,
			ShippingProvider:   "fixed",
			MinMarginPercent:   0.05,
		},
	}, nil
}

type stubFreightQuoter struct{}

func (s *stubFreightQuoter) IsConnected(_ context.Context) (bool, error) { return false, nil }
func (s *stubFreightQuoter) QuoteFreight(_ context.Context, _ pricingports.FreightRequest) (map[string]pricingports.FreightResult, error) {
	return nil, nil
}

func ptrF64(f float64) *float64 { return &f }

func runBatch(t *testing.T, override *float64, marketplaceCode string, feeLookup pricingports.FeeScheduleLookup) float64 {
	t.Helper()
	orch := application.NewBatchOrchestrator(
		&stubBatchProductProvider{},
		&stubBatchPolicyProvider{override: override, marketplaceCode: marketplaceCode},
		&stubFreightQuoter{},
		feeLookup,
		"tenant_default",
	)
	result, err := orch.RunBatch(context.Background(), application.BatchRunRequest{
		ProductIDs: []string{"prod-1"},
		PolicyIDs:  []string{"pol-1"},
	})
	if err != nil {
		t.Fatalf("RunBatch: %v", err)
	}
	if len(result.Items) == 0 {
		t.Fatal("expected at least one item")
	}
	return result.Items[0].CommissionAmount
}

func TestBatchOrchestrator_CommissionOverrideTakesPriority(t *testing.T) {
	// override=0.05 wins over feeLookup=0.99 and policy=0.10
	// selling=200, commission=200*0.05=10
	got := runBatch(t, ptrF64(0.05), "shopee", &stubFeeScheduleLookup{fee: pricingports.MarketplaceFees{CommissionPercent: 0.99}, found: true})
	if got != 10 {
		t.Errorf("CommissionOverride priority: expected 10, got %v", got)
	}
}

func TestBatchOrchestrator_FeeLookupUsedWhenNoOverride(t *testing.T) {
	// No override; feeLookup=0.20 wins over policy=0.10
	// selling=200, commission=200*0.20=40
	got := runBatch(t, nil, "mercado_livre", &stubFeeScheduleLookup{fee: pricingports.MarketplaceFees{CommissionPercent: 0.20}, found: true})
	if got != 40 {
		t.Errorf("fee lookup: expected 40, got %v", got)
	}
}

func TestBatchOrchestrator_PolicyRateUsedWhenLookupMisses(t *testing.T) {
	// No override; feeLookup found=false → policy=0.10
	// selling=200, commission=200*0.10=20
	got := runBatch(t, nil, "magalu", &stubFeeScheduleLookup{found: false})
	if got != 20 {
		t.Errorf("policy rate fallback: expected 20, got %v", got)
	}
}

func TestBatchOrchestrator_NilFeeLookupFallsBackToPolicy(t *testing.T) {
	// feeLookup=nil → policy=0.10
	// selling=200, commission=200*0.10=20
	got := runBatch(t, nil, "shopee", nil)
	if got != 20 {
		t.Errorf("nil feeLookup → policy: expected 20, got %v", got)
	}
}
