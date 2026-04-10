package application

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type fakeProviderRepository struct {
	upserted       []domain.ProviderDefinition
	listed         []domain.ProviderDefinition
	lookupByCode   string
	getResult      domain.ProviderDefinition
	getFound       bool
	getErr         error
	returnGetError bool
}

func (f *fakeProviderRepository) UpsertProviderDefinitions(_ context.Context, defs []domain.ProviderDefinition) error {
	f.upserted = append([]domain.ProviderDefinition(nil), defs...)
	return nil
}

func (f *fakeProviderRepository) ListProviderDefinitions(context.Context) ([]domain.ProviderDefinition, error) {
	return append([]domain.ProviderDefinition(nil), f.listed...), nil
}

func (f *fakeProviderRepository) GetProviderDefinition(_ context.Context, providerCode string) (domain.ProviderDefinition, bool, error) {
	f.lookupByCode = providerCode
	if f.returnGetError {
		return domain.ProviderDefinition{}, false, f.getErr
	}
	if f.getFound {
		return f.getResult, true, nil
	}
	return domain.ProviderDefinition{}, false, nil
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

func TestGetProviderDefinitionReturnsRequestedProvider(t *testing.T) {
	t.Parallel()

	repo := &fakeProviderRepository{
		getFound: true,
		getResult: domain.ProviderDefinition{
			ProviderCode: "mercado_livre",
			TenantID:     "system",
			Family:       domain.IntegrationFamilyMarketplace,
			DisplayName:  "Mercado Livre",
			IsActive:     true,
		},
	}
	svc := NewProviderService(repo)

	got, found, err := svc.GetProviderDefinition(context.Background(), "  mercado_livre  ")
	if err != nil {
		t.Fatalf("GetProviderDefinition returned error: %v", err)
	}
	if !found {
		t.Fatal("GetProviderDefinition returned found=false")
	}
	if got.ProviderCode != "mercado_livre" {
		t.Fatalf("unexpected provider code: got %q want %q", got.ProviderCode, "mercado_livre")
	}
	if got.DisplayName != "Mercado Livre" {
		t.Fatalf("unexpected provider display name: got %q want %q", got.DisplayName, "Mercado Livre")
	}
	if got, want := repo.lookupByCode, "mercado_livre"; got != want {
		t.Fatalf("unexpected lookup code: got %q want %q", got, want)
	}
}

func TestGetProviderDefinitionRejectsMissingProviderCode(t *testing.T) {
	t.Parallel()

	svc := NewProviderService(&fakeProviderRepository{})

	_, found, err := svc.GetProviderDefinition(context.Background(), "   ")
	if err == nil {
		t.Fatal("GetProviderDefinition returned nil error")
	}
	if got, want := err.Error(), "INTEGRATIONS_PROVIDER_INVALID"; got != want {
		t.Fatalf("unexpected error: got %q want %q", got, want)
	}
	if found {
		t.Fatal("GetProviderDefinition returned found=true")
	}
}

func TestGetProviderDefinitionReturnsMissingProviderAsNotFound(t *testing.T) {
	t.Parallel()

	repo := &fakeProviderRepository{
		getFound: false,
	}
	svc := NewProviderService(repo)

	got, found, err := svc.GetProviderDefinition(context.Background(), "unknown_provider")
	if err != nil {
		t.Fatalf("GetProviderDefinition returned error: %v", err)
	}
	if found {
		t.Fatal("GetProviderDefinition returned found=true")
	}
	if got.ProviderCode != "" || got.TenantID != "" || got.DisplayName != "" || got.IsActive {
		t.Fatalf("unexpected provider definition: got %#v want zero value", got)
	}
	if got, want := repo.lookupByCode, "unknown_provider"; got != want {
		t.Fatalf("unexpected lookup code: got %q want %q", got, want)
	}
}

func TestGetProviderDefinitionPropagatesRepositoryError(t *testing.T) {
	t.Parallel()

	repo := &fakeProviderRepository{
		returnGetError: true,
		getErr:         errors.New("repository unavailable"),
	}
	svc := NewProviderService(repo)

	got, found, err := svc.GetProviderDefinition(context.Background(), "mercado_livre")
	if err == nil {
		t.Fatal("GetProviderDefinition returned nil error")
	}
	if got.ProviderCode != "" || got.TenantID != "" || got.DisplayName != "" || got.IsActive {
		t.Fatalf("unexpected provider definition: got %#v want zero value", got)
	}
	if found {
		t.Fatal("GetProviderDefinition returned found=true")
	}
	if !errors.Is(err, repo.getErr) {
		t.Fatalf("unexpected error: got %v want %v", err, repo.getErr)
	}
}
