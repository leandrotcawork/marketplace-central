package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/classifications/domain"
)

type Repository interface {
	List(ctx context.Context) ([]domain.Classification, error)
	GetByID(ctx context.Context, id string) (domain.Classification, error)
	Create(ctx context.Context, c domain.Classification) error
	Update(ctx context.Context, c domain.Classification) error
	Delete(ctx context.Context, id string) error
}
