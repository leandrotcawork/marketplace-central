package postgres

import (
	"context"
	"errors"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

var ErrNotImplemented = errors.New("MARKETPLACES_REPOSITORY_NOT_IMPLEMENTED")

type Repository struct{}

var _ ports.Repository = (*Repository)(nil)

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) SaveAccount(context.Context, domain.Account) error {
	return ErrNotImplemented
}

func (r *Repository) SavePolicy(context.Context, domain.Policy) error {
	return ErrNotImplemented
}

func (r *Repository) ListAccounts(context.Context) ([]domain.Account, error) {
	return nil, ErrNotImplemented
}

func (r *Repository) ListPolicies(context.Context) ([]domain.Policy, error) {
	return nil, ErrNotImplemented
}
