package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

type catalogRepoStub struct {
	products []domain.Product
}

func (s *catalogRepoStub) ListProducts(context.Context) ([]domain.Product, error) {
	return s.products, nil
}

func TestListProductsReturnsTenantProducts(t *testing.T) {
	repo := &catalogRepoStub{
		products: []domain.Product{
			{ProductID: "p-1", TenantID: "tenant_default", SKU: "SKU-001", Name: "Cuba Inox", Status: "active", Cost: 123.45},
		},
	}
	service := application.NewService(repo, "tenant_default")

	products, err := service.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(products) != 1 {
		t.Fatalf("expected 1 product, got %d", len(products))
	}
	if products[0].SKU != "SKU-001" {
		t.Fatalf("expected SKU-001, got %q", products[0].SKU)
	}
}
