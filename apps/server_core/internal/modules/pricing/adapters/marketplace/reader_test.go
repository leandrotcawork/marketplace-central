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

func (f *fakeMarketplacesService) CreateAccount(context.Context, marketplacesapp.CreateAccountInput) (domain.Account, error) {
	return domain.Account{}, nil
}
func (f *fakeMarketplacesService) CreatePolicy(context.Context, marketplacesapp.CreatePolicyInput) (domain.Policy, error) {
	return domain.Policy{}, nil
}
func (f *fakeMarketplacesService) ListAccounts(context.Context) ([]domain.Account, error) { return nil, nil }
func (f *fakeMarketplacesService) ListPolicies(context.Context) ([]domain.Policy, error) { return nil, nil }
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

var _ pricingports.PolicyProvider = (*Reader)(nil)

func TestReader_GetPoliciesForBatch_EmptyIDsReturnsEmptyAndSkipsService(t *testing.T) {
	reader := NewReader(marketplacesapp.Service{})
	_ = reader
}
