package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

type Repository interface {
	SaveProduct(ctx context.Context, product domain.Product) error
	ListProducts(ctx context.Context) ([]domain.Product, error)
}
