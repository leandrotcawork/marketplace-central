package magalu

import (
	"context"
	"fmt"
	"log/slog"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/domain"
	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

// FeeSyncer seeds Magalu (Magazine Luiza) static commission rates.
type FeeSyncer struct{}

func NewFeeSyncer() *FeeSyncer { return &FeeSyncer{} }

func (f *FeeSyncer) MarketplaceCode() string { return "magalu" }

// Sync seeds Magalu standard commission rates per category.
// Source: docs/marketplaces/magalu.md — update when Magalu revises rates.
func (f *FeeSyncer) Sync(ctx context.Context, repo ports.FeeScheduleRepository) (int, error) {
	rates := map[string]float64{
		"default":     0.16,
		"electronics": 0.14,
		"appliances":  0.12,
		"fashion":     0.18,
		"furniture":   0.16,
		"sports":      0.16,
		"beauty":      0.16,
	}
	schedules := make([]domain.FeeSchedule, 0, len(rates))
	for cat, pct := range rates {
		schedules = append(schedules, domain.FeeSchedule{
			MarketplaceCode:   "magalu",
			CategoryID:        cat,
			CommissionPercent: pct,
			Source:            "seeded",
		})
	}
	if err := repo.UpsertSchedules(ctx, schedules); err != nil {
		return 0, fmt.Errorf("magalu fee seed: %w", err)
	}
	slog.Info("magalu fee schedules seeded", "count", len(schedules))
	return len(schedules), nil
}
