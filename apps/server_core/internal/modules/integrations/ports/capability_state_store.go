package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type CapabilityStateStore interface {
	UpsertCapabilityStates(ctx context.Context, states []domain.CapabilityState) error
	ListCapabilityStates(ctx context.Context, installationID string) ([]domain.CapabilityState, error)
}
