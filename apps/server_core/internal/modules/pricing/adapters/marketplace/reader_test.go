package marketplace

import (
	"context"
	"reflect"
	"testing"

	marketplacesapp "marketplace-central/apps/server_core/internal/modules/marketplaces/application"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type fakeMarketplacesService struct {
	listPoliciesByIDsCalls int
	listPoliciesByIDsIDs   [][]string
	policiesByID           map[string]domain.Policy
}

func (f *fakeMarketplacesService) ListPoliciesByIDs(_ context.Context, ids []string) ([]domain.Policy, error) {
	f.listPoliciesByIDsCalls++
	f.listPoliciesByIDsIDs = append(f.listPoliciesByIDsIDs, append([]string(nil), ids...))
	result := make([]domain.Policy, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		if policy, ok := f.policiesByID[id]; ok {
			result = append(result, policy)
		}
	}
	return result, nil
}

var _ interface {
	ListPoliciesByIDs(context.Context, []string) ([]domain.Policy, error)
} = (*fakeMarketplacesService)(nil)
var _ pricingports.PolicyProvider = (*Reader)(nil)
var _ = marketplacesapp.Service{}

func TestReader_GetPoliciesForBatch_EmptyIDsReturnsEmptyAndSkipsService(t *testing.T) {
	svc := &fakeMarketplacesService{}
	reader := NewReader(svc)

	policies, err := reader.GetPoliciesForBatch(context.Background(), nil)
	if err != nil {
		t.Fatalf("GetPoliciesForBatch returned error: %v", err)
	}
	if len(policies) != 0 {
		t.Fatalf("expected empty result, got %d policies", len(policies))
	}
	if svc.listPoliciesByIDsCalls != 0 {
		t.Fatalf("expected service not to be called, got %d calls", svc.listPoliciesByIDsCalls)
	}
}

func TestReader_GetPoliciesForBatch_PreservesMissingAndDeduplicates(t *testing.T) {
	svc := &fakeMarketplacesService{policiesByID: map[string]domain.Policy{
		"m1": {PolicyID: "m1", AccountID: "a1"},
		"m3": {PolicyID: "m3", AccountID: "a2"},
	}}
	reader := NewReader(svc)

	policies, err := reader.GetPoliciesForBatch(context.Background(), []string{"m1", "missing", "m3", "m1"})
	if err != nil {
		t.Fatalf("GetPoliciesForBatch returned error: %v", err)
	}
	want := []pricingports.BatchPolicy{{PolicyID: "m1", AccountID: "a1"}, {PolicyID: "m3", AccountID: "a2"}}
	if !reflect.DeepEqual(policies, want) {
		t.Fatalf("unexpected policies: got %#v want %#v", policies, want)
	}
	if got := svc.listPoliciesByIDsIDs; !reflect.DeepEqual(got, [][]string{{"m1", "missing", "m3", "m1"}}) {
		t.Fatalf("unexpected service IDs: %#v", got)
	}
}
