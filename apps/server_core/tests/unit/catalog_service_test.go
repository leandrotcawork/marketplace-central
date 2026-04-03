package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

type catalogReaderStub struct {
	products []domain.Product
}

func (s *catalogReaderStub) ListProducts(context.Context) ([]domain.Product, error) {
	return s.products, nil
}

func (s *catalogReaderStub) GetProduct(_ context.Context, productID string) (domain.Product, error) {
	for _, p := range s.products {
		if p.ProductID == productID {
			return p, nil
		}
	}
	return domain.Product{}, nil
}

func (s *catalogReaderStub) SearchProducts(_ context.Context, _ string) ([]domain.Product, error) {
	return s.products, nil
}

func (s *catalogReaderStub) ListTaxonomyNodes(_ context.Context) ([]domain.TaxonomyNode, error) {
	return nil, nil
}

type catalogEnrichmentStub struct{}

func (s catalogEnrichmentStub) GetEnrichment(_ context.Context, productID string) (domain.ProductEnrichment, error) {
	return domain.ProductEnrichment{ProductID: productID}, nil
}

func (s catalogEnrichmentStub) UpsertEnrichment(_ context.Context, _ domain.ProductEnrichment) error {
	return nil
}

func (s catalogEnrichmentStub) ListEnrichments(_ context.Context, _ []string) (map[string]domain.ProductEnrichment, error) {
	return make(map[string]domain.ProductEnrichment), nil
}

func TestListProductsReturnsTenantProducts(t *testing.T) {
	reader := &catalogReaderStub{
		products: []domain.Product{
			{ProductID: "p-1", SKU: "SKU-001", Name: "Cuba Inox", Status: "active", CostAmount: 123.45},
		},
	}
	service := application.NewService(reader, catalogEnrichmentStub{})

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
