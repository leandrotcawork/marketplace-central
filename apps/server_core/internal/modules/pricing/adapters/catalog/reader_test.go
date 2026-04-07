package catalog

import (
	"context"
	"reflect"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type fakeCatalogService struct {
	listProductsByIDsCalls int
	listProductsByIDsIDs   [][]string
	productsByID           map[string]domain.Product
}

func (f *fakeCatalogService) ListProductsByIDs(_ context.Context, ids []string) ([]domain.Product, error) {
	f.listProductsByIDsCalls++
	f.listProductsByIDsIDs = append(f.listProductsByIDsIDs, append([]string(nil), ids...))
	result := make([]domain.Product, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		if product, ok := f.productsByID[id]; ok {
			result = append(result, product)
		}
	}
	return result, nil
}

var _ interface {
	ListProductsByIDs(context.Context, []string) ([]domain.Product, error)
} = (*fakeCatalogService)(nil)
var _ pricingports.ProductProvider = (*Reader)(nil)

func TestReader_GetProductsForBatch_EmptyIDsReturnsEmptyAndSkipsService(t *testing.T) {
	svc := &fakeCatalogService{}
	reader := NewReader(svc)

	products, err := reader.GetProductsForBatch(context.Background(), nil)
	if err != nil {
		t.Fatalf("GetProductsForBatch returned error: %v", err)
	}
	if len(products) != 0 {
		t.Fatalf("expected empty result, got %d products", len(products))
	}
	if svc.listProductsByIDsCalls != 0 {
		t.Fatalf("expected service not to be called, got %d calls", svc.listProductsByIDsCalls)
	}
}

func TestReader_GetProductsForBatch_PreservesMissingAndDeduplicates(t *testing.T) {
	svc := &fakeCatalogService{productsByID: map[string]domain.Product{
		"p1": {ProductID: "p1", SKU: "sku-1"},
		"p3": {ProductID: "p3", SKU: "sku-3"},
	}}
	reader := NewReader(svc)

	products, err := reader.GetProductsForBatch(context.Background(), []string{"p1", "missing", "p3", "p1"})
	if err != nil {
		t.Fatalf("GetProductsForBatch returned error: %v", err)
	}
	want := []pricingports.BatchProduct{{ProductID: "p1", SKU: "sku-1"}, {ProductID: "p3", SKU: "sku-3"}}
	if !reflect.DeepEqual(products, want) {
		t.Fatalf("unexpected products: got %#v want %#v", products, want)
	}
	if got := svc.listProductsByIDsIDs; !reflect.DeepEqual(got, [][]string{{"p1", "missing", "p3", "p1"}}) {
		t.Fatalf("unexpected service IDs: %#v", got)
	}
}
