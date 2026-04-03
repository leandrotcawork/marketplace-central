package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

type Service struct {
	reader      ports.ProductReader
	enrichments ports.EnrichmentStore
}

func NewService(reader ports.ProductReader, enrichments ports.EnrichmentStore) Service {
	return Service{reader: reader, enrichments: enrichments}
}

func (s Service) ListProducts(ctx context.Context) ([]domain.Product, error) {
	return s.reader.ListProducts(ctx)
}
