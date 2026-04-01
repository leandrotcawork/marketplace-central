package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

type catalogRepoStub struct {
	saved domain.Product
}

func (s *catalogRepoStub) SaveProduct(_ context.Context, product domain.Product) error {
	s.saved = product
	return nil
}

func (s *catalogRepoStub) ListProducts(context.Context) ([]domain.Product, error) {
	return nil, nil
}

func TestCreateProductPersistsTenantReadyEntity(t *testing.T) {
	repo := &catalogRepoStub{}
	service := application.NewService(repo, "tenant_default")

	product, err := service.CreateProduct(context.Background(), application.CreateProductInput{
		SKU:  "SKU-001",
		Name: "Cuba Inox",
		Cost: 123.45,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if product.TenantID != "tenant_default" {
		t.Fatalf("expected tenant_default, got %q", product.TenantID)
	}

	if repo.saved.SKU != "SKU-001" {
		t.Fatalf("expected saved sku SKU-001, got %q", repo.saved.SKU)
	}
}
