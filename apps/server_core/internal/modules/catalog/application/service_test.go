package application

import (
	"context"
	"reflect"
	"testing"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

type fakeProductReader struct {
	listProductsByIDsCalls int
	listProductsByIDsIDs   [][]string
	productsByID           map[string]domain.Product
}

func (f *fakeProductReader) ListProducts(context.Context) ([]domain.Product, error) { return nil, nil }
func (f *fakeProductReader) GetProduct(context.Context, string) (domain.Product, error) {
	return domain.Product{}, nil
}
func (f *fakeProductReader) SearchProducts(context.Context, string) ([]domain.Product, error) {
	return nil, nil
}
func (f *fakeProductReader) ListTaxonomyNodes(context.Context) ([]domain.TaxonomyNode, error) {
	return nil, nil
}
func (f *fakeProductReader) ListProductsByIDs(_ context.Context, ids []string) ([]domain.Product, error) {
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

type fakeEnrichmentStore struct {
	listEnrichmentsCalls int
	listEnrichmentsIDs   [][]string
}

func (f *fakeEnrichmentStore) GetEnrichment(context.Context, string) (domain.ProductEnrichment, error) {
	return domain.ProductEnrichment{}, nil
}
func (f *fakeEnrichmentStore) UpsertEnrichment(context.Context, domain.ProductEnrichment) error {
	return nil
}
func (f *fakeEnrichmentStore) ListEnrichments(_ context.Context, productIDs []string) (map[string]domain.ProductEnrichment, error) {
	f.listEnrichmentsCalls++
	f.listEnrichmentsIDs = append(f.listEnrichmentsIDs, append([]string(nil), productIDs...))
	return map[string]domain.ProductEnrichment{}, nil
}

var _ ports.ProductReader = (*fakeProductReader)(nil)
var _ ports.EnrichmentStore = (*fakeEnrichmentStore)(nil)

func TestService_ListProductsByIDs_EmptyIDsReturnsEmptyAndSkipsReader(t *testing.T) {
	reader := &fakeProductReader{}
	enrichments := &fakeEnrichmentStore{}
	svc := NewService(reader, enrichments, "tenant-1")

	products, err := svc.ListProductsByIDs(context.Background(), nil)
	if err != nil {
		t.Fatalf("ListProductsByIDs returned error: %v", err)
	}
	if len(products) != 0 {
		t.Fatalf("expected empty result, got %d products", len(products))
	}
	if reader.listProductsByIDsCalls != 0 {
		t.Fatalf("expected reader not to be called, got %d calls", reader.listProductsByIDsCalls)
	}
	if enrichments.listEnrichmentsCalls != 0 {
		t.Fatalf("expected enrichments not to be called, got %d calls", enrichments.listEnrichmentsCalls)
	}
}

func TestService_ListProductsByIDs_PreservesMissingAndDeduplicates(t *testing.T) {
	reader := &fakeProductReader{productsByID: map[string]domain.Product{
		"p1": {ProductID: "p1", SKU: "sku-1"},
		"p3": {ProductID: "p3", SKU: "sku-3"},
	}}
	enrichments := &fakeEnrichmentStore{}
	svc := NewService(reader, enrichments, "tenant-1")

	products, err := svc.ListProductsByIDs(context.Background(), []string{"p1", "missing", "p3", "p1"})
	if err != nil {
		t.Fatalf("ListProductsByIDs returned error: %v", err)
	}
	want := []domain.Product{{ProductID: "p1", SKU: "sku-1"}, {ProductID: "p3", SKU: "sku-3"}}
	if !reflect.DeepEqual(products, want) {
		t.Fatalf("unexpected products: got %#v want %#v", products, want)
	}
	if got := reader.listProductsByIDsIDs; !reflect.DeepEqual(got, [][]string{{"p1", "missing", "p3", "p1"}}) {
		t.Fatalf("unexpected reader IDs: %#v", got)
	}
	if got := enrichments.listEnrichmentsIDs; !reflect.DeepEqual(got, [][]string{{"p1", "p3"}}) {
		t.Fatalf("unexpected enrichment IDs: %#v", got)
	}
}
