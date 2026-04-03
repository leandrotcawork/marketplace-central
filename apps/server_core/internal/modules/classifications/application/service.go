package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"marketplace-central/apps/server_core/internal/modules/classifications/domain"
	"marketplace-central/apps/server_core/internal/modules/classifications/ports"
)

type CreateInput struct {
	Name       string
	AIContext  string
	ProductIDs []string
}

type UpdateInput struct {
	Name       string
	AIContext  string
	ProductIDs []string
}

type Service struct {
	repo     ports.Repository
	tenantID string
}

func NewService(repo ports.Repository, tenantID string) Service {
	return Service{repo: repo, tenantID: tenantID}
}

func (s Service) List(ctx context.Context) ([]domain.Classification, error) {
	return s.repo.List(ctx)
}

func (s Service) GetByID(ctx context.Context, id string) (domain.Classification, error) {
	return s.repo.GetByID(ctx, id)
}

func (s Service) Create(ctx context.Context, input CreateInput) (domain.Classification, error) {
	if strings.TrimSpace(input.Name) == "" {
		return domain.Classification{}, fmt.Errorf("CLASSIFICATIONS_CREATE_NAME_REQUIRED")
	}
	now := time.Now()
	c := domain.Classification{
		ClassificationID: fmt.Sprintf("cls_%d", now.UnixMilli()),
		TenantID:         s.tenantID,
		Name:             strings.TrimSpace(input.Name),
		AIContext:         strings.TrimSpace(input.AIContext),
		ProductIDs:       input.ProductIDs,
		ProductCount:     len(input.ProductIDs),
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := s.repo.Create(ctx, c); err != nil {
		return domain.Classification{}, err
	}
	return c, nil
}

func (s Service) Update(ctx context.Context, id string, input UpdateInput) (domain.Classification, error) {
	if strings.TrimSpace(input.Name) == "" {
		return domain.Classification{}, fmt.Errorf("CLASSIFICATIONS_UPDATE_NAME_REQUIRED")
	}
	c := domain.Classification{
		ClassificationID: id,
		TenantID:         s.tenantID,
		Name:             strings.TrimSpace(input.Name),
		AIContext:         strings.TrimSpace(input.AIContext),
		ProductIDs:       input.ProductIDs,
		ProductCount:     len(input.ProductIDs),
		UpdatedAt:        time.Now(),
	}
	if err := s.repo.Update(ctx, c); err != nil {
		return domain.Classification{}, err
	}
	return c, nil
}

func (s Service) Delete(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
