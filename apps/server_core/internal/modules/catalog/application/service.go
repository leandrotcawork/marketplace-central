package application

import (
	"context"
	"errors"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
	"marketplace-central/apps/server_core/internal/modules/catalog/ports"
)

type CreateProductInput struct {
	SKU  string
	Name string
	Cost float64
}

type Service struct {
	repo     ports.Repository
	tenantID string
}

func NewService(repo ports.Repository, tenantID string) Service {
	return Service{repo: repo, tenantID: tenantID}
}

func (s Service) CreateProduct(ctx context.Context, input CreateProductInput) (domain.Product, error) {
	if input.SKU == "" || input.Name == "" {
		return domain.Product{}, errors.New("CATALOG_PRODUCT_INVALID")
	}
	product := domain.Product{
		ProductID: input.SKU,
		TenantID:  s.tenantID,
		SKU:       input.SKU,
		Name:      input.Name,
		Status:    "active",
		Cost:      input.Cost,
	}
	return product, s.repo.SaveProduct(ctx, product)
}

func (s Service) ListProducts(ctx context.Context) ([]domain.Product, error) {
	return s.repo.ListProducts(ctx)
}
