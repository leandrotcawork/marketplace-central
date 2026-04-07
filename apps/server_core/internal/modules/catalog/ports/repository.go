package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

// ProductReader reads product data from MetalShopping (read-only).
type ProductReader interface {
	ListProducts(ctx context.Context) ([]domain.Product, error)
	ListProductsByIDs(ctx context.Context, productIDs []string) ([]domain.Product, error)
	GetProduct(ctx context.Context, productID string) (domain.Product, error)
	SearchProducts(ctx context.Context, query string) ([]domain.Product, error)
	ListTaxonomyNodes(ctx context.Context) ([]domain.TaxonomyNode, error)
}

// EnrichmentStore reads and writes product enrichments in MPC's own database.
type EnrichmentStore interface {
	GetEnrichment(ctx context.Context, productID string) (domain.ProductEnrichment, error)
	UpsertEnrichment(ctx context.Context, enrichment domain.ProductEnrichment) error
	ListEnrichments(ctx context.Context, productIDs []string) (map[string]domain.ProductEnrichment, error)
}
