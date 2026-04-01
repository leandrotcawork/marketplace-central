package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/catalog/domain"
)

type Repository interface {
	ListProducts(ctx context.Context) ([]domain.Product, error)
}
