package application

import (
	"context"
	"fmt"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/registry"
)

// FeeScheduleService manages the fee schedule lifecycle.
type FeeScheduleService struct {
	repo ports.FeeScheduleRepository
}

func NewFeeScheduleService(repo ports.FeeScheduleRepository) *FeeScheduleService {
	return &FeeScheduleService{repo: repo}
}

// SeedDefinitions upserts all registered marketplace definitions into the DB.
// Called once at startup from composition/root.go.
func (s *FeeScheduleService) SeedDefinitions(ctx context.Context) error {
	defs := registry.All()
	if err := s.repo.UpsertDefinitions(ctx, defs); err != nil {
		return fmt.Errorf("MARKETPLACES_DEFINITIONS_SEED: %w", err)
	}
	return nil
}

// ListDefinitions returns all active marketplace definitions.
func (s *FeeScheduleService) ListDefinitions(ctx context.Context) ([]domain.MarketplaceDefinition, error) {
	return s.repo.ListDefinitions(ctx)
}

// ListFeeSchedules returns all active fee schedules for a marketplace.
func (s *FeeScheduleService) ListFeeSchedules(ctx context.Context, marketplaceCode string) ([]domain.FeeSchedule, error) {
	return s.repo.ListByMarketplace(ctx, marketplaceCode)
}

// LookupFee returns the effective commission rate using the two-level fallback:
//  1. If a fee_schedules row exists for (code, categoryID) → use it
//  2. If a fee_schedules row exists for (code, "default") → use it
//  3. Returns (zero, false, nil) — caller falls back to policy.CommissionPercent
func (s *FeeScheduleService) LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (domain.FeeSchedule, bool, error) {
	return s.repo.LookupFee(ctx, marketplaceCode, categoryID, listingType)
}

// HasSchedules reports whether any fee rows exist for marketplaceCode.
func (s *FeeScheduleService) HasSchedules(ctx context.Context, marketplaceCode string) (bool, error) {
	return s.repo.HasSchedules(ctx, marketplaceCode)
}

// UpsertSchedules writes fee schedule rows (used by sync/seed adapters).
func (s *FeeScheduleService) UpsertSchedules(ctx context.Context, schedules []domain.FeeSchedule) error {
	return s.repo.UpsertSchedules(ctx, schedules)
}
