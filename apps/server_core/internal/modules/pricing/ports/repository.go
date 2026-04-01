package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/pricing/domain"
)

type Repository interface {
	SaveSimulation(ctx context.Context, simulation domain.Simulation) error
	ListSimulations(ctx context.Context) ([]domain.Simulation, error)
}
