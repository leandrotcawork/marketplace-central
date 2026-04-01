package ports

import (
	"context"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

type Repository interface {
	SaveAccount(ctx context.Context, account domain.Account) error
	SavePolicy(ctx context.Context, policy domain.Policy) error
	ListAccounts(ctx context.Context) ([]domain.Account, error)
	ListPolicies(ctx context.Context) ([]domain.Policy, error)
}
