package ports

import (
	"context"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
)

// FeeScheduleRepository persists and queries marketplace fee schedules.
type FeeScheduleRepository interface {
	// UpsertSchedules inserts or replaces fee schedule rows.
	UpsertSchedules(ctx context.Context, schedules []domain.FeeSchedule) error

	// LookupFee returns the best matching fee schedule for the given parameters.
	// Returns (zero-value, false, nil) when no row is found.
	// categoryID "default" is the fallback catch-all row.
	LookupFee(ctx context.Context, marketplaceCode, categoryID, listingType string) (domain.FeeSchedule, bool, error)

	// ListByMarketplace returns all fee schedules for one marketplace.
	ListByMarketplace(ctx context.Context, marketplaceCode string) ([]domain.FeeSchedule, error)

	// UpsertDefinitions seeds or updates marketplace_definitions rows.
	UpsertDefinitions(ctx context.Context, defs []domain.MarketplaceDefinition) error

	// ListDefinitions returns all active marketplace definitions.
	ListDefinitions(ctx context.Context) ([]domain.MarketplaceDefinition, error)

	// HasSchedules returns true if any fee schedule rows exist for marketplaceCode.
	HasSchedules(ctx context.Context, marketplaceCode string) (bool, error)
}
