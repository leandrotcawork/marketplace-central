package application

import (
	"context"
	"reflect"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type fakeProviderRepository struct {
	upserted []domain.ProviderDefinition
	listed   []domain.ProviderDefinition
}

func (f *fakeProviderRepository) UpsertProviderDefinitions(_ context.Context, defs []domain.ProviderDefinition) error {
	f.upserted = append([]domain.ProviderDefinition(nil), defs...)
	return nil
}

func (f *fakeProviderRepository) ListProviderDefinitions(context.Context) ([]domain.ProviderDefinition, error) {
	return append([]domain.ProviderDefinition(nil), f.listed...), nil
}

type fakeProviderRegistry struct {
	defs []domain.ProviderDefinition
}

func (f *fakeProviderRegistry) All() []domain.ProviderDefinition {
	return append([]domain.ProviderDefinition(nil), f.defs...)
}

var _ ports.ProviderDefinitionRepository = (*fakeProviderRepository)(nil)
var _ ports.ProviderRegistry = (*fakeProviderRegistry)(nil)

func TestProviderServiceSeedsAndListsDefinitions(t *testing.T) {
	t.Parallel()

	repo := &fakeProviderRepository{
		listed: []domain.ProviderDefinition{
			{
				ProviderCode: "magalu",
				TenantID:     "system",
				Family:       domain.IntegrationFamilyMarketplace,
				DisplayName:  "Magalu",
				IsActive:     true,
			},
		},
	}
	registry := &fakeProviderRegistry{
		defs: []domain.ProviderDefinition{
			{
				ProviderCode: "mercado_livre",
				TenantID:     "system",
				Family:       domain.IntegrationFamilyMarketplace,
				DisplayName:  "Mercado Livre",
				IsActive:     true,
			},
			{
				ProviderCode: "shopee",
				TenantID:     "system",
				Family:       domain.IntegrationFamilyMarketplace,
				DisplayName:  "Shopee",
				IsActive:     true,
			},
		},
	}

	svc := NewProviderService(repo)

	if err := svc.SeedProviderDefinitions(context.Background(), registry.All()); err != nil {
		t.Fatalf("SeedProviderDefinitions returned error: %v", err)
	}
	if got, want := repo.upserted, registry.defs; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected upserted definitions: got %#v want %#v", got, want)
	}

	defs, err := svc.ListProviderDefinitions(context.Background())
	if err != nil {
		t.Fatalf("ListProviderDefinitions returned error: %v", err)
	}
	if got, want := defs, repo.listed; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected listed definitions: got %#v want %#v", got, want)
	}
}
