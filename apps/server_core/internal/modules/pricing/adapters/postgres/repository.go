package postgres

import (
	"context"
	"errors"

	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
	"marketplace-central/apps/server_core/internal/modules/pricing/ports"
)

var ErrNotImplemented = errors.New("PRICING_REPOSITORY_NOT_IMPLEMENTED")

type Repository struct{}

var _ ports.Repository = (*Repository)(nil)

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) SaveSimulation(context.Context, domain.Simulation) error {
	return ErrNotImplemented
}

func (r *Repository) ListSimulations(context.Context) ([]domain.Simulation, error) {
	return nil, ErrNotImplemented
}
