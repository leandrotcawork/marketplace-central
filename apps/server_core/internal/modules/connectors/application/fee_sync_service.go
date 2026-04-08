package application

import (
	"context"
	"fmt"
	"log/slog"

	"marketplace-central/apps/server_core/internal/modules/marketplaces/ports"
)

// FeeSyncService orchestrates fee schedule seeding and syncing at startup.
type FeeSyncService struct {
	syncers []ports.FeeScheduleSyncer
	repo    ports.FeeScheduleRepository
}

func NewFeeSyncService(repo ports.FeeScheduleRepository, syncers ...ports.FeeScheduleSyncer) *FeeSyncService {
	return &FeeSyncService{syncers: syncers, repo: repo}
}

// SeedAll runs each syncer. Skips if rows already exist (startup idempotency).
func (s *FeeSyncService) SeedAll(ctx context.Context) {
	for _, syncer := range s.syncers {
		code := syncer.MarketplaceCode()
		has, err := s.repo.HasSchedules(ctx, code)
		if err != nil {
			slog.Error("fee sync check failed", "marketplace", code, "err", err)
			continue
		}
		if has {
			slog.Info("fee schedules already seeded, skipping", "marketplace", code)
			continue
		}
		n, err := syncer.Sync(ctx, s.repo)
		if err != nil {
			slog.Error("fee sync failed", "marketplace", code, "err", err)
			continue
		}
		slog.Info("fee sync complete", "marketplace", code, "rows", n)
	}
}

// SeedMarketplace runs the syncer for one marketplace.
// force=false skips when rows exist (startup), force=true always runs (admin reseed).
func (s *FeeSyncService) SeedMarketplace(ctx context.Context, marketplaceCode string, force bool) (int, error) {
	for _, syncer := range s.syncers {
		if syncer.MarketplaceCode() != marketplaceCode {
			continue
		}
		if !force {
			has, err := s.repo.HasSchedules(ctx, marketplaceCode)
			if err != nil {
				return 0, err
			}
			if has {
				return 0, nil
			}
		}
		return syncer.Sync(ctx, s.repo)
	}
	return 0, fmt.Errorf("CONNECTORS_FEE_SYNC_UNKNOWN_MARKETPLACE: %s", marketplaceCode)
}
