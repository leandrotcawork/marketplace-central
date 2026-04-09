package application

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/integrations/domain"
	"marketplace-central/apps/server_core/internal/modules/integrations/ports"
)

type ProviderService struct {
	repo ports.ProviderDefinitionRepository
}

func NewProviderService(repo ports.ProviderDefinitionRepository) *ProviderService {
	return &ProviderService{repo: repo}
}

func (s *ProviderService) SeedProviderDefinitions(ctx context.Context, defs []domain.ProviderDefinition) error {
	return s.repo.UpsertProviderDefinitions(ctx, defs)
}

func (s *ProviderService) ListProviderDefinitions(ctx context.Context) ([]domain.ProviderDefinition, error) {
	return s.repo.ListProviderDefinitions(ctx)
}
