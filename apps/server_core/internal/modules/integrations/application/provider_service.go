package application

import (
	"context"
	"errors"
	"strings"

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

func (s *ProviderService) GetProviderDefinition(ctx context.Context, providerCode string) (domain.ProviderDefinition, bool, error) {
	providerCode = strings.TrimSpace(providerCode)
	if providerCode == "" {
		return domain.ProviderDefinition{}, false, errors.New("INTEGRATIONS_PROVIDER_INVALID")
	}

	return s.repo.GetProviderDefinition(ctx, providerCode)
}
