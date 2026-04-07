package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

// productReaderStub implements ports.ProductReader for testing.
type productReaderStub struct {
	products []domain.Product
	product  domain.Product
	taxonomy []domain.TaxonomyNode
	err      error
}

func (s *productReaderStub) ListProducts(context.Context) ([]domain.Product, error) {
	return s.products, s.err
}

func (s *productReaderStub) GetProduct(_ context.Context, _ string) (domain.Product, error) {
	return s.product, s.err
}

func (s *productReaderStub) SearchProducts(_ context.Context, _ string) ([]domain.Product, error) {
	return s.products, s.err
}

func (s *productReaderStub) ListTaxonomyNodes(_ context.Context) ([]domain.TaxonomyNode, error) {
	return s.taxonomy, s.err
}

func (s *productReaderStub) ListProductsByIDs(_ context.Context, productIDs []string) ([]domain.Product, error) {
	if s.err != nil {
		return nil, s.err
	}
	result := make([]domain.Product, 0, len(productIDs))
	seen := make(map[string]struct{}, len(productIDs))
	for _, id := range productIDs {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		for _, p := range s.products {
			if p.ProductID == id {
				result = append(result, p)
				break
			}
		}
	}
	return result, nil
}

// enrichmentStoreStub implements ports.EnrichmentStore for testing.
type enrichmentStoreStub struct {
	enrichments map[string]domain.ProductEnrichment
	upserted    *domain.ProductEnrichment
	err         error
}

func (s *enrichmentStoreStub) GetEnrichment(_ context.Context, productID string) (domain.ProductEnrichment, error) {
	if s.err != nil {
		return domain.ProductEnrichment{}, s.err
	}
	e, ok := s.enrichments[productID]
	if !ok {
		return domain.ProductEnrichment{ProductID: productID}, nil
	}
	return e, nil
}

func (s *enrichmentStoreStub) UpsertEnrichment(_ context.Context, e domain.ProductEnrichment) error {
	if s.err != nil {
		return s.err
	}
	s.upserted = &e
	if s.enrichments == nil {
		s.enrichments = make(map[string]domain.ProductEnrichment)
	}
	s.enrichments[e.ProductID] = e
	return nil
}

func (s *enrichmentStoreStub) ListEnrichments(_ context.Context, productIDs []string) (map[string]domain.ProductEnrichment, error) {
	if s.err != nil {
		return nil, s.err
	}
	result := make(map[string]domain.ProductEnrichment)
	for _, id := range productIDs {
		if e, ok := s.enrichments[id]; ok {
			result[id] = e
		}
	}
	return result, nil
}

func TestCatalogServiceListProducts(t *testing.T) {
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p-1", SKU: "SKU-001", Name: "Cuba Inox", Status: "active", CostAmount: 123.45},
			{ProductID: "p-2", SKU: "SKU-002", Name: "Torneira Gourmet", Status: "active", CostAmount: 89.90},
		},
	}
	enrichments := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	service := application.NewService(reader, enrichments, "tnt_test")

	products, err := service.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(products) != 2 {
		t.Fatalf("expected 2 products, got %d", len(products))
	}
	if products[0].SKU != "SKU-001" {
		t.Fatalf("expected SKU-001, got %q", products[0].SKU)
	}
}

func TestCatalogServiceAppliesEnrichmentOverlay(t *testing.T) {
	shoppingPrice := 150.00
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p-1", SKU: "SKU-001", Name: "Cuba Inox", SuggestedPrice: &shoppingPrice},
		},
	}
	manualPrice := 199.99
	manualHeight := 30.0
	enrichments := &enrichmentStoreStub{
		enrichments: map[string]domain.ProductEnrichment{
			"p-1": {
				ProductID:            "p-1",
				TenantID:             "tnt_test",
				SuggestedPriceAmount: &manualPrice,
				HeightCM:             &manualHeight,
			},
		},
	}
	service := application.NewService(reader, enrichments, "tnt_test")

	products, err := service.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(products) != 1 {
		t.Fatalf("expected 1 product, got %d", len(products))
	}
	if products[0].SuggestedPrice == nil || *products[0].SuggestedPrice != manualPrice {
		t.Fatalf("expected manual suggested price %v, got %v", manualPrice, products[0].SuggestedPrice)
	}
	if products[0].HeightCM == nil || *products[0].HeightCM != manualHeight {
		t.Fatalf("expected height %v, got %v", manualHeight, products[0].HeightCM)
	}
}

func TestApplyEnrichmentsSetsWeightG(t *testing.T) {
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p-1", SKU: "SKU-001", Name: "Cuba Inox"},
		},
	}
	manualWeight := 1250.0
	enrichments := &enrichmentStoreStub{
		enrichments: map[string]domain.ProductEnrichment{
			"p-1": {
				ProductID: "p-1",
				TenantID:  "tnt_test",
				WeightG:   &manualWeight,
			},
		},
	}
	service := application.NewService(reader, enrichments, "tnt_test")

	products, err := service.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(products) != 1 {
		t.Fatalf("expected 1 product, got %d", len(products))
	}
	if products[0].WeightG == nil || *products[0].WeightG != manualWeight {
		t.Fatalf("expected weight_g %v, got %v", manualWeight, products[0].WeightG)
	}
}

func TestCatalogServiceFallsBackToShoppingSuggestedPrice(t *testing.T) {
	shoppingPrice := 150.00
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p-1", SKU: "SKU-001", Name: "Cuba Inox", SuggestedPrice: &shoppingPrice},
		},
	}
	// Enrichment exists but has nil SuggestedPriceAmount — shopping price should remain.
	enrichments := &enrichmentStoreStub{
		enrichments: map[string]domain.ProductEnrichment{
			"p-1": {
				ProductID:            "p-1",
				TenantID:             "tnt_test",
				SuggestedPriceAmount: nil,
			},
		},
	}
	service := application.NewService(reader, enrichments, "tnt_test")

	products, err := service.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if products[0].SuggestedPrice == nil || *products[0].SuggestedPrice != shoppingPrice {
		t.Fatalf("expected shopping price %v preserved, got %v", shoppingPrice, products[0].SuggestedPrice)
	}
}

func TestCatalogServiceNilSuggestedPriceWhenNeitherExists(t *testing.T) {
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p-1", SKU: "SKU-001", Name: "Cuba Inox", SuggestedPrice: nil},
		},
	}
	enrichments := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	service := application.NewService(reader, enrichments, "tnt_test")

	products, err := service.ListProducts(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if products[0].SuggestedPrice != nil {
		t.Fatalf("expected nil suggested price, got %v", *products[0].SuggestedPrice)
	}
}

func TestCatalogServiceUpsertEnrichmentSetsTenantID(t *testing.T) {
	reader := &productReaderStub{}
	enrichments := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	service := application.NewService(reader, enrichments, "tnt_test")

	price := 99.99
	err := service.UpsertEnrichment(context.Background(), domain.ProductEnrichment{
		ProductID:            "p-1",
		SuggestedPriceAmount: &price,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if enrichments.upserted == nil {
		t.Fatal("expected enrichment to be upserted")
	}
	if enrichments.upserted.TenantID != "tnt_test" {
		t.Fatalf("expected tenant_id tnt_test, got %q", enrichments.upserted.TenantID)
	}
}

func TestCatalogServiceGetProduct(t *testing.T) {
	reader := &productReaderStub{
		product: domain.Product{ProductID: "p-1", SKU: "SKU-001", Name: "Cuba Inox"},
	}
	enrichments := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	service := application.NewService(reader, enrichments, "tnt_test")

	product, err := service.GetProduct(context.Background(), "p-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if product.ProductID != "p-1" {
		t.Fatalf("expected product p-1, got %q", product.ProductID)
	}
}

func TestCatalogServiceSearchProducts(t *testing.T) {
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p-1", SKU: "SKU-001", Name: "Cuba Inox"},
		},
	}
	enrichments := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	service := application.NewService(reader, enrichments, "tnt_test")

	products, err := service.SearchProducts(context.Background(), "cuba")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(products) != 1 {
		t.Fatalf("expected 1 product, got %d", len(products))
	}
}
