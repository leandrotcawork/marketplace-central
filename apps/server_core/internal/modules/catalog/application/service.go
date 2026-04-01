package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

type Service struct {
	repo     ports.Repository
	tenantID string
}

func NewService(repo ports.Repository, tenantID string) Service {
	return Service{repo: repo, tenantID: tenantID}
}

func (s Service) ListProducts(ctx context.Context) ([]domain.Product, error) {
	return s.repo.ListProducts(ctx)
}
