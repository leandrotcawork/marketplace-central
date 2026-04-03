package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

type Service struct {
	reader      ports.ProductReader
	enrichments ports.EnrichmentStore
	tenantID    string
}

func NewService(reader ports.ProductReader, enrichments ports.EnrichmentStore, tenantID string) Service {
	return Service{reader: reader, enrichments: enrichments, tenantID: tenantID}
}

func (s Service) ListProducts(ctx context.Context) ([]domain.Product, error) {
	products, err := s.reader.ListProducts(ctx)
	if err != nil {
		return nil, err
	}
	return s.applyEnrichments(ctx, products)
}

func (s Service) GetProduct(ctx context.Context, productID string) (domain.Product, error) {
	product, err := s.reader.GetProduct(ctx, productID)
	if err != nil {
		return domain.Product{}, err
	}
	enriched, err := s.applyEnrichments(ctx, []domain.Product{product})
	if err != nil {
		return domain.Product{}, err
	}
	return enriched[0], nil
}

func (s Service) SearchProducts(ctx context.Context, query string) ([]domain.Product, error) {
	products, err := s.reader.SearchProducts(ctx, query)
	if err != nil {
		return nil, err
	}
	return s.applyEnrichments(ctx, products)
}

func (s Service) ListTaxonomyNodes(ctx context.Context) ([]domain.TaxonomyNode, error) {
	return s.reader.ListTaxonomyNodes(ctx)
}

func (s Service) GetEnrichment(ctx context.Context, productID string) (domain.ProductEnrichment, error) {
	return s.enrichments.GetEnrichment(ctx, productID)
}

func (s Service) UpsertEnrichment(ctx context.Context, enrichment domain.ProductEnrichment) error {
	enrichment.TenantID = s.tenantID
	return s.enrichments.UpsertEnrichment(ctx, enrichment)
}

// applyEnrichments overlays MPC enrichment data onto MetalShopping products.
// Priority: manual enrichment > MetalShopping shopping snapshot > nil.
func (s Service) applyEnrichments(ctx context.Context, products []domain.Product) ([]domain.Product, error) {
	if len(products) == 0 {
		return products, nil
	}
	ids := make([]string, len(products))
	for i, p := range products {
		ids[i] = p.ProductID
	}
	enrichmentMap, err := s.enrichments.ListEnrichments(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i, p := range products {
		e, ok := enrichmentMap[p.ProductID]
		if !ok {
			continue
		}
		if e.HeightCM != nil {
			products[i].HeightCM = e.HeightCM
		}
		if e.WidthCM != nil {
			products[i].WidthCM = e.WidthCM
		}
		if e.LengthCM != nil {
			products[i].LengthCM = e.LengthCM
		}
		if e.SuggestedPriceAmount != nil {
			products[i].SuggestedPrice = e.SuggestedPriceAmount
		}
	}
	return products, nil
}
