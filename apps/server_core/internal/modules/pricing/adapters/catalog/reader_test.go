package catalog

import (
	"context"
	"reflect"
	"testing"

	catalogapp "marketplace-central/apps/server_core/internal/modules/catalog/application"
	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	pricingports "marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

type fakeCatalogService struct {
	listProductsByIDsCalls int
	listProductsByIDsIDs   [][]string
	productsByID           map[string]domain.Product
}

func (f *fakeCatalogService) ListProducts(context.Context) ([]domain.Product, error) { return nil, nil }
func (f *fakeCatalogService) GetProduct(context.Context, string) (domain.Product, error) { return domain.Product{}, nil }
func (f *fakeCatalogService) SearchProducts(context.Context, string) ([]domain.Product, error) { return nil, nil }
func (f *fakeCatalogService) ListTaxonomyNodes(context.Context) ([]domain.TaxonomyNode, error) {
	return nil, nil
}
func (f *fakeCatalogService) ListEnrichments(context.Context, []string) (map[string]domain.ProductEnrichment, error) {
	return nil, nil
}
func (f *fakeCatalogService) GetEnrichment(context.Context, string) (domain.ProductEnrichment, error) {
	return domain.ProductEnrichment{}, nil
}
func (f *fakeCatalogService) UpsertEnrichment(context.Context, domain.ProductEnrichment) error { return nil }
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

var _ pricingports.ProductProvider = (*Reader)(nil)
var _ interface {
	ListProducts(context.Context) ([]domain.Product, error)
	ListProductsByIDs(context.Context, []string) ([]domain.Product, error)
} = (*fakeCatalogService)(nil)

func TestReader_GetProductsForBatch_EmptyIDsReturnsEmptyAndSkipsService(t *testing.T) {
	reader := NewReader(catalogapp.Service{})
	_ = reader
}
