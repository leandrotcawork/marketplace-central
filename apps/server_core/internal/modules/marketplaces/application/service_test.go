package application

import (
	"context"
	"reflect"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

type fakeRepository struct {
	listPoliciesByIDsCalls int
	listPoliciesByIDsIDs   [][]string
	policiesByID           map[string]domain.Policy
}

func (f *fakeRepository) SaveAccount(context.Context, domain.Account) error      { return nil }
func (f *fakeRepository) SavePolicy(context.Context, domain.Policy) error        { return nil }
func (f *fakeRepository) ListAccounts(context.Context) ([]domain.Account, error) { return nil, nil }
func (f *fakeRepository) ListPolicies(context.Context) ([]domain.Policy, error)  { return nil, nil }
func (f *fakeRepository) ListPoliciesByIDs(_ context.Context, ids []string) ([]domain.Policy, error) {
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

var _ ports.Repository = (*fakeRepository)(nil)

func TestService_ListPoliciesByIDs_EmptyIDsReturnsEmptyAndSkipsRepository(t *testing.T) {
	repo := &fakeRepository{}
	svc := NewService(repo, "tenant-1")

	policies, err := svc.ListPoliciesByIDs(context.Background(), nil)
	if err != nil {
		t.Fatalf("ListPoliciesByIDs returned error: %v", err)
	}
	if len(policies) != 0 {
		t.Fatalf("expected empty result, got %d policies", len(policies))
	}
	if repo.listPoliciesByIDsCalls != 0 {
		t.Fatalf("expected repository not to be called, got %d calls", repo.listPoliciesByIDsCalls)
	}
}

func TestService_ListPoliciesByIDs_PreservesMissingAndDeduplicates(t *testing.T) {
	repo := &fakeRepository{policiesByID: map[string]domain.Policy{
		"m1": {PolicyID: "m1", AccountID: "a1"},
		"m3": {PolicyID: "m3", AccountID: "a2"},
	}}
	svc := NewService(repo, "tenant-1")

	policies, err := svc.ListPoliciesByIDs(context.Background(), []string{"m1", "missing", "m3", "m1"})
	if err != nil {
		t.Fatalf("ListPoliciesByIDs returned error: %v", err)
	}
	want := []domain.Policy{{PolicyID: "m1", AccountID: "a1"}, {PolicyID: "m3", AccountID: "a2"}}
	if !reflect.DeepEqual(policies, want) {
		t.Fatalf("unexpected policies: got %#v want %#v", policies, want)
	}
	if got := repo.listPoliciesByIDsIDs; !reflect.DeepEqual(got, [][]string{{"m1", "missing", "m3", "m1"}}) {
		t.Fatalf("unexpected repository IDs: %#v", got)
	}
}
