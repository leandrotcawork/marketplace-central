package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
)

type ProviderDefinitionRepository interface {
	UpsertProviderDefinitions(ctx context.Context, defs []domain.ProviderDefinition) error
	ListProviderDefinitions(ctx context.Context) ([]domain.ProviderDefinition, error)
	GetProviderDefinition(ctx context.Context, providerCode string) (domain.ProviderDefinition, bool, error)
}

// ProviderRegistry exposes the static provider catalog owned by the integrations module.
type ProviderRegistry interface {
	All() []domain.ProviderDefinition
}
