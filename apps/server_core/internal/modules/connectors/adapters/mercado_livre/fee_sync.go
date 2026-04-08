package mercadolivre

import (
	"context"
	"fmt"
	"log/slog"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

// FeeSyncer seeds Mercado Livre fee schedules.
// Phase 3 seeds static defaults only. Live ML Fees API integration deferred to Phase 3.1.
type FeeSyncer struct{}

func NewFeeSyncer() *FeeSyncer { return &FeeSyncer{} }

func (f *FeeSyncer) MarketplaceCode() string { return "mercado_livre" }

// Sync seeds ML default commission rates (Clássico 16%, Premium 22%).
// Replace with actual ML API calls once OAuth is wired.
func (f *FeeSyncer) Sync(ctx context.Context, repo ports.FeeScheduleRepository) (int, error) {
	schedules := []domain.FeeSchedule{
		{
			MarketplaceCode:   "mercado_livre",
			CategoryID:        "default",
			ListingType:       "classico",
			CommissionPercent: 0.16,
			FixedFeeAmount:    0,
			Notes:             "Standard Clássico rate — update per category via ML Fees API",
			Source:            "seeded",
		},
		{
			MarketplaceCode:   "mercado_livre",
			CategoryID:        "default",
			ListingType:       "premium",
			CommissionPercent: 0.22,
			FixedFeeAmount:    0,
			Notes:             "Standard Premium rate (Clássico + 6%)",
			Source:            "seeded",
		},
	}
	if err := repo.UpsertSchedules(ctx, schedules); err != nil {
		return 0, fmt.Errorf("mercado_livre fee seed: %w", err)
	}
	slog.Info("mercado_livre fee schedules seeded", "count", len(schedules))
	return len(schedules), nil
}
