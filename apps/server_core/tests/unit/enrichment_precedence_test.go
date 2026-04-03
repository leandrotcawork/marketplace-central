package unit

import (
	"context"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

func TestEnrichmentPrecedenceManualOverShopping(t *testing.T) {
	shoppingPrice := 80.0
	manualPrice := 75.0

	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p1", SuggestedPrice: &shoppingPrice},
		},
	}
	store := &enrichmentStoreStub{
		enrichments: map[string]domain.ProductEnrichment{
			"p1": {ProductID: "p1", TenantID: "t1", SuggestedPriceAmount: &manualPrice},
		},
	}
	svc := application.NewService(reader, store, "t1")
	products, _ := svc.ListProducts(context.Background())

	if *products[0].SuggestedPrice != 75.0 {
		t.Fatalf("manual enrichment should override shopping price: got %v", *products[0].SuggestedPrice)
	}
}

func TestEnrichmentPrecedenceShoppingFallback(t *testing.T) {
	shoppingPrice := 80.0

	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p1", SuggestedPrice: &shoppingPrice},
		},
	}
	store := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	svc := application.NewService(reader, store, "t1")
	products, _ := svc.ListProducts(context.Background())

	if *products[0].SuggestedPrice != 80.0 {
		t.Fatalf("shopping price should be used when no manual enrichment: got %v", *products[0].SuggestedPrice)
	}
}

func TestEnrichmentPrecedenceNilWhenNeitherExists(t *testing.T) {
	reader := &productReaderStub{
		products: []domain.Product{
			{ProductID: "p1", SuggestedPrice: nil},
		},
	}
	store := &enrichmentStoreStub{enrichments: map[string]domain.ProductEnrichment{}}
	svc := application.NewService(reader, store, "t1")
	products, _ := svc.ListProducts(context.Background())

	if products[0].SuggestedPrice != nil {
		t.Fatalf("suggested price should be nil when neither source has data")
	}
}
