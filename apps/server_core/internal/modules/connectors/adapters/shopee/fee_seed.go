package shopee

import (
	"context"
	"fmt"
	"log/slog"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

// FeeSyncer seeds Shopee Brazil static commission rates.
type FeeSyncer struct{}

func NewFeeSyncer() *FeeSyncer { return &FeeSyncer{} }

func (f *FeeSyncer) MarketplaceCode() string { return "shopee" }

// Sync seeds Shopee standard commission rates per category.
// Source: docs/marketplaces/shopee.md — update when Shopee revises rates.
func (f *FeeSyncer) Sync(ctx context.Context, repo ports.FeeScheduleRepository) (int, error) {
	rates := map[string]float64{
		"default":     0.14,
		"electronics": 0.12,
		"fashion":     0.14,
		"home":        0.13,
		"beauty":      0.14,
		"sports":      0.13,
		"toys":        0.14,
		"food":        0.12,
	}
	schedules := make([]domain.FeeSchedule, 0, len(rates))
	for cat, pct := range rates {
		schedules = append(schedules, domain.FeeSchedule{
			MarketplaceCode:   "shopee",
			CategoryID:        cat,
			CommissionPercent: pct,
			Source:            "seeded",
		})
	}
	if err := repo.UpsertSchedules(ctx, schedules); err != nil {
		return 0, fmt.Errorf("shopee fee seed: %w", err)
	}
	slog.Info("shopee fee schedules seeded", "count", len(schedules))
	return len(schedules), nil
}
